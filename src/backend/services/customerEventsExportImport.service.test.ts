/**
 * customer-events-export import service tests (T-1-09): preview resolution/unknown-types/
 * duplicates, apply creates the run + observations + runs comparison, hash contract, dedupe on a
 * second apply of the same payload.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import {
  previewCustomerEventsExport,
  applyCustomerEventsExport,
  NoObservationsSelectedError,
} from './customerEventsExportImport.service';
import { PayloadChangedError } from '../errors';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const eventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  // Apply the data-mapping fixture first (T-1-08) so events/properties/variants/mappings exist to
  // resolve against — same setup the plan's qa-roundtrip scenario 4 describes.
  const preview = previewDataMapping(projectId, dataMappingFixture);
  applyDataMapping(
    projectId,
    dataMappingFixture,
    preview.payload_hash,
    preview.items.map((i) => i.id)
  );

  // Typed per the plan's engine-test setup: total_price/price -> number/money, is_new -> boolean,
  // quantity/total_quantity/stock_level -> number.
  for (const name of ['total_price', 'price']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number', data_formats_json: ['money'] });
  }
  for (const name of ['quantity', 'total_quantity', 'stock_level']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number' });
  }
  const isNewName = 'is_new';
  const isNewExisting = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === isNewName);
  if (isNewExisting) {
    PropertyDAL.updateProperty(projectId, isNewExisting.id, { data_type: 'boolean' });
  } else {
    const created = PropertyDAL.createProperty(projectId, { scope: 'event', name: isNewName, data_type: 'boolean' });
    const event = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase_item');
    if (event) {
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: created.id, role: 'normal' });
    }
  }

  // T-2-05 fix round ruling (T-2-07 LOW 4, D-25 Q12): the purchase_items_total rule template is now
  // only proposed once total_price already carries the money format, which the first apply above
  // predates (it retypes total_price afterward) — re-preview/apply the same mapping fixture so the
  // rule actually gets created (idempotent no-op on every other item, matching
  // dataMappingImport.service.test.ts's own two-step pattern).
  const secondPreview = previewDataMapping(projectId, dataMappingFixture);
  applyDataMapping(projectId, dataMappingFixture, secondPreview.payload_hash, secondPreview.items.map((i) => i.id));
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('previewCustomerEventsExport', () => {
  it('resolves the mapped event types, flags the unknown types, and reports no duplicates on a fresh project', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    expect(preview.items).toHaveLength(19);
    expect(preview.duplicate_count).toBe(0);
    expect(preview.run_header.customer_id).toBe('666a00c0c818dcd371f98040');

    const byType = new Map(preview.type_summary.map((t) => [t.type, t]));
    expect(byType.get('purchase')?.resolved).toBe(true);
    expect(byType.get('cart_update')?.resolved).toBe(true);
    expect(byType.get('cart_update')?.variants).toContain('cart_update[action=add]');

    // Known Bloomreach system types with no Event definition: unresolved but not "unknown".
    expect(byType.get('consent')?.resolved).toBe(false);
    expect(byType.get('consent')?.known_system).toBe(true);
    // Client-specific custom types: unresolved and unknown (T-1-09 delta correction).
    expect(byType.get('paper_catalogue')?.known_system).toBe(false);
    expect(byType.get('loyalty_update')?.known_system).toBe(false);
  });
});

describe('applyCustomerEventsExport', () => {
  it('409s PAYLOAD_CHANGED on a stale hash', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    expect(() =>
      applyCustomerEventsExport(projectId, eventsFixture, `${preview.payload_hash}-stale`, [], 'Jan')
    ).toThrow(PayloadChangedError);
  });

  it('creates an export_paste run, the selected observations, and runs comparison producing the expected finding kinds', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    const result = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      preview.payload_hash,
      preview.items.map((i) => i.id),
      'Jan'
    );

    expect(result.run.kind).toBe('export_paste');
    expect(result.run.customer_id).toBe('666a00c0c818dcd371f98040');
    expect(result.inserted).toBe(19);
    expect(result.skipped).toBe(0);

    const run = QaRunDAL.getQaRunOrThrow(projectId, result.run.id);
    expect(run.actor).toBe('Jan');

    // `shape_inconsistent` (fix round ERROR 3): `product_ids` is linked as a Property only on
    // `purchase` in the real data-mapping fixture (checkout/add_to_cart map it to `null`), but the
    // raw payload key `product_ids` is still observed as an array on `purchase` and a string on
    // `checkout`/`cart_update` — the engine must compare it across all observations regardless of
    // link status (`definitionVsObservations.ts`).
    const kinds = new Set(FindingDAL.listFindings(projectId, { status: 'open' }).map((f) => f.kind));
    expect(kinds.has('type_mismatch')).toBe(true);
    expect(kinds.has('rounding_drift')).toBe(true);
    expect(kinds.has('unexpected_event')).toBe(true);
    expect(kinds.has('shape_inconsistent')).toBe(true);

    const unexpectedEventTypes = FindingDAL.listFindings(projectId, { kind: 'unexpected_event' }).map(
      (f) => (f.actual_json as { event_type: string })?.event_type
    );
    expect(unexpectedEventTypes.sort()).toEqual(['loyalty_update', 'paper_catalogue']);
  });

  it('deselecting an item on apply skips only that item and creates observations for the rest (LOW 9 fix)', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    const allIds = preview.items.map((i) => i.id);
    const [deselectedId, ...selectedIds] = allIds;

    const result = applyCustomerEventsExport(projectId, eventsFixture, preview.payload_hash, selectedIds, 'Jan');
    expect(result.inserted).toBe(18);
    expect(result.skipped).toBe(1);

    const observations = ObservationDAL.listObservationsByRun(projectId, result.run.id);
    expect(observations).toHaveLength(18);
    // The deselected item's index is encoded in its id (`observation:<index>:...`); confirm no
    // observation with that raw event's timestamp/type made it in.
    const deselectedIndex = Number(deselectedId.split(':')[1]);
    const deselectedEvent = eventsFixture.events[deselectedIndex];
    expect(observations.some((o) => o.event_type === deselectedEvent.type && o.timestamp === deselectedEvent.timestamp)).toBe(false);
  });

  it('re-pasting the identical payload flags every item as an already-present duplicate, deselected by default', () => {
    const preview1 = previewCustomerEventsExport(projectId, eventsFixture);
    applyCustomerEventsExport(projectId, eventsFixture, preview1.payload_hash, preview1.items.map((i) => i.id), 'Jan');

    const preview2 = previewCustomerEventsExport(projectId, eventsFixture);
    expect(preview2.duplicate_count).toBe(19);
    const nonDuplicateSelection = preview2.items.filter((i) => i.default_selected).map((i) => i.id);
    expect(nonDuplicateSelection).toHaveLength(0);

    const result2 = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      preview2.payload_hash,
      preview2.items.map((i) => i.id), // caller overrides the default and re-selects everything anyway
      'Jan'
    );
    // Every observation is a raw_hash duplicate *within this new run* too (same payload), so
    // `createObservation`'s per-run dedupe still creates them (dedupe is per qa_run_id) — the
    // preview's duplicate flag is informational (cross-run), selection is what actually gates apply.
    expect(result2.inserted).toBe(19);
  });

  it('400s NO_OBSERVATIONS_SELECTED when selected_item_ids is empty (LOW 7 fix)', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    expect(() => applyCustomerEventsExport(projectId, eventsFixture, preview.payload_hash, [], 'Jan')).toThrow(
      NoObservationsSelectedError
    );
    // No QA run should have been created for the rejected apply.
    expect(QaRunDAL.listQaRuns(projectId)).toHaveLength(0);
  });
});
