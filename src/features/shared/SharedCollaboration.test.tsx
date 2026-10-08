// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedEntityTable, SharedEntityRow } from './SharedEntityTable';
import { SharedActiveEntitySummary } from './SharedActiveEntitySummary';
import { CertificationBadge } from '../events/components/EventCardView';
import { CommentItem } from '../comments/CommentItem';
import { CommentReactions } from '../comments/CommentReactions';
import { CommentStatusBadge } from '../comments/CommentStatusBadge';
import { CommentWorkflowHelp } from '../comments/CommentWorkflowHelp';
import { StatusBadge } from '../../components/ui/badges';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove(); root = undefined; container = undefined;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount(element: React.ReactNode) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
}
function RowHarness({ overlay = false }: { overlay?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const main = useRef<HTMLElement>(null);
  return <main ref={main}>
    {overlay && <SharedActiveEntitySummary container={main} revision={String(expanded)} />}
    <SharedEntityTable label="Events" columns={[{ label: 'Name' }, { label: 'Description' }, { label: 'Actions' }]}>
      <SharedEntityRow anchor="event-click" name="Complete event name" kind="event" expanded={expanded}
        scrollMarginTop={88} onToggle={() => setExpanded(value => !value)}
        cells={[<p key="description">Entire summary description</p>, <span key="actions"><button type="button">Other action</button><a href="#external">Link</a><span tabIndex={0}>Help control</span></span>]}>
        <div>Long expanded content</div>
      </SharedEntityRow>
    </SharedEntityTable>
  </main>;
}
const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };

describe('Shared summary row interaction', () => {
  it('toggles the whole summary while keeping native disclosure keyboard semantics', async () => {
    await mount(<RowHarness />);
    const row = container!.querySelector('#event-click')!;
    const description = row.querySelector('p')!;
    await act(async () => description.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const disclosure = row.querySelector<HTMLButtonElement>('th button')!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure.getAttribute('aria-controls')).toBe('event-click-details');
    expect(row.tagName).toBe('TR');
    expect(row.getAttribute('role')).toBeNull();
    await act(async () => disclosure.click());
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  });
  it('excludes action controls, links, focusable help and text selection', async () => {
    await mount(<RowHarness />);
    const row = container!.querySelector('#event-click')!;
    for (const control of row.querySelectorAll<HTMLElement>('td button, a, [tabindex]')) {
      await act(async () => control.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(row.querySelector('th button')!.getAttribute('aria-expanded')).toBe('false');
    }
    const selection = window.getSelection()!;
    const range = document.createRange(); range.selectNodeContents(row.querySelector('p')!);
    selection.removeAllRanges(); selection.addRange(range);
    await act(async () => row.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(row.querySelector('th button')!.getAttribute('aria-expanded')).toBe('false');
    selection.removeAllRanges();
  });
  it('does not toggle when selecting the entity name, while native keyboard activation still works', async () => {
    await mount(<RowHarness />);
    const row = container!.querySelector('#event-click')!;
    const disclosure = row.querySelector<HTMLButtonElement>('th button')!;
    const name = Array.from(disclosure.querySelectorAll('span')).find(span => span.textContent === 'Complete event name')!;
    const selection = window.getSelection()!;
    const range = document.createRange(); range.selectNodeContents(name);
    selection.removeAllRanges(); selection.addRange(range);
    await act(async () => name.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    await act(async () => disclosure.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    selection.removeAllRanges();
    await act(async () => name.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  });
  it('bounds the active-body summary, hides outside its body and restores collapse focus/scroll', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 700); vi.stubGlobal('scrollY', 500);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await mount(<RowHarness overlay />);
    const row = container!.querySelector<HTMLTableRowElement>('#event-click')!;
    const button = row.querySelector<HTMLButtonElement>('th button')!;
    vi.spyOn(container!.querySelector('main')!, 'getBoundingClientRect').mockReturnValue({ left: 16, right: 374 } as DOMRect);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ bottom: 40, top: -200 } as DOMRect);
    await act(async () => button.click());
    const details = container!.querySelector('#event-click-details')!;
    const body = vi.spyOn(details, 'getBoundingClientRect').mockReturnValue({ top: -100, bottom: 1500, height: 1600 } as DOMRect);
    window.dispatchEvent(new Event('scroll')); await tick();
    const bar = document.querySelector<HTMLElement>('[aria-label="Active expanded entity"]')!;
    expect(bar).not.toBeNull();
    expect(bar.style.top).toBe('56px'); expect(bar.style.width).toBe('358px');
    expect(bar.textContent).toContain('Complete event name');
    body.mockReturnValue({ top: -1400, bottom: 100, height: 1500 } as DOMRect);
    window.dispatchEvent(new Event('scroll')); await tick();
    expect(document.querySelector('[aria-label="Active expanded entity"]')).toBeNull();
    body.mockReturnValue({ top: -100, bottom: 1500, height: 1600 } as DOMRect);
    window.dispatchEvent(new Event('scroll')); await tick();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Collapse Complete event name"]')!.click());
    await tick();
    expect(container!.querySelector('#event-click-details')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(scroll).toHaveBeenCalledWith({ top: 204, behavior: 'auto' });
  });
});

describe('Certification and comment workflow controls', () => {
  it('opens actual derived certification blockers on focus, including acknowledged errors', async () => {
    await mount(<CertificationBadge compact certification={{ applicable: true, certified: false,
      reasons: ['open_errors: 2', 'acknowledged_errors: 1', 'no_observations'] }} />);
    const control = container!.querySelector<HTMLSpanElement>('[tabindex="0"]')!;
    await act(async () => control.focus());
    const help = document.querySelector('[role="tooltip"]')!;
    expect(help.textContent).toContain('2 open error finding(s).');
    expect(help.textContent).toContain('still reproducing');
    expect(help.textContent).toContain('non-archived QA run');
    expect(help.textContent).not.toContain('fix or resolve');
  });
  it('explains SDK/platform certification as not applicable', async () => {
    await mount(<CertificationBadge compact certification={{ applicable: false, certified: false, reasons: ['not_applicable'] }} />);
    await act(async () => container!.querySelector<HTMLElement>('[tabindex="0"]')!.focus());
    expect(document.querySelector('[role="tooltip"]')!.textContent).toContain('SDK and platform events are not validated');
  });
  it('offers Seen/Like only even with legacy On it evidence', async () => {
    const onReact = vi.fn();
    await mount(<CommentReactions reactions={[{ kind: 'on_it', count: 1, authors: ['Legacy'] }]} isRoot ownName="" nameRequired={false} busy={false} onReact={onReact} />);
    expect(Array.from(container!.querySelectorAll('button')).map(button => button.textContent)).toEqual(['Seen', 'Like']);
    await act(async () => container!.querySelector<HTMLButtonElement>('button')!.click());
    expect(onReact).toHaveBeenCalledWith('seen');
  });
  it.each(['internal', 'comment', 'read'] as const)('keeps %s status/reaction permissions and comment labels', async access => {
    const onReact = vi.fn();
    const thread = { id: 'thread', author_name: 'Author', via_share: false, body: 'Body', created_at: '2026-10-08',
      resolved_at: null, resolved_by: null, parent_id: null, status: 'open' as const, replies: [] };
    await mount(<ul><CommentItem thread={thread} mode={access === 'internal' ? 'internal' : 'shared'}
      canComment={access !== 'read'} busy={false} onSetStatus={() => {}} onReply={async () => true}
      fileUrl={value => value} onReact={onReact} /></ul>);
    const labels = Array.from(container!.querySelectorAll('select option')).map(option => option.textContent);
    if (access === 'internal') expect(labels).toEqual(['Open', 'In progress', 'Done', "Won't do"]);
    else if (access === 'comment') expect(labels).toEqual(['Set status…', 'In progress', 'Done']);
    else {
      expect(labels).toEqual([]);
      expect(container!.querySelector('textarea')).toBeNull();
      const reactions = container!.querySelectorAll<HTMLButtonElement>('[data-testid="comment-reactions"] button');
      expect(reactions).toHaveLength(2);
      expect(Array.from(reactions).every(button => button.disabled)).toBe(true);
      await act(async () => reactions[0].click());
      expect(onReact).not.toHaveBeenCalled();
    }
  });
  it('keeps a closed shared thread without reopening controls', async () => {
    const thread = { id: 'closed', author_name: 'Author', via_share: false, body: 'Body', created_at: '2026-10-08',
      resolved_at: '2026-10-08', resolved_by: 'Author', parent_id: null, status: 'done' as const, replies: [] };
    await mount(<ul><CommentItem thread={thread} mode="shared" canComment busy={false}
      onSetStatus={() => {}} onReply={async () => true} fileUrl={value => value} /></ul>);
    expect(container!.querySelector('select')).toBeNull();
    expect(container!.textContent).toContain('Done');
  });
  it('limits In progress wording to comments', async () => {
    await mount(<><CommentStatusBadge status="on_it" /><StatusBadge status="on_it" /></>);
    expect(container!.textContent).toBe('In progressOn it');
  });
  it.each(['internal', 'comment', 'read'] as const)('explains %s capabilities without granting assignment or reopening', async access => {
    await mount(<CommentWorkflowHelp api={access === 'internal' ? { mode: 'internal', projectId: 'p' } : { mode: 'shared', token: 't', access }} />);
    expect(container!.querySelector('details summary')!.textContent).toBe('How it works');
    const text = container!.textContent!;
    expect(text).toContain('does not assign anyone');
    expect(text).toContain('does not fix a finding or certify an event');
    if (access === 'internal') expect(text).toContain('Internal users can reopen');
    else if (access === 'read') expect(text).toContain('cannot post, react or change status');
    else expect(text).toContain('only internal staff can reopen them');
  });
});
