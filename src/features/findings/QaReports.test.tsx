// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, it, expect, vi } from 'vitest';
import { QaReports } from './QaReports';
vi.mock('@/src/features/comments/TargetCollaboration', () => ({ TargetCollaboration: ({ entityType, entityId }: any) => <button>{entityType}:{entityId}</button> }));
const commentLinkState = vi.hoisted(() => ({ value: { kind: 'none' } as any }));
vi.mock('@/src/features/comments/useCommentLink', () => ({ useCommentLink: () => commentLinkState.value }));
let root: Root, node: HTMLDivElement;
afterEach(async () => {
    if (root)
        await act(async () => root.unmount());
    node?.remove();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
    commentLinkState.value = { kind: 'none' };
});
it('preserves historical report discussion selection and offers the canonical native action', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const id = '22222222-2222-4222-8222-222222222222';
    commentLinkState.value = { kind: 'target', target: { threadId: 'thread', entityId: id, entityType: 'qa_report' } };
    const report = { id, report_sequence: 3, completed_at: '2026-10-18T00:00:00Z', scope: { type: 'historical_file_validation' }, summary: { checked: 1, failed: 0, skipped: 1, recorded_counts: { items: 0, produced: 0, newly_resolved: 0 } } };
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (String(url).endsWith('/qa-reports')) return Promise.resolve({ ok: true, json: async () => [report] });
        if (String(url).endsWith('/qa-reports/' + id)) return Promise.resolve({ ok: true, json: async () => ({ ...report, items: [] }) });
        return new Promise(() => {}); // Private details load separately from report discussions.
    }));
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
    await act(async () => root.render(<QaReports api={{ mode: 'internal', projectId: 'project' }} rows={[{ id: 'thread', entity_id: id }] as never} onChanged={() => { }}/>));
    expect(node.querySelector('#qa-report-' + id)).not.toBeNull();
    await act(async () => Array.from(node.querySelectorAll('button')).find(b => b.textContent === 'Report ' + '#' + '003')!.click());
    expect(node.querySelector('a[href="/api/projects/project/historical-files/reports/' + id + '/view"]')?.textContent).toBe('Open historical report');
});
it('opens a historical deep link in existing QA navigation with filenames, Drive links and bounded native checks', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const id = '11111111-1111-4111-8111-111111111111';
    window.history.replaceState(null, '', '/tracking-plan/p/native/findings#qa-report-' + id);
    const report = { id, report_sequence: 2, completed_at: '2026-10-18T00:00:00Z', scope: { type: 'historical_file_validation' }, summary: { checked: 4, failed: 1, skipped: 3, recorded_counts: { items: 0, produced: 0, newly_resolved: 0 } } };
    const source = { id: 'source', filename: 'reviewed-purchases.csv', source_ref: 'https://drive.google.com/file/d/reviewed/view', sha256: 'a'.repeat(64), source_captured_at: null, uploaded_at: '2026-10-18T00:00:00Z' };
    const native = { report_sequence: 2, report_url: '/api/projects/project/historical-files/reports/' + id + '/view', detail_url: '/api/projects/project/historical-files/reports/' + id + '/view', tracking_url: '/tracking-plan/p/native/findings#qa-report-' + id, definition_hash: 'b'.repeat(64), engine_hash: 'c'.repeat(64), created_at: report.completed_at, totals: { passed: 3, failed: 1, skipped: 3, checked: 4 }, unmapped_columns: 1, sources: [source], files: [{ source_id: 'source', rows: 2, columns: 2, padded_records: 0, event_id: 'event', event_name: 'purchase' }], source_availability: [{ source_id: 'source', available: true }], limitations: ['No original event timestamps are inferred.'], policy: { rowReference: 'CSV record number' }, checks: [{ source_id: 'source', column: 'value', check: 'csv_lexical_type', outcome: 'failed', count: 1, rows: [2], reason: 'Current definition compatibility requires review.' }], checks_total: 1, offset: 0, limit: 100 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [report] }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...report, items: [] }) }).mockResolvedValueOnce({ ok: true, json: async () => native }));
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
    await act(async () => root.render(<QaReports api={{ mode: 'internal', projectId: 'project' }} rows={[]} onChanged={() => { }}/>));
    const anchor = node.querySelector('#qa-report-' + id);
    expect(anchor).not.toBeNull();
    const nativeLinks = Array.from(node.querySelectorAll('a')).filter(a => a.getAttribute('href') === '/api/projects/project/historical-files/reports/' + id + '/view');
    expect(nativeLinks.map(a => a.textContent)).toEqual(['Open historical report', 'Permanent link to this report']);
    expect(node.textContent).toContain('Historical source files'); expect(node.textContent).toContain('Historical source-file validation');
    expect(node.textContent).toContain('reviewed-purchases.csv'); expect(node.textContent).toContain('1 failed checks'); expect(node.textContent).toContain('3 skipped / not assessed'); expect(node.textContent).toContain('1 unmapped source-only columns');
    expect(node.querySelector('a[href="https://drive.google.com/file/d/reviewed/view"]')).not.toBeNull();
    expect(node.querySelector('a[href="/tracking-plan/p/native/events/event/card"]')).not.toBeNull();
    expect(node.textContent).toContain('separate from observed-event QA');
    expect(node.textContent).not.toContain('No produced or newly resolved findings in this report.');
});
it('shows recorded and current status separately with independent report/finding discussions and no entity request fanout', async () => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const report = { id: 'report', report_sequence: 1, completed_at: '2026-10-08T00:00:00Z', scope: { type: 'whole_project', comparison_ids: ['catalogs'], participating_runs: [] }, summary: { produced: 8, resolved: 0, recorded_counts: { items: 1, produced: 1, newly_resolved: 0 } } }; const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [report] }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...report, items: [{ id: 'item', finding_id: 'finding', finding_sequence: 7, disposition: 'produced', recorded: { kind: 'unmapped_catalog', severity: 'error', status: 'open', message: 'Missing catalog', labels: { event: null, property: null }, expected: { catalog: 'Products' }, actual: null }, current_status: 'resolved', current_acknowledged: true }] }) }); vi.stubGlobal('fetch', fetch); node = document.createElement('div'); document.body.append(node); root = createRoot(node); await act(async () => root.render(<QaReports api={{ mode: 'shared', token: 'test', access: 'read' }} rows={[]} onChanged={() => { }}/>)); expect(node.textContent).toContain('Report ' + '#' + '001'); expect(node.textContent).toContain('qa_report:report'); expect(node.textContent).not.toContain('Open historical report'); expect(node.textContent).toContain('1 unique items / 1 produced / 0 newly resolved'); expect(node.textContent).not.toContain('8 produced'); await act(async () => Array.from(node.querySelectorAll('button')).find(b => b.textContent === 'Report ' + '#' + '001')!.click()); expect(node.textContent).toContain('Recorded: open'); expect(node.textContent).toContain('Current finding status: resolved (acknowledged)'); expect(node.textContent).toContain('Finding ' + '#' + '007');expect(node.textContent).not.toContain(String.fromCharCode(65533));expect(node.textContent).not.toContain('unmapped_catalog');expect(node.textContent).toContain('Catalog not mapped');expect(node.textContent).toContain('Recorded: open / error / produced'); expect(node.textContent).toContain('finding:finding'); expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls.every(c => String(c[0]).includes('/api/shared/test/qa-reports'))).toBe(true); });
