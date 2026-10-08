// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommentsPanel, type CommentPanelRow } from '../comments/CommentsPanel';
import { notifySharedIdentity } from './googleIdentity';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined; container = undefined;
  vi.unstubAllGlobals();
});
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const comment: CommentPanelRow = { id: 'google-session-root', author_name: 'Staff', body: 'Existing thread', via_share: false, created_at: '2026-10-08', resolved_at: null, resolved_by: null, parent_id: null, status: 'open' };

describe('Google session transitions in shared reply composers', () => {
  it('waits for verified identity on sign-in, preserves the draft, then refreshes the guest on sign-out', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let requests = 0;
    let completeIdentity!: (response: Response) => void;
    const guest = { name: 'Blue Otter', kind: 'guest', verified: false, avatar_url: null, name_chosen: false };
    const google = { name: 'Verified Jane', kind: 'google', verified: true, avatar_url: 'https://lh3.googleusercontent.com/profile', name_chosen: true };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/identity')) {
        requests += 1;
        if (requests === 2) return new Promise<Response>((resolve) => { completeIdentity = resolve; });
        return json(guest);
      }
      return json([comment]);
    }));
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const token = 'google-transition-test-share';
    await act(async () => { root!.render(<CommentsPanel entityType="event" entityId="event" api={{ mode: 'shared', token, access: 'comment' }} />); });
    const reply = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply"]')!;
    const replyButton = () => Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Reply')!;
    expect(container.textContent).toContain('Blue Otter');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, 'Draft while signing in');
      reply.dispatchEvent(new Event('input', { bubbles: true }));
      notifySharedIdentity(token);
    });
    expect(requests).toBe(2);
    expect(replyButton().disabled).toBe(true);
    expect(reply.value).toBe('Draft while signing in');
    await act(async () => { completeIdentity(json(google)); });
    expect(container.textContent).toContain('Verified Jane');
    expect(container.querySelector('textarea[aria-label="Reply"]')).toBe(reply);
    expect(reply.value).toBe('Draft while signing in');
    expect(replyButton().disabled).toBe(false);
    await act(async () => { notifySharedIdentity(token); });
    expect(requests).toBe(3);
    expect(container.textContent).toContain('Blue Otter');
    expect(container.textContent).not.toContain('Verified Jane');
    expect(reply.value).toBe('Draft while signing in');
  });
  it('supersedes deferred guest and Google reads once per event across multiple mounted composers', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const reads: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
    const guest = { name: 'Green Fox', kind: 'guest', verified: false, avatar_url: null, name_chosen: false };
    const google = { name: 'Latest Google', kind: 'google', verified: true, avatar_url: null, name_chosen: true };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/identity')) return new Promise<Response>((resolve, reject) => { reads.push({ resolve, reject }); });
      return json([comment]);
    }));
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const token = 'deferred-google-transition-share';
    await act(async () => { root!.render(<><CommentsPanel entityType="event" entityId="first" rows={[comment]} api={{ mode: 'shared', token, access: 'comment' }} /><CommentsPanel entityType="event" entityId="second" rows={[comment]} api={{ mode: 'shared', token, access: 'comment' }} /></>); });
    expect(reads).toHaveLength(1); // Initial loading remains deduplicated across every composer.
    const reply = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, 'Preserved account-transition draft');
      reply.dispatchEvent(new Event('input', { bubbles: true }));
      notifySharedIdentity(token);
    });
    expect(reads).toHaveLength(2); // One fresh read, despite two listeners and the old pending read.
    await act(async () => { reads[1].resolve(json(google)); });
    expect(container.textContent).toContain('Latest Google');
    await act(async () => { reads[0].resolve(json(guest)); });
    expect(container.textContent).toContain('Latest Google');
    expect(container.textContent).not.toContain('Green Fox');
    const { refreshCommentParticipant, readCommentParticipant } = await import('../comments/shareName');
    let oldGoogleRead!: Promise<void>;
    await act(async () => { oldGoogleRead = refreshCommentParticipant('shared', token); });
    expect(reads).toHaveLength(3);
    await act(async () => { notifySharedIdentity(token); });
    expect(reads).toHaveLength(4);
    await act(async () => { reads[3].resolve(json(guest)); });
    await act(async () => { reads[2].reject(new Error('Stale pre-logout read failed')); await oldGoogleRead; });
    expect(readCommentParticipant('shared', token)).toMatchObject({ name: 'Green Fox', kind: 'guest', verified: false, ready: true, loading: false, error: null });
    expect(container.textContent).not.toContain('Latest Google');
    expect(container.querySelector('textarea[aria-label="Reply"]')).toBe(reply);
    expect(reply.value).toBe('Preserved account-transition draft');
  });
});
