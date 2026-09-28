/**
 * MCP tool handler tests (T-2-10 acceptance, plus the addendum): call the handlers directly against
 * `:memory:`, the same pattern `document.service.test.ts`/`rule.dal.test.ts` use. Covers
 * `list_events`'s default class filter, `get_expected_payload` for `cart_update[action=add]`,
 * `submit_observation`'s `agent_session` run, `submit_observations_batch` against the
 * customer-events-export fixture (both the default new-run path and reusing an existing
 * `qa_run_id`), `finish_qa_run`, `run_comparison`'s summary shape, and `get_coverage_grid`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../backend/db';
import * as ClientDAL from '../../backend/dal/client.dal';
import * as ProjectDAL from '../../backend/dal/project.dal';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import * as VariantDAL from '../../backend/dal/variant.dal';
import * as RuleDAL from '../../backend/dal/rule.dal';
import * as QaRunDAL from '../../backend/dal/qa-run.dal';
import * as ObservationDAL from '../../backend/dal/observation.dal';

import { listEvents, getExpectedPayload } from './events';
import { submitObservation, submitObservationsBatch, updateObservation, deleteObservation } from './observations';
import { runComparison } from './comparison';
import { getCoverageGrid } from './coverage';
import { finishQaRun, deleteQaRun } from './qaRuns';
import { resetSessionCache } from '../session';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json');

let projectId: string;
let projectKey: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  resetSessionCache();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
  projectId = project.id;
  projectKey = project.key;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

/** One custom `cart_update` event with an `action` discriminator (`add`/`remove` -> the
 * `cart_update[action=add]` variant), an item-schema `product_list`, and a rule on the event. */
function setUpCartUpdate(): { eventId: string; actionPropertyId: string; variantAddId: string } {
  const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });

  const action = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  });
  const productId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' });
  const productList = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'product_list',
    data_type: 'array',
    item_schema_json: [
      { field: 'product_id', data_type: 'string', required: true },
      { field: 'price', data_type: 'number', required: true },
    ],
  });

  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, required: true, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: productId.id, required: true, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: productList.id, required: false, role: 'normal' });

  RuleDAL.createRule(projectId, event.id, {
    kind: 'membership',
    name: 'item_in_list',
    expression_json: {
      kind: 'membership',
      needle: { ref: 'property', property_id: productId.id },
      haystack: { property_id: productList.id, field: 'product_id' },
    },
  });

  const variantAdd = VariantDAL.createVariant(projectId, event.id, {
    conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
  });

  return { eventId: event.id, actionPropertyId: action.id, variantAddId: variantAdd.id };
}

describe('list_events', () => {
  it('defaults to class=custom, excluding sdk/platform events', async () => {
    setUpCartUpdate();
    EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });
    EventDAL.createEvent(projectId, { name: 'campaign', class: 'platform' });

    const rows = await listEvents({ project_key: projectKey });

    expect(rows.map((r) => r.name)).toEqual(['cart_update']);
    expect(rows[0].discriminators).toEqual(['action']);
    expect(rows[0].required_properties).toContain('product_id');
  });

  it('class: "all" includes every class', async () => {
    setUpCartUpdate();
    EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });

    const rows = await listEvents({ project_key: projectKey, class: 'all' });
    expect(rows.map((r) => r.name).sort()).toEqual(['cart_update', 'session_start']);
  });
});

describe('get_expected_payload', () => {
  it('for cart_update[action=add] returns discriminator values, item schemas and rules', async () => {
    setUpCartUpdate();

    const payload = await getExpectedPayload({ project_key: projectKey, event: 'cart_update', variant: 'cart_update[action=add]' });

    expect(payload.variant).toBe('cart_update[action=add]');
    expect(payload.discriminators.action).toEqual(['add', 'remove']);
    expect(payload.required.product_id).toEqual({ data_type: 'string', formats: [] });
    expect(payload.item_schemas.product_list).toEqual([
      { field: 'product_id', data_type: 'string', required: true },
      { field: 'price', data_type: 'number', required: true },
    ]);
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0].name).toBe('item_in_list');
    expect(payload.example.action).toBe('add');
  });
});

describe('submit_observation', () => {
  it('creates an agent_session QA run when qa_run_id is absent, and reuses it on the next call', async () => {
    setUpCartUpdate();

    const first = await submitObservation({
      project_key: projectKey,
      agent_name: 'Codex',
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });

    const run = QaRunDAL.getQaRunOrThrow(projectId, first.qa_run_id);
    expect(run.kind).toBe('agent_session');
    expect(run.actor).toBe('Codex');
    expect(first.observation?.event_type).toBe('cart_update');

    const second = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'remove', product_id: 'sku-2' },
    });

    expect(second.qa_run_id).toBe(first.qa_run_id);
  });
});

describe('submit_observations_batch', () => {
  it('inserts every event from the fixture, and reports duplicates on re-submit, naming the run that holds them', async () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

    const first = await submitObservationsBatch({ project_key: projectKey, export: raw });
    expect(first.inserted).toBe(19);
    expect(first.duplicates).toBe(0);
    expect(typeof first.qa_run_id).toBe('string');

    // Reviewer WARNING 2 (T-2-10 pre-QA fix): when every row is already a duplicate and no
    // qa_run_id was given, qa_run_id must be the run holding the duplicates, never ''.
    const second = await submitObservationsBatch({ project_key: projectKey, export: raw });
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(19);
    expect(second.qa_run_id).toBe(first.qa_run_id);
    expect(second.qa_run_id).not.toBe('');
  });

  it('returns qa_run_id: null (never "") for an all-duplicate resubmit whose owning run cannot be determined', async () => {
    // An empty `events` array previews as "every item is a duplicate" (zero items, zero selected)
    // without ever having inserted anything to look a run up from.
    const empty = { customer_id: 'c1', project: 'e3', url: null, events_listed: 0, note: null, events: [] };

    const result = await submitObservationsBatch({ project_key: projectKey, export: empty });

    expect(result).toEqual({ qa_run_id: null, inserted: 0, duplicates: 0 });
  });

  it('inserts into an existing qa_run_id instead of creating a new run, and dedupes within it on re-submit', async () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    const existingRun = QaRunDAL.createQaRun(projectId, { kind: 'agent_session', actor: 'Codex' });

    const first = await submitObservationsBatch({ project_key: projectKey, qa_run_id: existingRun.id, export: raw });
    expect(first.qa_run_id).toBe(existingRun.id);
    expect(first.inserted).toBe(19);
    expect(first.duplicates).toBe(0);
    expect(QaRunDAL.listQaRuns(projectId)).toHaveLength(1);

    const second = await submitObservationsBatch({ project_key: projectKey, qa_run_id: existingRun.id, export: raw });
    expect(second.qa_run_id).toBe(existingRun.id);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(19);
    expect(QaRunDAL.listQaRuns(projectId)).toHaveLength(1);
  });

  it('rejects a qa_run_id that does not exist', async () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    await expect(submitObservationsBatch({ project_key: projectKey, qa_run_id: 'nope', export: raw })).rejects.toThrow();
  });
});

describe('finish_qa_run', () => {
  it('sets finished_at and returns the updated run', async () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'agent_session', actor: 'Codex' });
    expect(run.finished_at).toBeNull();

    const finished = await finishQaRun({ project_key: projectKey, qa_run_id: run.id, notes: 'done' });

    expect(finished.finished_at).not.toBeNull();
    expect(finished.notes).toBe('done');
  });
});

describe('run_comparison', () => {
  it('returns the ComparisonSummary shape', async () => {
    setUpCartUpdate();
    await submitObservation({ project_key: projectKey, event_type: 'cart_update', properties: { action: 'add', product_id: 'sku-1' } });

    const summary = await runComparison({ project_key: projectKey });

    expect(summary).toEqual(
      expect.objectContaining({
        open: expect.any(Object),
        produced: expect.any(Number),
        resolved: expect.any(Number),
        by_comparison: expect.any(Object),
      })
    );
  });
});

describe('get_coverage_grid', () => {
  it('returns the event coverage grid', async () => {
    const { eventId } = setUpCartUpdate();
    await submitObservation({ project_key: projectKey, event_type: 'cart_update', properties: { action: 'add', product_id: 'sku-1' } });

    const grid = (await getCoverageGrid({ project_key: projectKey, event: eventId })) as { rows: unknown[]; columns: unknown[] };
    expect(grid.rows.length).toBeGreaterThan(0);
  });

  it('rejects a call with neither event nor use_case', async () => {
    await expect(getCoverageGrid({ project_key: projectKey })).rejects.toThrow();
  });
});

// D-52, T-3-07: update_observation, delete_observation, delete_qa_run, each followed by
// runComparison, mirroring the DELETE/PATCH routes' DAL functions and error codes.
describe('update_observation', () => {
  it('edits properties, recomputes raw_hash and returns a ComparisonSummary', async () => {
    setUpCartUpdate();
    const { observation, qa_run_id } = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });
    const originalHash = observation!.raw_hash;

    const result = await updateObservation({
      project_key: projectKey,
      observation_id: observation!.id,
      properties: { action: 'add', product_id: 'sku-2' },
    });

    expect(result.observation.properties_json.product_id).toBe('sku-2');
    expect(result.observation.raw_hash).not.toBe(originalHash);
    expect(result.comparison).toEqual(
      expect.objectContaining({ open: expect.any(Object), produced: expect.any(Number), resolved: expect.any(Number) })
    );

    const stillThere = ObservationDAL.getObservationOrThrow(projectId, observation!.id);
    expect(stillThere.qa_run_id).toBe(qa_run_id);
  });

  it('rejects with DUPLICATE_OBSERVATION (409) when the edit collides with another observation of the same run', async () => {
    setUpCartUpdate();
    const first = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });
    const second = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-2' },
    });

    await expect(
      updateObservation({
        project_key: projectKey,
        observation_id: second.observation!.id,
        properties: { action: 'add', product_id: 'sku-1' },
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_OBSERVATION' });

    void first;
  });

  it('rejects a missing observation_id', async () => {
    await expect(updateObservation({ project_key: projectKey, observation_id: '' })).rejects.toThrow();
  });

  // Fix round WARNING 2: the DAL itself validates, so even a direct handler call (bypassing the
  // registerTools zod schema) gets a clean VALIDATION_ERROR rather than a raw SQLite/TypeError.
  it('rejects a non-object properties value with VALIDATION_ERROR', async () => {
    setUpCartUpdate();
    const { observation } = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });

    await expect(
      updateObservation({
        project_key: projectKey,
        observation_id: observation!.id,
        properties: ['not', 'an', 'object'] as unknown as Record<string, unknown>,
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  // Fix round LOW 3: the returned observation must reflect the post-recompute resolution, not the
  // resolution the row had at PATCH time.
  it('returns the re-resolved observation, not the stale pre-recompute one', async () => {
    const { variantAddId } = setUpCartUpdate();
    const { observation } = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });
    expect(observation!.variant_id).toBe(variantAddId);

    const result = await updateObservation({
      project_key: projectKey,
      observation_id: observation!.id,
      properties: { action: 'remove', product_id: 'sku-1' },
    });

    // No variant is mapped to action=remove in this fixture -- the post-recompute variant_id is null.
    expect(result.observation.variant_id).toBeNull();
  });
});

describe('delete_observation', () => {
  it('removes the observation and returns a ComparisonSummary', async () => {
    setUpCartUpdate();
    const { observation } = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });

    const result = await deleteObservation({ project_key: projectKey, observation_id: observation!.id });
    expect(result.deleted).toBe(true);
    expect(result.comparison).toEqual(expect.objectContaining({ produced: expect.any(Number) }));
    expect(() => ObservationDAL.getObservationOrThrow(projectId, observation!.id)).toThrow();
  });

  it('rejects an unknown observation_id (404)', async () => {
    await expect(deleteObservation({ project_key: projectKey, observation_id: 'nope' })).rejects.toThrow();
  });
});

describe('delete_qa_run', () => {
  it('cascades the run\'s observations and returns a ComparisonSummary', async () => {
    setUpCartUpdate();
    const { qa_run_id } = await submitObservation({
      project_key: projectKey,
      event_type: 'cart_update',
      properties: { action: 'add', product_id: 'sku-1' },
    });

    const result = await deleteQaRun({ project_key: projectKey, qa_run_id });
    expect(result.deleted).toBe(true);
    expect(() => QaRunDAL.getQaRunOrThrow(projectId, qa_run_id)).toThrow();
    expect(ObservationDAL.listObservations(projectId, { qa_run_id })).toEqual([]);
  });

  it('rejects an unknown qa_run_id (404)', async () => {
    await expect(deleteQaRun({ project_key: projectKey, qa_run_id: 'nope' })).rejects.toThrow();
  });
});
