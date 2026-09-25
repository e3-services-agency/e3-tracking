/**
 * comparison.service tests (T-1-09 fix round, ERROR 1 and ERROR 2).
 *
 * ERROR 1: `runComparison` used to pass through whatever `event_id`/`variant_id` was stored on an
 * `Observation` at import time, so an observation pasted *before* its Event/Variant definitions
 * existed stayed unresolved forever, even after the definitions were created — every recompute is
 * supposed to re-resolve against the *current* definitions (`comparison.service.ts`'s module
 * comment, D-21 "clearing a finding means fixing definitions"). Reproduced here with the plan's own
 * ordering: paste `customer-events-export.json` into an empty project (nothing can resolve yet),
 * *then* apply `data-mapping.json` (creates the six events/variants/mappings), then run comparison —
 * all 19 observations must resolve and the fixture's `type_mismatch` findings must appear, with no
 * `missing_event`/`unexpected_event` for the six mapped types.
 *
 * ERROR 2: findings must carry the `qa_run_id` of the run whose observation produced them
 * (observation-level kinds), or `null` for project-level kinds (`missing_event`,
 * `shape_inconsistent`) that are not attributable to a single run — see `comparison.service.ts`'s
 * module comment for the exact semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { previewCustomerEventsExport, applyCustomerEventsExport } from './customerEventsExportImport.service';
import { runComparison } from './comparison.service';
import { createEventResolver } from './eventResolution';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const eventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);
const dataManagerEventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-manager-events.json'), 'utf-8')
);

const MAPPED_EVENT_TYPES = ['cart_update', 'checkout', 'purchase', 'purchase_item', 'view_category', 'view_item'];

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

/** Retypes per the plan's engine-test definition (same as `definitionVsObservations.test.ts`'s `buildDefinition`). */
function retypeForTypeMismatches(): void {
  for (const name of ['total_price', 'price']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number', data_formats_json: ['money'] });
  }
  for (const name of ['quantity', 'total_quantity', 'stock_level']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number' });
  }
  const isNewExisting = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'is_new');
  if (isNewExisting) {
    PropertyDAL.updateProperty(projectId, isNewExisting.id, { data_type: 'boolean' });
  } else {
    const created = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'is_new', data_type: 'boolean' });
    const event = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase_item');
    if (event) EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: created.id, role: 'normal' });
  }
}

describe('runComparison re-resolves observations against current definitions (ERROR 1)', () => {
  it('resolves all 19 observations and finds type_mismatch once the mapping is applied after the paste, with no missing_event/unexpected_event for the six mapped types', () => {
    // 1. Paste the events export into an *empty* project: no Event exists yet, so every observation
    // is stored unresolved (event_id: null) and the apply's own internal `runComparison` call fires
    // `unexpected_event`/`unknown` for every type, never `type_mismatch` (nothing to compare against).
    const eventsPreview = previewCustomerEventsExport(projectId, eventsFixture);
    const applyResult = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      eventsPreview.payload_hash,
      eventsPreview.items.map((i) => i.id),
      'Jan'
    );
    expect(applyResult.inserted).toBe(19);
    expect(ObservationDAL.listObservations(projectId).every((o) => o.event_id === null)).toBe(true);

    // 2. Apply the mapping fixture (T-1-08): creates the six events, their properties/variants, and
    // the purchase/purchase_item standard event mappings the observations were paint-blind to.
    const mappingPreview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(
      projectId,
      dataMappingFixture,
      mappingPreview.payload_hash,
      mappingPreview.items.map((i) => i.id)
    );
    retypeForTypeMismatches();

    // 3. Recompute. This is the ERROR 1 assertion: a *later* recompute (not a fresh apply) must
    // re-resolve the 19 already-stored observations against the definitions that now exist.
    const summary = runComparison(projectId);
    expect(summary.produced).toBeGreaterThan(0);

    // 7 of the 19 raw events are one of the six mapped types (purchase, purchase_item, checkout,
    // cart_update, view_item x1, view_category x2); the rest are known-system (consent, survey,
    // campaign, support_ticket, managed_endpoint) or genuinely unexpected (paper_catalogue,
    // loyalty_update) and stay unresolved by design.
    const observations = ObservationDAL.listObservations(projectId);
    expect(observations).toHaveLength(19);
    expect(observations.filter((o) => o.event_id !== null)).toHaveLength(7);

    const eventIdByName = new Map(EventDAL.listEvents(projectId).map((e) => [e.name, e.id]));
    const openFindings = FindingDAL.listFindings(projectId, { status: 'open' });

    const missingEventIds = new Set(openFindings.filter((f) => f.kind === 'missing_event').map((f) => f.event_id));
    const unexpectedEventTypes = new Set(
      openFindings.filter((f) => f.kind === 'unexpected_event').map((f) => (f.actual_json as { event_type: string })?.event_type)
    );
    for (const type of MAPPED_EVENT_TYPES) {
      expect(missingEventIds.has(eventIdByName.get(type) ?? null)).toBe(false);
      expect(unexpectedEventTypes.has(type)).toBe(false);
    }

    const kinds = new Set(openFindings.map((f) => f.kind));
    expect(kinds.has('type_mismatch')).toBe(true);
  });
});

describe('Finding.qa_run_id semantics (ERROR 2)', () => {
  it('stamps observation-level findings with the producing run, and leaves project-level kinds (missing_event, shape_inconsistent) null', () => {
    const mappingPreview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(
      projectId,
      dataMappingFixture,
      mappingPreview.payload_hash,
      mappingPreview.items.map((i) => i.id)
    );
    retypeForTypeMismatches();

    const eventsPreview = previewCustomerEventsExport(projectId, eventsFixture);
    const applyResult = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      eventsPreview.payload_hash,
      eventsPreview.items.map((i) => i.id),
      'Jan'
    );

    const openFindings = FindingDAL.listFindings(projectId, { status: 'open' });

    // Observation-level kinds carry the run that produced them (here, the only run in the project).
    const typeMismatch = openFindings.filter((f) => f.kind === 'type_mismatch');
    expect(typeMismatch.length).toBeGreaterThan(0);
    expect(typeMismatch.every((f) => f.qa_run_id === applyResult.run.id)).toBe(true);

    // The Findings page's "View findings for this run" / post-apply landing filters by qa_run_id;
    // it must find rows for the run just applied.
    const runFiltered = openFindings.filter((f) => f.qa_run_id === applyResult.run.id);
    expect(runFiltered.length).toBeGreaterThan(0);

    // shape_inconsistent is a project-level kind (spans every run's observations of a payload key):
    // qa_run_id must be null even though it does reference an observation for its evidence.
    const shapeInconsistent = openFindings.filter((f) => f.kind === 'shape_inconsistent');
    expect(shapeInconsistent.length).toBeGreaterThan(0);
    expect(shapeInconsistent.every((f) => f.qa_run_id === null)).toBe(true);
  });
});

describe('batched resolver (T-2-04, D-21 "Batched resolution")', () => {
  it('resolving the 19 fixture observations issues zero further listEvents calls beyond the one that built the resolver', () => {
    const mappingPreview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(projectId, dataMappingFixture, mappingPreview.payload_hash, mappingPreview.items.map((i) => i.id));

    const eventsPreview = previewCustomerEventsExport(projectId, eventsFixture);
    applyCustomerEventsExport(projectId, eventsFixture, eventsPreview.payload_hash, eventsPreview.items.map((i) => i.id), 'Jan');
    const observations = ObservationDAL.listObservations(projectId);
    expect(observations).toHaveLength(19);

    const listEventsSpy = vi.spyOn(EventDAL, 'listEvents');
    const resolve = createEventResolver(projectId);
    expect(listEventsSpy).toHaveBeenCalledTimes(1); // building the resolver: the one allowed call.
    listEventsSpy.mockClear();

    for (const o of observations) resolve(o.event_type, o.properties_json);
    expect(listEventsSpy).not.toHaveBeenCalled(); // resolving every observation reuses the cached map.

    listEventsSpy.mockRestore();
  });
});

describe('multi-comparison orchestrator (T-2-04)', () => {
  it('returns by_comparison counts and scopes stale resolution per comparison id', () => {
    const mappingPreview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(projectId, dataMappingFixture, mappingPreview.payload_hash, mappingPreview.items.map((i) => i.id));
    retypeForTypeMismatches();

    const eventsPreview = previewCustomerEventsExport(projectId, eventsFixture);
    applyCustomerEventsExport(projectId, eventsFixture, eventsPreview.payload_hash, eventsPreview.items.map((i) => i.id), 'Jan');

    const dmEventsPreview = previewDataManagerEvents(projectId, dataManagerEventsFixture);
    applyDataManagerEvents(
      projectId,
      dataManagerEventsFixture,
      dmEventsPreview.payload_hash,
      dmEventsPreview.items.filter((i) => i.default_selected).map((i) => i.id)
    );

    // applyDataManagerEvents does not itself call runComparison (unlike the customer-events import),
    // so this is the first recompute since both imports landed.
    const summary = runComparison(projectId);
    expect(summary.by_comparison.definition_vs_observations).toBeDefined();
    expect(summary.by_comparison.data_manager).toBeDefined();
    expect(summary.by_comparison.data_manager.produced).toBeGreaterThan(0);
    expect(summary.produced).toBe(
      summary.by_comparison.definition_vs_observations.produced + summary.by_comparison.data_manager.produced
    );

    const dataManagerFindingsBefore = FindingDAL.listFindings(projectId, { comparison: 'data_manager', status: 'open' });
    expect(dataManagerFindingsBefore.some((f) => f.kind === 'type_mismatch')).toBe(true);
    const observationFindingsBefore = FindingDAL.listFindings(projectId, {
      comparison: 'definition_vs_observations',
      status: 'open',
    });
    expect(observationFindingsBefore.length).toBeGreaterThan(0);

    // Recomputing again with the same definitions/evidence must reopen/refresh both comparisons'
    // findings, not resolve either one out from under the other (per-comparison stale resolution).
    const secondSummary = runComparison(projectId);
    expect(secondSummary.by_comparison.data_manager.resolved).toBe(0);
    expect(secondSummary.by_comparison.definition_vs_observations.resolved).toBe(0);
    const dataManagerFindingsAfter = FindingDAL.listFindings(projectId, { comparison: 'data_manager', status: 'open' });
    expect(dataManagerFindingsAfter.map((f) => f.fingerprint).sort()).toEqual(
      dataManagerFindingsBefore.map((f) => f.fingerprint).sort()
    );
    const observationFindingsAfter = FindingDAL.listFindings(projectId, {
      comparison: 'definition_vs_observations',
      status: 'open',
    });
    expect(observationFindingsAfter.map((f) => f.fingerprint).sort()).toEqual(
      observationFindingsBefore.map((f) => f.fingerprint).sort()
    );

    // Cross-comparison isolation, proven directly: archiving every run (so comparison 3 has zero
    // observations in scope, resolving all of its own findings) must not touch comparison 4's open
    // findings, which have no observation/QaRun dependency at all.
    for (const runId of new Set(ObservationDAL.listObservations(projectId).map((o) => o.qa_run_id))) {
      QaRunDAL.updateQaRun(projectId, runId, { archived: true });
    }
    const thirdSummary = runComparison(projectId);
    expect(thirdSummary.by_comparison.data_manager.resolved).toBe(0);
    const dataManagerFindingsStillOpen = FindingDAL.listFindings(projectId, { comparison: 'data_manager', status: 'open' });
    expect(dataManagerFindingsStillOpen.map((f) => f.fingerprint).sort()).toEqual(
      dataManagerFindingsAfter.map((f) => f.fingerprint).sort()
    );
    // Observation-anchored kinds (e.g. type_mismatch) are gone now that no observations are in
    // scope; comparison 3's own resolution ran, comparison 4's did not.
    const typeMismatchAfterArchive = FindingDAL.listFindings(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'type_mismatch',
      status: 'open',
    });
    expect(typeMismatchAfterArchive.length).toBe(0);
    expect(thirdSummary.by_comparison.definition_vs_observations.resolved).toBeGreaterThan(0);
  });
});
