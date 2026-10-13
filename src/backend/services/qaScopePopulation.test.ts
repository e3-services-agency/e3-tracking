/** T-5-31: qa_scope, manifest samples[], population-aware missing_event, backup/CSV carry the column. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as FindingDAL from '../dal/finding.dal';
import { runComparison } from './comparison.service';
import { buildTrackingDocument, toPublicTrackingDocument } from './document.service';
import { buildCsvRows } from './csvExport.service';
import { tableColumns } from './backup.service';
import { deriveQaScope, effectiveQaScope } from '../../domain/qaScope';
import { qaSamples } from '../../domain/import/qaSampleManifest';
import { missingEventMessage, findSample } from '../../domain/comparison/definitionVsObservations';

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

describe('qa_scope', () => {
  it('derives from status, class and implementation method; override wins', () => {
    expect(deriveQaScope({ status: 'active', class: 'custom', implementation_method: 'client_web' })).toBe(true);
    expect(deriveQaScope({ status: 'ignored', class: 'custom', implementation_method: 'client_web' })).toBe(false);
    expect(deriveQaScope({ status: 'active', class: 'platform', implementation_method: 'client_web' })).toBe(false);
    expect(deriveQaScope({ status: 'active', class: 'custom', implementation_method: 'sdk_auto' })).toBe(false);
    expect(effectiveQaScope({ status: 'ignored', class: 'custom', implementation_method: 'client_web' }, true)).toBe(true);
    expect(effectiveQaScope({ status: 'active', class: 'custom', implementation_method: 'client_web' }, false)).toBe(false);
  });

  it('is in the tracking document and its public projection, with the override applied', () => {
    EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });
    const sdk = EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });
    const forced = EventDAL.createEvent(projectId, { name: 'forced', class: 'custom', qa_scope_override: false });
    const doc = buildTrackingDocument(projectId);
    const by = (n: string) => doc.events.find((e) => e.name === n)!;
    expect(by('cart_update').qa_scope).toBe(true);
    expect(by('session_start').qa_scope).toBe(false);
    expect(by('forced').qa_scope).toBe(false);
    expect(toPublicTrackingDocument(doc).events.find((e) => e.name === 'forced')!.qa_scope).toBe(false);
    EventDAL.updateEvent(projectId, sdk.id, { qa_scope_override: true });
    expect(buildTrackingDocument(projectId).events.find((e) => e.name === 'session_start')!.qa_scope).toBe(true);
    EventDAL.updateEvent(projectId, sdk.id, { qa_scope_override: null });
    expect(buildTrackingDocument(projectId).events.find((e) => e.name === 'session_start')!.qa_scope).toBe(false);
    expect(() => EventDAL.updateEvent(projectId, sdk.id, { qa_scope_override: 'yes' as unknown as boolean })).toThrow();
  });

  it('is carried by backup (live columns) and CSV', () => {
    expect(tableColumns('events')).toContain('qa_scope_override');
    EventDAL.createEvent(projectId, { name: 'a', class: 'custom', qa_scope_override: true });
    const rows = buildCsvRows(projectId, 'events');
    expect(rows[0].qa_scope_override).toBe('true');
  });
});

describe('manifest samples[]', () => {
  it('keeps valid entries, ignores unknown fields, warns on malformed ones', () => {
    const { samples, warnings } = qaSamples({
      samples: [
        { event: 'cart_update', variant: 'add', filter_matched: 10, customers_read: 5, events_read: 7, extra: 1 },
        { event: 'purchase', filter_matched: 0, customers_read: 0, events_read: 0 },
        { event: 'bad', variant: null, filter_matched: -1, customers_read: 1, events_read: 1 },
        'nope',
      ],
    });
    expect(samples).toEqual([
      { event: 'cart_update', variant: 'add', filter_matched: 10, customers_read: 5, events_read: 7 },
      { event: 'purchase', variant: null, filter_matched: 0, customers_read: 0, events_read: 0 },
    ]);
    expect(warnings).toHaveLength(2);
    expect(qaSamples({}).samples).toEqual([]);
    expect(qaSamples({ samples: 3 }).warnings).toHaveLength(1);
  });
});

describe('population-aware missing_event', () => {
  const s = (m: number, r: number) => ({ event: 'e', variant: null, filter_matched: m, customers_read: r, events_read: 0 });
  it('has three wordings', () => {
    expect(missingEventMessage('e', null, s(120, 30))).toBe('0 of 120 matched customers carried e (30 read).');
    expect(missingEventMessage('e', 'add', { ...s(4, 2), variant: 'add' })).toBe('0 of 4 matched customers carried e[add] (2 read).');
    expect(missingEventMessage('e', null, s(0, 0))).toContain('No customer matched the filter for e');
    expect(qaSamples({ samples: [{ event: 'a', variant: null, filter_matched: 1, customers_read: 1, events_read: 1 }, { event: 'a', filter_matched: 5, customers_read: 2, events_read: 1 }] }).samples).toEqual([{ event: 'a', variant: null, filter_matched: 5, customers_read: 2, events_read: 1 }]);
    const many = Array.from({ length: 2001 }, (_, i) => ({ event: `e${i}`, variant: null, filter_matched: 1, customers_read: 1, events_read: 1 }));
    const capped = qaSamples({ samples: many });
    expect(capped.samples).toHaveLength(2000);
    expect(capped.warnings[0]).toContain('2000');
    expect(missingEventMessage('e', null, null)).toBe('Event "e" has zero observations in scope.');
    expect(missingEventMessage('e', null, s(5, 0))).toBe('Event "e" has zero observations in scope.');
    expect(missingEventMessage('e', null, null, 25)).toBe('Event "e" was not found in a sample of 25 customers (population not checked).');
    expect(missingEventMessage('e', null, null, null)).toBe('Event "e" has zero observations in scope.');
    expect(findSample([s(1, 1), s(9, 3)], 'e')!.filter_matched).toBe(9);
  });

  it('end to end: message and population on the finding, same fingerprint', () => {
    EventDAL.createEvent(projectId, { name: 'wishlist', class: 'custom' });
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    runComparison(projectId);
    const find = () => FindingDAL.listFindings(projectId, {}).find((f) => f.kind === 'missing_event')!;
    const before = find();
    expect(before.message).toContain('zero observations');
    getDb().prepare('UPDATE qa_runs SET samples_json=? WHERE id=?').run(JSON.stringify([{ event: 'wishlist', variant: null, filter_matched: 50, customers_read: 20, events_read: 0 }]), run.id);
    runComparison(projectId);
    const after = find();
    expect(after.id).toBe(before.id);
    expect(after.message).toBe('0 of 50 matched customers carried wishlist (20 read).');
    expect((after.actual_json as { population: { filter_matched: number } }).population.filter_matched).toBe(50);
  });
});

describe('applyQaSample with a samples[] block', () => {
  it('stores samples_json, returns it on the run, warns on a malformed entry, and uses facts for the fallback wording', async () => {
    const { buildQaSampleDocs } = await import('../../domain/import/__fixtures__/qa-sample/build');
    const { previewQaSample, applyQaSample } = await import('./qaSampleImport.service');
    const base = buildQaSampleDocs();
    const manifest = {
      ...(base.manifest as Record<string, unknown>),
      sample: { method: 'spaced_clusters', requested: 10, read: 10 },
      samples: [
        { event: 'never_sent', variant: null, filter_matched: 7, customers_read: 3, events_read: 0 },
        { event: 'broken', filter_matched: 'x' },
      ],
    };
    const docs = { ...base, manifest };
    const preview = previewQaSample(projectId, docs);
    expect(preview.warnings.some((w) => w.includes('manifest.samples[1]'))).toBe(true);
    EventDAL.createEvent(projectId, { name: 'never_sent', class: 'custom' });
    EventDAL.createEvent(projectId, { name: 'other_missing', class: 'custom' });
    const res = applyQaSample(projectId, docs, preview.payload_hash, [], 'tester');
    const stored = QaRunDAL.listQaRuns(projectId).find((r) => r.id === res.run.id)!;
    expect(stored.samples_json).toEqual([{ event: 'never_sent', variant: null, filter_matched: 7, customers_read: 3, events_read: 0 }]);
    const msgs = FindingDAL.listFindings(projectId, {}).filter((f) => f.kind === 'missing_event').map((f) => f.message);
    expect(msgs).toContain('0 of 7 matched customers carried never_sent (3 read).');
    expect(msgs).toContain('Event "other_missing" was not found in a sample of 10 customers (population not checked).');
  });
});

describe('fallback customers-read is not double counted', () => {
  const mk = (generated_at: string, read: number, samples?: unknown[]) =>
    getDb().prepare('UPDATE qa_runs SET manifest_json=?, samples_json=? WHERE id=?').run(
      JSON.stringify({ generated_at, build: 'b1', sample: { read } }),
      samples ? JSON.stringify(samples) : null,
      QaRunDAL.createQaRun(projectId, { kind: 'export_paste' }).id
    );
  const msg = () => FindingDAL.listFindings(projectId, {}).find((f) => f.kind === 'missing_event')!.message;
  it('uses the max across populations and counts a re-imported run once; filter_matched 0 carries population', () => {
    EventDAL.createEvent(projectId, { name: 'wishlist', class: 'custom' });
    mk('2026-01-01', 10);
    mk('2026-01-01', 10);
    runComparison(projectId);
    expect(msg()).toContain('sample of 10 customers');
    mk('2026-01-02', 25);
    runComparison(projectId);
    expect(msg()).toContain('sample of 25 customers');
    mk('2026-01-03', 5, [{ event: 'wishlist', variant: null, filter_matched: 0, customers_read: 0, events_read: 0 }]);
    runComparison(projectId);
    const f = FindingDAL.listFindings(projectId, {}).find((x) => x.kind === 'missing_event')!;
    expect(f.message).toContain('No customer matched');
    expect((f.actual_json as { population: unknown }).population).toEqual({ filter_matched: 0, customers_read: 0, events_read: 0 });
  });
});
