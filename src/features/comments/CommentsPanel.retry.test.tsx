// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentsPanel, type CommentPanelRow } from './CommentsPanel';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const comment: CommentPanelRow = { id: 'root', author_name: 'Staff', body: 'Existing thread', via_share: false, created_at: '2026-10-08', resolved_at: null, resolved_by: null, parent_id: null, status: 'open' };

describe('mounted reply draft across identity retry', () => {
  it('retains text and the selected image while retry refreshes and a subsequent comment refresh fails', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let identityRequests = 0;
    let commentRequests = 0;
    let finishRefresh!: (response: Response) => void;
    let failRefresh!: (response: Response) => void;
    let sentReply: Record<string, unknown> | undefined;
    let sentImage: File | undefined;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const path = String(url);
      if (path.endsWith('/identity')) {
        identityRequests += 1;
        return identityRequests === 1 ? json({ error: 'Temporary identity failure' }, 503) : json({ name: 'Jane', kind: 'staff', verified: true, avatar_url: null, name_chosen: true });
      }
      if (path.endsWith('/attachments') && init?.method === 'POST') {
        sentImage = (init.body as FormData).get('file') as File;
        return json({ id: 'image' }, 201);
      }
      if (init?.method === 'POST') {
        sentReply = JSON.parse(String(init.body));
        return json({ id: 'reply' }, 201);
      }
      commentRequests += 1;
      if (commentRequests === 2) return new Promise<Response>((resolve) => { finishRefresh = resolve; });
      if (commentRequests === 3) return new Promise<Response>((resolve) => { failRefresh = resolve; });
      return json([comment]);
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root!.render(<CommentsPanel entityType="event" entityId="event" api={{ mode: 'internal', projectId: 'retry-lifecycle-project' }} />); });
    expect(container.textContent).toContain('Posting identity unavailable');
    const thread = container.querySelector<HTMLElement>('[data-testid="comment-thread"]')!;
    const reply = thread.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply"]')!;
    expect(reply).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, 'Keep this reply draft');
      reply.dispatchEvent(new Event('input', { bubbles: true }));
      const picker = thread.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['image-bytes'], 'draft.png', { type: 'image/png' })] });
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(reply.value).toBe('Keep this reply draft');
    expect(thread.querySelector('[aria-label="Images to attach"]')!.textContent).toContain('draft.png');
    const retry = Array.from(thread.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Retry')!;
    await act(async () => { retry.click(); });
    expect(identityRequests).toBe(2);
    expect(commentRequests).toBe(2);
    // A pending network refresh must not replace the mounted thread/editor with a loading label.
    expect(container.querySelector('[data-testid="comment-thread"]')).toBe(thread);
    expect(container.querySelector('textarea[aria-label="Reply"]')).toBe(reply);
    expect(reply.value).toBe('Keep this reply draft');
    expect(thread.textContent).toContain('draft.png');
    await act(async () => { finishRefresh(json([comment])); });
    expect(container.querySelector('textarea[aria-label="Reply"]')).toBe(reply);
    expect(reply.value).toBe('Keep this reply draft');
    expect(thread.querySelector('[aria-label="Images to attach"]')!.textContent).toContain('draft.png');
    // A second successful identity retry triggers a comment refresh that fails.
    const { refreshCommentParticipant } = await import('./shareName');
    await act(async () => { await refreshCommentParticipant('internal', 'retry-lifecycle-project'); });
    expect(commentRequests).toBe(3);
    await act(async () => { failRefresh(json({ error: 'Temporary comments failure' }, 503)); });
    expect(container.textContent).toContain('Temporary comments failure');
    expect(container.querySelector('[data-testid="comment-thread"]')).toBe(thread);
    expect(reply.value).toBe('Keep this reply draft');
    expect(thread.textContent).toContain('draft.png');
    // Verify the preserved file/body remain functional, rather than just preserving a label.
    await act(async () => {
      const replyButton = Array.from(thread.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Reply')!;
      expect(replyButton.disabled).toBe(false);
      replyButton.click();
    });
    expect(sentReply).toMatchObject({ body: 'Keep this reply draft', parent_id: 'root' });
    expect(sentImage?.name).toBe('draft.png');
    expect(sentImage?.type).toBe('image/png');
  });
});
