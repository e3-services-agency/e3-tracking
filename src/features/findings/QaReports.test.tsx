// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, it, expect, vi } from 'vitest';
import { QaReports } from './QaReports';
vi.mock('@/src/features/comments/TargetCollaboration', () => ({ TargetCollaboration: ({ entityType, entityId }: any) => <button>{entityType}:{entityId}</button> }));
vi.mock('@/src/features/comments/useCommentLink', () => ({ useCommentLink: () => ({ kind: 'none' }) }));
let root: Root, node: HTMLDivElement;
afterEach(async () => {
    if (root)
        await act(async () => root.unmount());
    node?.remove();
    vi.unstubAllGlobals();
});
it('shows recorded and current status separately with independent report/finding discussions and no entity request fanout', async () => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const report = { id: 'report', report_sequence: 1, completed_at: '2026-10-08T00:00:00Z', scope: { type: 'whole_project', comparison_ids: ['catalogs'], participating_runs: [] }, summary: { produced: 8, resolved: 0, recorded_counts: { items: 1, produced: 1, newly_resolved: 0 } } }; const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [report] }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...report, items: [{ id: 'item', finding_id: 'finding', finding_sequence: 7, disposition: 'produced', recorded: { kind: 'unmapped_catalog', severity: 'error', status: 'open', message: 'Missing catalog', labels: { event: null, property: null }, expected: { catalog: 'Products' }, actual: null }, current_status: 'resolved', current_acknowledged: true }] }) }); vi.stubGlobal('fetch', fetch); node = document.createElement('div'); document.body.append(node); root = createRoot(node); await act(async () => root.render(<QaReports api={{ mode: 'shared', token: 'test', access: 'read' }} rows={[]} onChanged={() => { }}/>)); expect(node.textContent).toContain('Report ' + '#' + '001'); expect(node.textContent).toContain('qa_report:report'); expect(node.textContent).toContain('1 unique items / 1 produced / 0 newly resolved'); expect(node.textContent).not.toContain('8 produced'); await act(async () => Array.from(node.querySelectorAll('button')).find(b => b.textContent === 'Report ' + '#' + '001')!.click()); expect(node.textContent).toContain('Recorded: open'); expect(node.textContent).toContain('Current finding status: resolved (acknowledged)'); expect(node.textContent).toContain('Finding ' + '#' + '007');expect(node.textContent).not.toContain(String.fromCharCode(65533));expect(node.textContent).not.toContain('unmapped_catalog');expect(node.textContent).toContain('Catalog not mapped');expect(node.textContent).toContain('Recorded: open / error / produced'); expect(node.textContent).toContain('finding:finding'); expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls.every(c => String(c[0]).includes('/api/shared/test/qa-reports'))).toBe(true); });
