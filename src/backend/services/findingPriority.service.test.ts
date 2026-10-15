/**
 * D-89 (T-5-47): finding priority wired through the backend. The pure matrix is covered by
 * `src/domain/findingPriority.test.ts`; this file covers the batched loader, the internal findings
 * route (default priority order, `?sort=severity`, `?priority=` filter, 400s), MCP `list_findings`,
 * the tracking document and its public projection, and the QA report freeze.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db';
import { createApp } from '../app';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as FindingDAL from '../dal/finding.dal';
import { captureQaReport, getQaReport } from '../dal/qa-report.dal';
import { publicReport } from './qaReports.service';
import { runComparison } from './comparison.service';
import {
  buildPublicFindings,
  buildPublicTrackingDocumentSummary,
  buildTrackingDocument,
  toPublicTrackingDocument,
} from './document.service';
import { loadFindingPriorityContext, withFindingPriority } from './findingPriority.service';
import { listFindings as mcpListFindings } from '../../mcp/tools/findings';

let projectId: string;
let ids: { purchase: string; pageVisit: string; checkout: string; viewItem: string; price: string };

function finding(eventId: string | null, severity: 'error' | 'warning' | 'info', tag: string, propertyId: string | null = null) {
  return FindingDAL.upsertFinding(projectId, {
    comparison: 'definition_vs_observations',
    kind: 'missing_required',
    severity,
    event_id: eventId,
    property_id: propertyId,
    message: tag,
    fingerprint: `prio|${tag}`,
  });
}

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  const purchase = EventDAL.createEvent(projectId, { name: 'purchase', priority: 'low' }); // server_api by default
  const pageVisit = EventDAL.createEvent(projectId, { name: 'page_visit', priority: 'medium' });
  const checkout = EventDAL.createEvent(projectId, { name: 'checkout', priority: 'low' });
  const viewItem = EventDAL.createEvent(projectId, { name: 'view_item', priority: 'high' });
  const price = PropertyDAL.createProperty(projectId, { name: 'price', data_type: 'number', scope: 'event' });
  EventDAL.attachPropertyToEvent(projectId, checkout.id, { property_id: price.id });
  ids = { purchase: purchase.id, pageVisit: pageVisit.id, checkout: checkout.id, viewItem: viewItem.id, price: price.id };

  const live = UseCaseDAL.createUseCase(projectId, { code: 'UC-01', name: 'Checkout recovery', status: 'live', internal_notes: 'SECRET-NOTE' });
  RequirementDAL.replaceRequirements(projectId, live.id, [{ target_kind: 'event_property', event_id: checkout.id, property_id: price.id, level: 'R' }]);
  const dropped = UseCaseDAL.createUseCase(projectId, { code: 'UC-02', name: 'Old', status: 'dropped' });
  RequirementDAL.replaceRequirements(projectId, dropped.id, [{ target_kind: 'event', event_id: pageVisit.id, level: 'R' }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('loader and live derivation', () => {
  it('derives priority from the current definitions on every read', () => {
    const f = finding(ids.purchase, 'warning', 'tx-warning');
    const first = withFindingPriority([f], loadFindingPriorityContext(projectId))[0];
    expect(first).toMatchObject({ priority: 'P2', priority_reasons: ['Warning', 'Transactional backend event'] });
    EventDAL.updateEvent(projectId, ids.purchase, { implementation_method: 'client_web' });
    expect(withFindingPriority([f], loadFindingPriorityContext(projectId))[0].priority).toBe('P4');
  });

  it('does not run one query per finding (500 findings cost the same queries as 50)', () => {
    const eventIds = [ids.purchase, ids.pageVisit, ids.checkout, ids.viewItem, null];
    const severities = ['error', 'warning', 'info'] as const;
    const seed = (n: number, offset: number) => {
      for (let i = 0; i < n; i++) finding(eventIds[i % eventIds.length], severities[i % 3], `bulk-${offset + i}`, i % 2 ? ids.price : null);
    };
    const countQueries = (fn: () => unknown) => {
      const db = getDb();
      const spy = vi.spyOn(db, 'prepare');
      fn();
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return n;
    };
    const readAll = () => withFindingPriority(FindingDAL.listFindings(projectId), loadFindingPriorityContext(projectId));
    // 50 findings already cover every event x property pair, so the existing per-event property
    // name cache in document.service (bounded by events, not findings) is the same in both runs.
    seed(50, 0);
    const small = countQueries(readAll);
    const smallDoc = countQueries(() => buildTrackingDocument(projectId, { light: true }));
    seed(450, 50);
    expect(FindingDAL.listFindings(projectId)).toHaveLength(500);
    const large = countQueries(readAll);
    const largeDoc = countQueries(() => buildTrackingDocument(projectId, { light: true }));
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(6);
    expect(largeDoc).toBe(smallDoc);
  });
});

describe('required tier against the real database (DAL filters)', () => {
  const tierOf = (f: FindingDAL.FindingRow) => {
    const [row] = withFindingPriority([f], loadFindingPriorityContext(projectId));
    return { priority: row.priority, reasons: row.priority_reasons };
  };
  const REQUIRED = { priority: 'P1', reasons: ['Error: blocks certification', 'Required by UC-01'] };
  const NOT_REQUIRED = { priority: 'P2', reasons: ['Error: blocks certification'] };

  it('starts required through the DALs (baseline for the cases below)', () => {
    expect(tierOf(finding(ids.checkout, 'error', 'baseline', ids.price))).toEqual(REQUIRED);
  });

  it('a soft-deleted event stops being required', () => {
    const f = finding(ids.checkout, 'error', 'soft-deleted-event', ids.price);
    expect(tierOf(f)).toEqual(REQUIRED);
    EventDAL.deleteEvent(projectId, ids.checkout);
    expect(tierOf(f)).toEqual(NOT_REQUIRED);
  });

  it('a soft-deleted event stops being required even while a requirement still points at it', () => {
    // deleteEvent also marks the requirement a gap (event_id nulled); set deleted_at directly so
    // only the event filter of the priority loader is exercised.
    const f = finding(ids.checkout, 'error', 'soft-deleted-event-sql', ids.price);
    getDb().prepare('UPDATE events SET deleted_at = ? WHERE id = ?').run('2026-10-15T00:00:00.000Z', ids.checkout);
    expect(RequirementDAL.listRequirementsByProject(projectId).some((r) => r.event_id === ids.checkout)).toBe(true);
    expect(tierOf(f)).toEqual(NOT_REQUIRED);
  });

  it('a soft-deleted use case stops making the finding required', () => {
    const f = finding(ids.checkout, 'error', 'soft-deleted-uc', ids.price);
    const uc = UseCaseDAL.listUseCases(projectId).find((u) => u.code === 'UC-01')!;
    UseCaseDAL.deleteUseCase(projectId, uc.id);
    expect(getDb().prepare('SELECT deleted_at FROM use_cases WHERE id = ?').get(uc.id)).toMatchObject({ deleted_at: expect.any(String) });
    expect(tierOf(f)).toEqual(NOT_REQUIRED);
  });

  it('a use case set to dropped stops making the finding required', () => {
    const f = finding(ids.checkout, 'error', 'dropped-uc', ids.price);
    const uc = UseCaseDAL.listUseCases(projectId).find((u) => u.code === 'UC-01')!;
    UseCaseDAL.updateUseCase(projectId, uc.id, { status: 'dropped' });
    expect(tierOf(f)).toEqual(NOT_REQUIRED);
  });

  it('a deleted requirement stops making the finding required', () => {
    const f = finding(ids.checkout, 'error', 'deleted-req', ids.price);
    const uc = UseCaseDAL.listUseCases(projectId).find((u) => u.code === 'UC-01')!;
    RequirementDAL.replaceRequirements(projectId, uc.id, []);
    expect(RequirementDAL.listRequirementsByProject(projectId).filter((r) => r.use_case_id === uc.id)).toHaveLength(0);
    expect(tierOf(f)).toEqual(NOT_REQUIRED);
  });

  it('the same property required on another event of the project does not make it required here', () => {
    EventDAL.attachPropertyToEvent(projectId, ids.pageVisit, { property_id: ids.price });
    expect(tierOf(finding(ids.pageVisit, 'error', 'cross-event', ids.price))).toEqual(NOT_REQUIRED);
    expect(tierOf(finding(ids.checkout, 'error', 'same-event', ids.price))).toEqual(REQUIRED);
  });

  it('a level-R requirement in another project, on same-named entities, never affects this project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const other = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-eu', name: 'Other EU' }).id;
    const otherPageVisit = EventDAL.createEvent(other, { name: 'page_visit', priority: 'critical' });
    const otherPrice = PropertyDAL.createProperty(other, { name: 'price', data_type: 'number', scope: 'event' });
    EventDAL.attachPropertyToEvent(other, otherPageVisit.id, { property_id: otherPrice.id });
    const otherUc = UseCaseDAL.createUseCase(other, { code: 'UC-77', name: 'Foreign', status: 'live' });
    RequirementDAL.replaceRequirements(other, otherUc.id, [
      { target_kind: 'event', event_id: otherPageVisit.id, level: 'R' },
      { target_kind: 'event_property', event_id: otherPageVisit.id, property_id: otherPrice.id, level: 'R' },
    ]);
    EventDAL.attachPropertyToEvent(projectId, ids.pageVisit, { property_id: ids.price });
    const here = withFindingPriority(
      [finding(ids.pageVisit, 'error', 'foreign-event'), finding(ids.pageVisit, 'error', 'foreign-property', ids.price)],
      loadFindingPriorityContext(projectId)
    );
    for (const row of here) {
      expect(row.priority).toBe('P2');
      expect(row.priority_reasons).toEqual(['Error: blocks certification']);
      expect(row.priority_reasons.join('|')).not.toContain('UC-77');
    }
  });
});

describe('GET /api/projects/:projectId/findings', () => {
  let server: http.Server;
  let baseUrl: string;
  beforeEach(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const get = (query = '') => fetch(`${baseUrl}/api/projects/${projectId}/findings${query}`);

  function seedMixed() {
    finding(ids.pageVisit, 'error', 'normal-error'); // P2 (UC-02 is dropped)
    finding(ids.purchase, 'warning', 'tx-warning'); // P2, after the error
    finding(ids.checkout, 'error', 'required-error', ids.price); // P1 required
    finding(ids.viewItem, 'info', 'important-info'); // P4
    finding(ids.purchase, 'error', 'tx-error'); // P1 transactional
    finding(null, 'warning', 'project-warning'); // P4
  }

  it('orders by priority by default and carries the three fields', async () => {
    seedMixed();
    const res = await get();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { message: string; priority: string; priority_rank: number; priority_reasons: string[] }[];
    expect(rows.map((r) => r.message)).toEqual(['tx-error', 'required-error', 'normal-error', 'tx-warning', 'project-warning', 'important-info']);
    expect(rows.map((r) => r.priority)).toEqual(['P1', 'P1', 'P2', 'P2', 'P4', 'P4']);
    expect(rows[1].priority_reasons).toEqual(['Error: blocks certification', 'Required by UC-01']);
    expect(rows.map((r) => r.priority_rank)).toEqual([...rows.map((r) => r.priority_rank)].sort((a, b) => a - b));
    expect((await (await get('?sort=priority')).json()).map((r: { message: string }) => r.message)).toEqual(rows.map((r) => r.message));
  });

  it('?sort=severity keeps the old order (severity, then last seen)', async () => {
    seedMixed();
    const body = (await (await get('?sort=severity')).json()) as { id: string; priority: string }[];
    expect(body.map((r) => r.id)).toEqual(FindingDAL.listFindings(projectId).map((r) => r.id));
    expect(body.every((r) => typeof r.priority === 'string')).toBe(true);
  });

  it('?priority filters and combines with the other filters', async () => {
    seedMixed();
    const p1 = (await (await get('?priority=P1')).json()) as { message: string }[];
    expect(p1.map((r) => r.message)).toEqual(['tx-error', 'required-error']);
    const p1p2Errors = (await (await get('?priority=p1,P2&severity=error')).json()) as { message: string }[];
    expect(p1p2Errors.map((r) => r.message)).toEqual(['tx-error', 'required-error', 'normal-error']);
  });

  it('400s on an unknown sort or priority', async () => {
    const badPriority = await get('?priority=P1,P9');
    expect(badPriority.status).toBe(400);
    expect((await badPriority.json()).code).toBe('PRIORITY_INVALID');
    const badSort = await get('?sort=newest');
    expect(badSort.status).toBe(400);
    expect((await badSort.json()).code).toBe('SORT_INVALID');
  });

  it('GET /:id carries the fields too', async () => {
    const f = finding(ids.purchase, 'info', 'tx-info');
    expect(await (await get(`/${f.id}`)).json()).toMatchObject({ id: f.id, priority: 'P3' });
  });
});

describe('MCP list_findings', () => {
  it('returns priority order, open by default, with an optional priority filter', async () => {
    finding(ids.pageVisit, 'warning', 'normal-warning');
    finding(ids.purchase, 'warning', 'tx-warning');
    const all = await mcpListFindings({ project_key: 'acme-eu' });
    expect(all.map((f) => [f.message, f.priority])).toEqual([
      ['tx-warning', 'P2'],
      ['normal-warning', 'P4'],
    ]);
    expect((await mcpListFindings({ project_key: 'acme-eu', priority: 'P4' })).map((f) => f.message)).toEqual(['normal-warning']);
    await expect(mcpListFindings({ project_key: 'acme-eu', priority: 'urgent' })).rejects.toMatchObject({ code: 'PRIORITY_INVALID' });
  });
});

describe('tracking document, summary and public projection', () => {
  it('cards, unattached findings, summary counts and findings.json carry priority in order', () => {
    finding(ids.pageVisit, 'warning', 'normal-warning');
    finding(ids.pageVisit, 'error', 'normal-error');
    finding(ids.purchase, 'error', 'tx-error');
    finding(ids.checkout, 'error', 'required-error', ids.price);
    finding(null, 'error', 'project-error');
    const doc = buildTrackingDocument(projectId);
    const card = (name: string) => doc.events.find((e) => e.name === name)!;
    expect(card('page_visit').findings.map((f) => [f.message, f.priority])).toEqual([
      ['normal-error', 'P2'],
      ['normal-warning', 'P4'],
    ]);
    expect(card('purchase').findings[0]).toMatchObject({ priority: 'P1', priority_reasons: ['Error: blocks certification', 'Transactional backend event'] });
    expect(doc.unattached_findings[0]).toMatchObject({ message: 'project-error', priority: 'P2', priority_reasons: ['Error: blocks certification'] });
    expect(doc.findings_summary.open_p1_count).toBe(2);

    const summary = buildPublicTrackingDocumentSummary(projectId);
    expect(summary.findings_summary.open_p1_count).toBe(2);
    expect(Object.fromEntries(summary.events.map((e) => [e.name, e.open_p1_count]))).toMatchObject({ purchase: 1, checkout: 1, page_visit: 0 });

    const publicFindings = buildPublicFindings(projectId);
    // Events ordered by their best finding: the transactional P1 first, then the required P1.
    expect(publicFindings.events.map((e) => e.name)).toEqual(['purchase', 'checkout', 'page_visit']);
    expect(publicFindings.events[2].findings.map((f) => f.priority)).toEqual(['P2', 'P4']);
  });

  it('the public projection carries only public reason text', () => {
    finding(ids.checkout, 'error', 'required-error', ids.price);
    finding(ids.purchase, 'warning', 'tx-warning');
    finding(ids.viewItem, 'info', 'important-info');
    const pub = toPublicTrackingDocument(buildTrackingDocument(projectId));
    const publicCodes = new Set(pub.use_cases.map((uc) => uc.code));
    const reasons = [...pub.events.flatMap((e) => e.findings), ...pub.unattached_findings].flatMap((f) => f.priority_reasons ?? []);
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      const required = /^Required by (.+?)(?: \+\d+)?$/.exec(reason);
      if (required) {
        for (const code of required[1].split(', ')) expect(publicCodes.has(code)).toBe(true);
        continue;
      }
      expect(reason).toMatch(/^(Error: blocks certification|Warning|Info|Transactional backend event|Event priority (critical|high))$/);
    }
    const json = JSON.stringify(pub);
    expect(json).not.toContain('SECRET-NOTE');
    expect(reasons.join('|')).not.toContain('Checkout recovery');
  });
});

describe('QA reports freeze priority at capture', () => {
  it('a later event edit does not change a captured report, while the live list follows it', () => {
    // A hand-made open finding that no engine reproduces is resolved by the run, so it is a
    // recorded item (disposition 'resolved') of the captured report.
    finding(ids.purchase, 'error', 'tx-error');
    const result = runComparison(projectId);
    const recordedNow = () => getQaReport(projectId, result.report_id!).items.find((i) => i.recorded.message === 'tx-error')!.recorded;
    expect(recordedNow()).toMatchObject({ priority: 'P1', priority_reasons: ['Error: blocks certification', 'Transactional backend event'] });
    expect(getQaReport(projectId, result.report_id!).items.every((i) => typeof i.recorded.priority === 'string')).toBe(true);
    EventDAL.updateEvent(projectId, ids.purchase, { implementation_method: 'client_web', priority: 'low' });
    expect(recordedNow()).toMatchObject({ priority: 'P1' });
    EventDAL.updateEvent(projectId, ids.purchase, { implementation_method: 'server_api' });

    const f = finding(ids.purchase, 'error', 'tx-error-2');
    const ctx = loadFindingPriorityContext(projectId);
    const [withP] = withFindingPriority([f], ctx);
    const captured = captureQaReport(projectId, { type: 'whole_project' }, {}, [
      { finding: f, disposition: 'produced', priority: { priority: withP.priority, priority_rank: withP.priority_rank, priority_reasons: withP.priority_reasons } },
    ]);
    EventDAL.updateEvent(projectId, ids.purchase, { implementation_method: 'client_web', priority: 'low' });
    const frozen = getQaReport(projectId, captured.id).items[0].recorded;
    expect(frozen).toMatchObject({ priority: 'P1', priority_reasons: ['Error: blocks certification', 'Transactional backend event'] });
    expect(publicReport(projectId, captured.id).items[0].recorded).toMatchObject({ priority: 'P1', priority_rank: withP.priority_rank, priority_reasons: withP.priority_reasons });
    expect(withFindingPriority([f], loadFindingPriorityContext(projectId))[0].priority).toBe('P2');
  });

  it('an older report without priority still loads, publicly too', () => {
    const f = finding(ids.purchase, 'error', 'legacy');
    const captured = captureQaReport(projectId, { type: 'whole_project' }, {}, [{ finding: f, disposition: 'produced' }]);
    const recorded = getQaReport(projectId, captured.id).items[0].recorded;
    expect(recorded).not.toHaveProperty('priority');
    const pub = publicReport(projectId, captured.id).items[0].recorded;
    expect(pub).not.toHaveProperty('priority');
    expect(pub).not.toHaveProperty('priority_reasons');
  });
});
