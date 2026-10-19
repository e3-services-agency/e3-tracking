import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../backend/db';
import * as ClientDAL from '../../backend/dal/client.dal';
import * as ProjectDAL from '../../backend/dal/project.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as FindingDAL from '../../backend/dal/finding.dal';
import * as UseCaseDAL from '../../backend/dal/use-case.dal';
import * as RequirementDAL from '../../backend/dal/requirement.dal';
import * as HistoryDAL from '../../backend/dal/change-log.dal';
import { listFindings, summarizeFindings, getFinding } from './findings';
import { listEvents, getEventCard } from './events';
import { listUseCases, getUseCase } from './useCases';
import { getHistory } from './history';
import { callTool } from './writeTestUtil';
import { conditionalRead } from '../readOptions';

let projectId: string, eventId: string, propertyId: string;
const project_key = 'compact';
beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'compact', name: 'Compact' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: project_key, name: 'Compact' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'purchase', class: 'custom' }).id;
  propertyId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'price', data_type: 'number' }).id;
});
afterEach(() => { closeDb(); delete process.env.E3_DB_PATH; });

function finding(i = 0, other: Partial<FindingDAL.FindingInput> = {}) {
  return FindingDAL.upsertFinding(projectId, {
    comparison: 'definition_vs_observations', kind: 'type_mismatch', severity: 'error', event_id: eventId, property_id: propertyId,
    fingerprint: `fingerprint-${i}`, expected_json: { description: 'x'.repeat(1600) }, actual_json: { value: 'y'.repeat(1600) }, message: 'Long diagnostic '.repeat(50), ...other,
  });
}

describe('compact MCP findings', () => {
  it('summarizes 486 verbose rows under 5k; pages preserve full rows, IDs, sequences and order', async () => {
    for (let i = 0; i < 486; i++) {
      const row = finding(i, { severity: i % 3 === 0 ? 'warning' : 'error', kind: i % 2 === 0 ? 'missing_required' : 'type_mismatch' });
      if (i % 10 === 0) FindingDAL.setFindingStatus(projectId, row.id, 'resolved');
    }
    const summary = await summarizeFindings({ project_key, status: 'all' });
    const all = await listFindings({ project_key, status: 'all', include: 'detail', limit: 1000 });
    expect(summary.total).toBe(486);
    expect(summary.total).toBe(FindingDAL.listFindings(projectId).length);
    for (const [dimension, field] of [['by_status', 'status'], ['by_priority', 'priority'], ['by_severity', 'severity'], ['by_comparison', 'comparison'], ['by_kind', 'kind'], ['by_event', 'event_id']] as const) {
      const expected: Record<string, number> = {};
      for (const row of all.items) expected[String(row[field])] = (expected[String(row[field])] ?? 0) + 1;
      expect(dimension === 'by_event' ? Object.fromEntries(summary.by_event.map(e => [e.event_id, e.count])) : summary[dimension]).toEqual(expected);
    }
    expect(JSON.stringify(summary).length).toBeLessThan(5000);
    expect((await summarizeFindings({ project_key })).total).toBe(437); // Default remains open.
    const items = [];
    let offset = 0;
    do {
      const page = await listFindings({ project_key, status: 'all', include: 'detail', limit: 37, offset });
      expect(page.total).toBe(486);
      expect(page.truncated).toBe(page.next_offset !== null);
      items.push(...page.items);
      if (page.next_offset === null) break;
      offset = page.next_offset;
    } while (true);
    expect(items).toEqual(all.items);
    expect(new Set(items.map(r => r.id)).size).toBe(486);
    for (const item of items) {
      const { project_id: _id, ...original } = FindingDAL.getFindingOrThrow(projectId, item.id!);
      expect(item).toMatchObject(original);
    }
    const wire = await callTool('list_findings', { project_key });
    expect(wire.isError).toBe(false);
    expect(wire.text.length).toBeLessThan(10000);
    expect(wire.text).not.toContain('\n');
    expect(wire.data.items).toHaveLength(10);
    expect(wire.data.items[0]).not.toHaveProperty('message');
    expect(wire.data.items[0]).not.toHaveProperty('priority_reasons');
    expect(wire.data.items[0]).not.toHaveProperty('project_id');
  });

  it('uses identical list/summary filters including property and inclusive timestamp bounds', async () => {
    const row = finding();
    finding(1, { property_id: null, severity: 'info' });
    getDb().prepare('UPDATE findings SET first_seen_at=?, last_seen_at=? WHERE id=?').run('2026-10-18T01:00:00.000Z', '2026-10-19T01:00:00.000Z', row.id);
    const filter = { project_key, event: 'purchase', property: 'price', severity: row.severity, comparison: row.comparison, kind: row.kind,
      first_seen_from: '2026-10-18T03:00:00+02:00', first_seen_to: '2026-10-18T03:00:00+02:00', last_seen_from: '2026-10-19T01:00:00Z', last_seen_to: '2026-10-19T01:00:00Z' };
    const page = await listFindings(filter), summary = await summarizeFindings(filter);
    expect(page.items.map(r => r.id)).toEqual([row.id]);
    expect(summary.total).toBe(page.total);
    expect(summary.newest_first_seen_at).toBe('2026-10-18T01:00:00.000Z');
    expect(summary.newest_last_seen_at).toBe('2026-10-19T01:00:00.000Z');
    const excluded = { ...filter, priority: 'P1' };
    expect((await summarizeFindings(excluded)).total).toBe((await listFindings(excluded)).total);
    const empty = await summarizeFindings({ ...filter, kind: 'missing_event' });
    expect(empty).toMatchObject({ total: 0, by_event: [], newest_first_seen_at: null, newest_last_seen_at: null });
  });

  it('selects exact fields, rejects invalid fields even on empty pages, and bounds inputs', async () => {
    finding();
    const page = await listFindings({ project_key, fields: ['id', 'message', 'expected_json'] });
    expect(Object.keys(page.items[0])).toEqual(['id', 'message', 'expected_json']);
    for (const input of [{ limit: 0 }, { offset: -1 }, { limit: 1.5 }, { limit: 1001 }, { offset: NaN }, { fields: ['project_id'], offset: 1000 }, { fields: ['typo'] }, { first_seen_from: 'yesterday' }, { first_seen_from: '2026-10-19T00:00:00Z', first_seen_to: '2026-10-18T00:00:00Z' }]) {
      await expect(listFindings({ project_key, ...input })).rejects.toThrow();
    }
    expect(await listFindings({ project_key, offset: 1000 })).toMatchObject({ items: [], total: 1, next_offset: null, truncated: false });
  });
});

describe('conditional reads', () => {
  it('returns no body for matching findings; detects evidence, closure, reopening and derived priority changes', async () => {
    const row = finding(), input = { project_key, finding_id: row.id };
    const first = await getFinding(input);
    expect(await getFinding({ ...input, if_hash: first.hash })).toEqual({ unchanged: true, id: row.id, hash: first.hash, state: 'open' });
    FindingDAL.setFindingStatus(projectId, row.id, 'resolved');
    const closed = await getFinding({ ...input, if_hash: first.hash });
    expect(closed.hash).not.toBe(first.hash);
    expect(closed).toHaveProperty('status', 'resolved');
    FindingDAL.setFindingStatus(projectId, row.id, 'open');
    const reopened = await getFinding({ ...input, if_hash: closed.hash });
    expect(reopened).toHaveProperty('status', 'open');
    finding(0, { actual_json: { changed: true } });
    const changed = await getFinding({ ...input, if_hash: reopened.hash });
    expect(changed).toHaveProperty('actual_json', { changed: true });
    expect(changed.hash).not.toBe(reopened.hash);
    EventDAL.updateEvent(projectId, eventId, { priority: 'critical', implementation_method: 'server_api' });
    expect((await getFinding(input)).hash).not.toBe(changed.hash);
    await expect(getFinding({ project_key: 'missing', finding_id: row.id, if_hash: changed.hash })).rejects.toThrow();
  });

  it('hashes complete event cards and public use cases, including related requirements', async () => {
    const card = await getEventCard({ project_key, event: eventId });
    expect(await getEventCard({ project_key, event: eventId, if_hash: card.hash })).toEqual({ unchanged: true, id: eventId, hash: card.hash, state: card.state });
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyId, required: true });
    expect((await getEventCard({ project_key, event: eventId, if_hash: card.hash })).hash).not.toBe(card.hash);
    const uc = UseCaseDAL.createUseCase(projectId, { code: 'UC-ONE', name: 'One', internal_notes: 'SECRET' });
    const first = await getUseCase({ project_key, use_case: uc.id });
    expect(await getUseCase({ project_key, use_case: uc.id, if_hash: first.hash })).toEqual({ unchanged: true, id: uc.id, hash: first.hash, state: first.state });
    UseCaseDAL.updateUseCase(projectId, uc.id, { internal_notes: 'OTHER SECRET' });
    expect((await getUseCase({ project_key, use_case: uc.id })).hash).toBe(first.hash);
    RequirementDAL.replaceRequirements(projectId, uc.id, [{ target_kind: 'event', event_id: eventId, level: 'R' }]);
    expect((await getUseCase({ project_key, use_case: uc.id, if_hash: first.hash })).hash).not.toBe(first.hash);
    expect(JSON.stringify(await listUseCases({ project_key, include: 'detail' }))).not.toContain('SECRET');
    await expect(listUseCases({ project_key, fields: ['internal_notes'] })).rejects.toThrow();
  });

  it('canonical hashes ignore JSON object-key order', () => {
    const first = conditionalRead('one', { nested: { a: 1, b: 2 } }, {});
    expect(conditionalRead('one', { nested: { b: 2, a: 1 } }, { if_hash: first.hash })).toEqual({ unchanged: true, id: 'one', hash: first.hash, state: null });
  });
});

it('paginates events, use cases and history with totals and optional long fields', async () => {
  for (let i = 0; i < 22; i++) {
    EventDAL.createEvent(projectId, { name: `event_${i}`, class: 'custom' });
    UseCaseDAL.createUseCase(projectId, { name: `Use case ${i}`, narrative: 'Long narrative '.repeat(100), internal_notes: 'SECRET' });
    HistoryDAL.recordChange({ projectId, entityType: 'event', entityId: eventId, entityLabel: 'purchase', action: 'update', before: { name: 'before' }, after: { name: `after${i}` } });
  }
  const historyInput = { project_key, entity_type: 'event', entity_id: eventId };
  const calls = [() => listEvents({ project_key }), () => listUseCases({ project_key }), () => getHistory(historyInput)];
  for (const [index, run] of calls.entries()) {
    const page = await run();
    expect(page).toMatchObject(index === 2 ? { limit: 10, offset: 0, next_offset: 10, truncated: true } : { limit: 100, offset: 0, next_offset: null, truncated: false });
    expect(page.returned).toBe(page.items.length);
    expect(page.result_marker).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(page).length).toBeLessThan(10000);
  }
  const events = await listEvents({ project_key, limit: 1000 });
  expect([...(await listEvents({ project_key, limit: 12 })).items, ...(await listEvents({ project_key, limit: 12, offset: 12 })).items]).toEqual(events.items);
  const useCases = await listUseCases({ project_key, limit: 1000 });
  expect([...(await listUseCases({ project_key, limit: 11 })).items, ...(await listUseCases({ project_key, limit: 11, offset: 11 })).items]).toEqual(useCases.items);
  expect(useCases.items[0]).not.toHaveProperty('narrative');
  expect((await listUseCases({ project_key, include: 'detail' })).items[0]).toHaveProperty('narrative');
  const history = await getHistory({ ...historyInput, limit: 1000, include: 'detail' });
  const first = await getHistory({ ...historyInput, limit: 12, include: 'detail' });
  const last = await getHistory({ ...historyInput, limit: 12, offset: 12, include: 'detail' });
  expect([...first.items, ...last.items]).toEqual(history.items);
  expect(history.total).toBe(HistoryDAL.countChanges(projectId, { entity_type: 'event', entity_id: eventId }));
  expect(history.items[0]).toHaveProperty('diff_json');
  expect((await getHistory(historyInput)).items[0]).not.toHaveProperty('diff_json');
});

it('keeps one marker across pages and invalidates it on comparison, closure, name and priority changes', async () => {
  finding(); finding(1);
  const input = { project_key, limit: 1 };
  const first = await listFindings(input);
  const second = await listFindings({ ...input, offset: 1 });
  expect(second.result_marker).toBe(first.result_marker);
  expect(first.items[0]).toMatchObject({ event_name: 'purchase', property_name: 'price' });
  const { runComparison } = await import('../../backend/services/comparison.service');
  runComparison(projectId);
  const compared = await listFindings(input);
  expect(compared.result_marker).not.toBe(first.result_marker);
  const row = finding(2);
  const before = await listFindings({ ...input, status: 'all' });
  FindingDAL.setFindingStatus(projectId, row.id, 'resolved');
  const closed = await listFindings({ ...input, status: 'all' });
  expect(closed.total).toBe(before.total);
  expect(closed.result_marker).not.toBe(before.result_marker);
  EventDAL.updateEvent(projectId, eventId, { name: 'purchase_renamed', priority: 'critical' });
  expect((await listFindings({ ...input, status: 'all' })).result_marker).not.toBe(closed.result_marker);
  expect((await summarizeFindings({ project_key, status: 'all' })).by_event[0].event_name).toBe('purchase_renamed');
});

it('returns 33 use cases by default and treats include=body as detail with fields taking precedence', async () => {
  for (let i = 0; i < 33; i++) UseCaseDAL.createUseCase(projectId, { name: `Use case ${i}`, narrative: 'body' });
  expect(await listUseCases({ project_key })).toMatchObject({ total: 33, returned: 33, limit: 100, next_offset: null });
  expect((await listUseCases({ project_key, include: 'body' })).items[0]).toHaveProperty('narrative', 'body');
  expect(Object.keys((await listUseCases({ project_key, include: 'body', fields: ['id'] })).items[0])).toEqual(['id']);
});
