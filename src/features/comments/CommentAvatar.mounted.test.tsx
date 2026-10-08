// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommentAvatar } from './CommentIdentity';
import { SharedGoogleIdentityView } from '../shared-auth/SharedGoogleSignIn';
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
it('shows photo, falls back on failure and retries when URL changes', async () => {
  const container = document.createElement('div'); const root = createRoot(container);
  const render = async (url: string) => { await act(async () => root.render(<CommentAvatar name="Jan Pan" avatarUrl={url} kind="staff" />)); };
  try {
    await render('https://lh3.googleusercontent.com/first'); expect(container.querySelector('img')?.src).toContain('/first');
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toBe('JA');
    await render('https://lh3.googleusercontent.com/second'); expect(container.querySelector('img')?.src).toContain('/second');
    await render('https://lh3.googleusercontent.com/first'); expect(container.querySelector('img')?.src).toContain('/first');
  } finally { await act(async () => root.unmount()); }
});
it('uses the same safe photo and failed-image fallback in the shared identity bar', async () => {
  const container = document.createElement('div'); const root = createRoot(container);
  try {
    await act(async () => root.render(<SharedGoogleIdentityView identity={{ name: 'Jan Pan', kind: 'staff', verified: true, avatar_url: 'https://lh3.googleusercontent.com/photo' }} busy={false} error="" onSignOut={() => {}} onRetry={() => {}} />));
    expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toContain('JA'); expect(container.textContent).toContain('Commenting as Jan Pan');
  } finally { await act(async () => root.unmount()); }
});
