// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SharedProject } from '@/src/pages/SharedProject';
import { Comments } from '@/src/pages/Comments';
import { CommentCopyActions } from './CommentCopyActions';
import { commentFragment, parseCommentLink, type CommentLinkTarget } from './commentLinks';
import { emptyEventCard } from './commentLinkFixtures';
import type { CommentPanelRow } from './CommentsPanel';
import { useStore } from '@/src/store';
vi.mock('@/src/features/projects/context/ProjectShellContext', () => ({ useProjectShell: () => ({ activeProjectId: 'internal-project', hasValidProjectContext: true }) }));

let root: Root | undefined;
let container: HTMLDivElement;
let writeText: ReturnType<typeof vi.fn>;
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const image = { id: 'image', file_path: 'project/comments/root/visible.png', mime: 'image/png', width: 10, height: 10 };
const baseRow: CommentPanelRow = { id: 'root', author_name: 'Jane', body: '**Root discussion**', via_share: true, parent_id: null, status: 'done', created_at: '2026-10-08T12:00:00Z', resolved_at: '2026-10-08T12:00:00Z', resolved_by: 'Jane', attachments: [image] };
const rowsFor = (entityType: string, entityId: string) => [baseRow, ...[1, 2, 3].map((index) => ({ ...baseRow, id: `reply-${index}`, parent_id: 'root', body: `Reply ${index} ![Earlier image](attachment:image)`, attachments: [] }))].map((row) => ({ ...row, entity_type: entityType, entity_id: entityId }));
const doc = {
  project: { key: 'fixture-project', name: 'Fixture project', naming_convention: 'snake_case' },
  events: [emptyEventCard({ id: 'event-id', name: 'cart_update' })],
  properties: [{ property_id: 'property-id', name: 'loyalty_points', category: 'customer', data_type: 'number', data_formats: [], description: 'Customer points', definitions: [] }],
  event_properties: [], identity_rules: [], consent_categories: [], catalogs: [], standard_event_mappings: [],
  use_cases: [{ id: 'use-case-id', code: 'UC-01', name: 'Retention', type: 'marketing', status: 'planned', documentation_url: null, requirements: [{ id: 'requirement-id', target_label: 'cart_update', target_kind: 'event', event_id: 'event-id', property_id: null, level: 'required', status: 'planned' }] }],
  findings_summary: { open: { error: 0, warning: 0, info: 0 }, by_comparison: {} }, unattached_findings: [],
};
function target(entityType: CommentLinkTarget['entityType'], entityId: string): CommentLinkTarget { return { entityType, entityId, threadId: 'root', commentId: 'reply-3' }; }
const changeHash = (hash: string) => { window.history.replaceState(null, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange')); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('isSecureContext', true);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  useStore.setState({ activeProjectId: 'internal-project', activeProjectKey: 'fixture-project' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  window.history.replaceState(null, '', '/');
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove(); root = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
function mockShared(rows: CommentPanelRow[], status = 200) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith('/identity')) return json({ name: 'Purple Hedgehog', kind: 'guest', verified: false, avatar_url: null, name_chosen: false });
    if (path.endsWith('/comments')) return json(rows);
    if (path.endsWith('/qa-reports')) return json([]);
    if (path.endsWith('/tracking-document.json')) return json(doc);
    return json({ project: { name: 'Fixture project', client_logo_path: null }, client: { name: 'Fixture client' }, access: 'read' }, status);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
describe('mounted shared comment deep links and copy', () => {
  it.each([['event', 'event-id'], ['property', 'property-id'], ['use_case', 'use-case-id'], ['requirement', 'requirement-id']] as const)('reloads %s into its third reply, expands permitted entity/thread, and focuses it', async (type, entityId) => {
    const linkedTarget = target(type, entityId);
    mockShared(rowsFor(type, entityId));
    changeHash(commentFragment(linkedTarget));
    await act(async () => root!.render(<SharedProject token="fixture-share" />));
    const reply = container.querySelector<HTMLElement>('#comment-reply-3')!;
    expect(reply).not.toBeNull();
    expect(document.activeElement).toBe(reply);
    expect(reply.className).toContain('ring-2');
    expect(container.querySelectorAll('[data-testid="comment-reply"]')).toHaveLength(3);
    expect(container.querySelector('textarea[aria-label="Reply"]')).toBeNull(); // read-only share remains read-only
    await act(async () => reply.querySelector<HTMLButtonElement>('[aria-label="Copy comment link"]')!.click());
    const copied = writeText.mock.calls[0][0];
    expect(new URL(copied).pathname).toContain('/shared/fixture-share');
    expect(parseCommentLink(new URL(copied).hash)).toEqual({ kind: 'target', target: linkedTarget });
    await act(async () => root!.unmount());
    container.replaceChildren(); root = createRoot(container);
    window.history.replaceState(null, '', new URL(copied).pathname + new URL(copied).hash);
    await act(async () => root!.render(<SharedProject token="fixture-share" />));
    expect(document.activeElement).toBe(container.querySelector('#comment-reply-3'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy thread Markdown"]')!.click());
    const markdown = writeText.mock.calls.at(-1)![0];
    expect(markdown).toContain('Reply 3');
    expect(markdown).toContain('/api/shared/fixture-share/files/');
    expect(markdown).not.toContain('/api/projects/');
  });
  it('copies a root link and single-root Markdown, then reloads into the focused root', async () => {
    mockShared(rowsFor('event', 'event-id'));
    changeHash(commentFragment(target('event', 'event-id')));
    await act(async () => root!.render(<SharedProject token="root-share" />));
    const thread = container.querySelector<HTMLElement>('#comment-root')!;
    await act(async () => thread.querySelector<HTMLButtonElement>('[aria-label="Copy comment Markdown"]')!.click());
    expect(writeText.mock.calls.at(-1)![0]).toContain('**Root discussion**');
    expect(writeText.mock.calls.at(-1)![0]).not.toContain('Reply 3');
    await act(async () => thread.querySelector<HTMLButtonElement>('[aria-label="Copy comment link"]')!.click());
    const copied = new URL(writeText.mock.calls.at(-1)![0]);
    expect(parseCommentLink(copied.hash)).toEqual({ kind: 'target', target: { ...target('event', 'event-id'), commentId: 'root' } });
    await act(async () => root!.unmount()); root = createRoot(container);
    window.history.replaceState(null, '', copied.pathname + copied.hash);
    await act(async () => root!.render(<SharedProject token="root-share" />));
    expect(document.activeElement).toBe(container.querySelector('#comment-root'));
  });
  it('does not expand or disclose missing/private targets, and handles invalid and revoked links', async () => {
    const fetchMock = mockShared(rowsFor('event', 'event-id').filter((row) => row.id !== 'reply-3'));
    changeHash(commentFragment(target('event', 'event-id')));
    await act(async () => root!.render(<SharedProject token="missing-share" />));
    expect(container.textContent).toContain('This comment is unavailable in this view.');
    expect(container.querySelector('[data-testid="comment-thread"]')).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/api/projects/'))).toBe(true);
    await act(async () => changeHash('#comment=v1&type=event&entity=event-id&thread=root&target=%ZZ'));
    expect(container.textContent).toContain('This comment link is not valid.');
    await act(async () => root!.unmount()); root = createRoot(container);
    mockShared([], 404);
    await act(async () => root!.render(<SharedProject token="revoked-share" />));
    expect(container.textContent).toContain('This link is not valid.');
    expect(container.textContent).not.toContain('Jane');
  });
});
describe('mounted internal Comments parity', () => {
  it('opens a closed root reply excluded by the default status filter and provides copy on both levels', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rowsFor('event', 'event-id').map((row) => ({ ...row, entity_label: 'cart_update', use_case_id: null, internal_only: false })))));
    await act(async () => root!.render(<Comments />));
    expect(container.querySelector('[data-testid="comment-thread"]')).toBeNull(); // closed root hidden by default
    await act(async () => changeHash(commentFragment(target('event', 'event-id'))));
    const reply = container.querySelector<HTMLElement>('#comment-reply-3')!;
    expect(document.activeElement).toBe(reply);
    expect(reply.className).toContain('ring-2');
    await act(async () => reply.querySelector<HTMLButtonElement>('[aria-label="Copy comment Markdown"]')!.click());
    expect(writeText.mock.calls.at(-1)![0]).toContain('/api/projects/internal-project/files/');
    await act(async () => reply.querySelector<HTMLButtonElement>('[aria-label="Copy comment link"]')!.click());
    expect(new URL(writeText.mock.calls.at(-1)![0]).pathname).toContain('/p/fixture-project/comments');
    expect(container.querySelectorAll('[aria-label="Copy thread Markdown"]')).toHaveLength(1);
  });
});
describe('copy feedback and current-view privacy', () => {
  it('excludes internal-only replies/attachments from shared thread Markdown and unresolved inline references', async () => {
    const hidden = { ...baseRow, id: 'hidden', parent_id: 'root', body: 'Secret team content', internal_only: true, attachments: [{ ...image, id: 'hidden-image', file_path: 'private/path.png' }] };
    const visible = { ...baseRow, entity_type: 'event', entity_id: 'event-id', body: 'Visible ![Hidden](attachment:hidden-image)' };
    await act(async () => root!.render(<CommentCopyActions mode="shared" row={visible} thread={{ ...visible, replies: [hidden] }} getLink={() => 'https://example.test/shared/fixture-share'} fileUrl={(path) => `/api/shared/fixture-share/files/${path}`} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Copy thread Markdown"]')!.click());
    const copied = writeText.mock.calls[0][0];
    expect(copied).not.toContain('Secret team content');
    expect(copied).not.toContain('private/path');
    expect(copied).not.toContain('hidden-image');
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Thread Markdown copied.');
  });
  it('reports denied clipboard access accessibly and cleans up the fallback textarea', async () => {
    writeText.mockRejectedValue(new Error('Denied'));
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
    await act(async () => root!.render(<CommentCopyActions mode="internal" row={baseRow} thread={{ ...baseRow, replies: [] }} getLink={() => 'https://example.test/p/fixture-project/comments'} fileUrl={(path) => `/api/projects/project/files/${path}`} />));
    const copy = container.querySelector<HTMLButtonElement>('[aria-label="Copy comment link"]')!;
    copy.focus();
    await act(async () => copy.click());
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Copy failed');
    expect(document.activeElement).toBe(copy);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
