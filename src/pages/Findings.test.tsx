// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Findings, type FindingRow } from './Findings';
import { commentFragment } from '@/src/features/comments/commentLinks';
const state = vi.hoisted(() => ({ project: 'project-a', qaIds: [] as string[], qaLoading: false,
  pending: null as string | null, setPending: vi.fn(), eventCard: vi.fn(), tab: vi.fn(), requests: [] as string[],
  rows: [] as FindingRow[], handler: null as null | ((url: string, init?: RequestInit) => Promise<Response>),
}));
vi.mock('@/src/features/projects/context/ProjectShellContext', () => ({ useProjectShell: () => ({ activeProjectId: state.project, hasValidProjectContext: !!state.project }) }));
vi.mock('@/src/features/comments/TargetCollaboration', () => ({ useProjectComments: () => ({ rows: [], reload: vi.fn() }), TargetCollaboration: (props: {entityId: string; forceOpen?: boolean}) => <span data-comment-target={props.entityId} data-open={props.forceOpen || undefined}>Comments</span> }));
vi.mock('@/src/features/findings/QaReports', () => ({ QaReports: (props: {currentFindingIds: string[]; currentFindingsLoading: boolean}) => { state.qaIds = props.currentFindingIds; state.qaLoading = props.currentFindingsLoading; return <section aria-label="QA reports">QA reports</section>; } }));
vi.mock('@/src/store', () => ({ useStore: (selector: (s: unknown) => unknown) => selector({ pendingFindingsRunId: state.pending, setPendingFindingsRunId: state.setPending, setRequestedTab: state.tab, setEventCardEventId: state.eventCard }) }));
vi.mock('@/src/lib/api', () => ({ fetchWithAuth: (url: string, init?: RequestInit) => { state.requests.push(url); return state.handler ? state.handler(url, init) : serve(url, init); } }));
const json = (data: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data } as Response);
const row = (sequence: number, extra: Partial<FindingRow> = {}): FindingRow => ({ id: `f-${sequence}`, finding_sequence: sequence,
  comparison: 'definition_vs_observations', kind: 'missing_required', severity: sequence % 2 ? 'warning' : 'info', event_id: 'event-a',
  property_id: null, observation_id: null, qa_run_id: 'run-a', message: `Message ${sequence}`, status: 'open', resolved_by: null,
  last_seen_at: '2026-10-19T10:00:00Z', priority: 'P4', priority_rank: sequence, ...extra });
function serve(url: string, init?: RequestInit): Promise<Response> {
  if (url.endsWith('/events')) return json([{ id: 'event-a', name: 'checkout' }]);
  if (init?.method === 'PATCH') { const id = url.split('/').at(-1); const next = JSON.parse(init.body as string).status;
    state.rows = state.rows.map(f => f.id === id ? { ...f, status: next, resolved_by: next === 'resolved' ? 'user' : null } : f); return json({}); }
  if (init?.method === 'POST') return json({});
  const params = new URL(url, 'http://localhost').searchParams;
  return json(state.rows.filter(f => ['comparison', 'kind', 'severity', 'priority', 'event_id', 'status', 'qa_run_id'].every(key => !params.get(key) || f[key as keyof FindingRow] === params.get(key))));
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.project = 'project-a'; state.rows = Array.from({length: 127}, (_, i) => row(i + 1)); state.requests = []; state.handler = null; state.pending = null;
  state.qaIds = []; state.eventCard.mockClear(); state.tab.mockClear(); localStorage.clear();
  window.history.replaceState(null, '', '/tracking-plan/p/project-a/findings');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const mount = async () => { await act(async () => root.render(<Findings />)); };
const table = () => container.querySelector('[aria-label="Findings table"]')!;
const rows = () => Array.from(table().querySelectorAll('tbody tr[data-row-id]'));
const click = async (label: string) => { await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()); };
const select = async (label: string, value: string) => { await act(async () => { const input = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; input.value = value; input.dispatchEvent(new Event('change', {bubbles: true})); }); };
const search = async (value: string) => { await act(async () => { const input = container.querySelector<HTMLInputElement>('[aria-label="Search findings"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', {bubbles: true})); }); };
const overview = () => container.querySelector('[aria-label="Project findings overview"]')!.textContent;

describe('Internal Findings bounded pages and canonical overview', () => {
  it('renders 50 rows, real numbered ranges and full filtered QA scope; overview is invariant across pages', async () => {
    await mount(); expect(rows()).toHaveLength(50); expect(rows()[0].getAttribute('data-row-id')).toBe('f-1');
    expect(state.qaIds).toHaveLength(127); const summary = overview();
    await click('Next findings page'); expect(rows()).toHaveLength(50); expect(rows()[0].getAttribute('data-row-id')).toBe('f-51');
    expect(container.textContent).toContain('Showing 51–100 of 127 filtered findings'); expect(overview()).toBe(summary); expect(state.qaIds).toHaveLength(127);
    await click('Last findings page'); expect(rows()).toHaveLength(27); expect(container.textContent).toContain('Page 3 of 3');
    await click('First findings page'); expect(rows()[0].getAttribute('data-row-id')).toBe('f-1');
    expect(container.querySelector('[data-testid="view-toolbar"]')).not.toBeNull();
  });
  it('filters/searches full scope, resets page, preserves project totals and uses labelled shared density controls', async () => {
    await mount(); await click('Last findings page');
    await select('Filter by severity', 'info'); expect(rows()).toHaveLength(50); expect(state.qaIds).toHaveLength(63);
    expect(container.textContent).toContain('Showing 1–50 of 63 filtered findings'); expect(overview()).toContain('127 open');
    await search('Message 126'); expect(rows()).toHaveLength(1); expect(state.qaIds).toEqual(['f-126']); expect(overview()).toContain('127 open');
    await search('not-found'); expect(rows()).toHaveLength(0); expect(container.textContent).toContain('Showing 0–0 of 0');
    const compact = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Compact')!;
    await act(async () => compact.click()); expect(compact.getAttribute('aria-pressed')).toBe('true');
  });
  it('resets on page size and sorting, and keeps backend natural order until explicitly sorted', async () => {
    state.rows.reverse(); await mount(); expect(rows()[0].getAttribute('data-row-id')).toBe('f-127'); await click('Last findings page');
    await select('Findings per page', '25'); expect(rows()).toHaveLength(25); expect(rows()[0].getAttribute('data-row-id')).toBe('f-127');
    await click('Next findings page'); const priority = Array.from(table().querySelectorAll<HTMLButtonElement>('thead button')).find(b => b.textContent?.startsWith('Priority'))!;
    await act(async () => priority.click()); expect(rows()[0].getAttribute('data-row-id')).toBe('f-1'); expect(container.textContent).toContain('Page 1 of 6');
  });
  it('distinguishes open, attached/unattached acknowledgements and automatic resolution', async () => {
    state.rows = [row(1), row(2, {status:'resolved', resolved_by:'user'}), row(3, {status:'resolved', resolved_by:'user', event_id:null}), row(4, {status:'resolved'})];
    await mount(); expect(overview()).toContain('1 open'); expect(overview()).toContain('2 acknowledged'); expect(overview()).toContain('1 resolved'); expect(overview()).toContain('4 total recorded findings'); expect(rows()).toHaveLength(1);
    await select('Filter by status', 'resolved'); expect(rows()).toHaveLength(3); expect(overview()).toContain('1 open');
  });
  it('reveals a resolved linked finding outside page 1 and filters, then permits ordinary page navigation', async () => {
    state.rows.push(row(128, {status:'resolved', resolved_by:'user'}));
    window.history.replaceState(null, '', commentFragment({entityType:'finding',entityId:'f-128',threadId:'thread',commentId:'comment'}));
    await mount(); expect(container.textContent).toContain('Page 3 of 3'); expect(rows().some(r => r.getAttribute('data-row-id') === 'f-128')).toBe(true);
    expect(container.querySelector('[data-comment-target="f-128"]')?.getAttribute('data-open')).toBe('true'); expect(state.qaLoading).toBe(false);
    await click('First findings page'); expect(rows()[0].getAttribute('data-row-id')).toBe('f-1');
    await act(async () => { window.history.replaceState(null, '', commentFragment({entityType:'finding',entityId:'f-128',threadId:'thread',commentId:'other-comment'})); window.dispatchEvent(new Event('hashchange')); });
    expect(container.textContent).toContain('Page 3 of 3'); expect(rows().some(r => r.getAttribute('data-row-id') === 'f-128')).toBe(true);
  });
  it('keeps event navigation and resolve/reopen, refreshing overview and clamping a shrunken page', async () => {
    state.rows = Array.from({length:51}, (_, i) => row(i + 1)); await mount(); await click('Last findings page');
    const event = Array.from(table().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'checkout')!;
    await act(async () => event.click()); expect(state.eventCard).toHaveBeenCalledWith('event-a'); expect(state.tab).toHaveBeenCalledWith('eventCard');
    const resolve = Array.from(table().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Resolve')!;
    await act(async () => resolve.click()); expect(rows()).toHaveLength(50); expect(container.textContent).toContain('Page 1 of 1'); expect(overview()).toContain('50 open'); expect(overview()).toContain('1 acknowledged');
    await select('Filter by status', 'resolved'); const reopen = Array.from(table().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Reopen')!;
    await act(async () => reopen.click()); expect(rows()).toHaveLength(0); expect(overview()).toContain('51 open');
  });
  it.each(['Resolve', 'Run comparison'])('refreshes current filters after a deferred %s succeeds', async action => {
    await mount(); let finish!: (res: Response) => void;
    state.handler = (url, init) => init?.method === 'PATCH' || init?.method === 'POST' ? new Promise(resolve => { finish = resolve; }) : serve(url);
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === action)!;
    await act(async () => button.click());
    await select('Filter by severity', 'info');
    await act(async () => finish(await json({})));
    expect(rows()).toHaveLength(50); expect(rows()[0].getAttribute('data-row-id')).toBe('f-2');
    expect(state.qaIds).toHaveLength(63); expect(container.textContent).not.toContain('Loading filtered findings');
  });
  it('discards late old-project responses and resets scope and pages on project switch', async () => {
    let release!: (res:Response) => void;
    state.handler = url => url.includes('project-a/findings') ? new Promise(resolve => { release = resolve; }) : serve(url);
    await mount(); state.project = 'project-b'; state.rows = [row(200)]; await mount(); expect(rows()).toHaveLength(1);
    await act(async () => release(await json([row(1)]))); expect(rows()[0].getAttribute('data-row-id')).toBe('f-200'); expect(overview()).toContain('1 open');
  });
  it('discards stale filter responses and keeps errors distinct from empty/loading', async () => {
    await mount(); let delayed!: (res:Response) => void;
    state.handler = url => url.includes('severity=warning') ? new Promise(resolve => { delayed = resolve; }) : serve(url);
    await select('Filter by severity', 'warning'); await select('Filter by severity', 'info');
    await act(async () => delayed(await json([row(1)]))); expect(rows()[0].getAttribute('data-row-id')).toBe('f-2');
    state.handler = url => url.includes('?') ? json({error:'Failed fixture'},500) : serve(url);
    await select('Filter by severity', 'error'); expect(container.querySelector('[role="alert"]')!.textContent).toBe('Failed fixture'); expect(container.textContent).not.toContain('No findings match'); expect(container.textContent).not.toContain('Loading filtered');
  });
  it('handles empty project and rejects malformed full-project overview without inventing zero counts', async () => {
    state.rows = []; await mount(); expect(overview()).toContain('0 open'); expect(rows()).toHaveLength(0);
    state.handler = url => url.endsWith('/findings') ? json({unexpected:true}) : serve(url);
    state.project = 'project-c'; await mount(); expect(overview()).toContain('could not be loaded'); expect(overview()).not.toContain('0 open'); expect(state.qaLoading).toBe(false);
  });
});
