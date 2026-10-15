// @vitest-environment jsdom
/**
 * T-5-45 (D-88): a `listed_people` header (`{ sign_in_required: true }`) renders the neutral
 * sign-in screen: no project or client name, no data request, and a Google sign-in reloads the portal.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedProject } from '@/src/pages/SharedProject';

vi.mock('@/src/features/shared-auth/SharedGoogleSignIn', () => ({
  SharedGoogleSignIn: ({ purpose }: { purpose?: string }) => <div aria-label="Comment identity" data-purpose={purpose}>Continue with Google</div>,
}));

const TOKEN = 'listed-share-fixture';
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let requested: string[];
let header: unknown;

beforeEach(() => {
  requested = [];
  header = { sign_in_required: true, signed_in: false };
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requested.push(url);
    if (url.endsWith(`/api/shared/${TOKEN}`)) return new Response(JSON.stringify(header), { status: 200 });
    return new Response(JSON.stringify({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' }), { status: 404 });
  }));
  window.history.replaceState(null, '', `/shared/${TOKEN}`);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove(); root = undefined; container = undefined;
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
async function mount() {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<SharedProject token={TOKEN} />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}

describe('Portal sign-in screen (listed people)', () => {
  it('shows only the neutral sign-in screen and requests nothing but the header', async () => {
    await mount();
    expect(container!.querySelector('[data-testid="portal-sign-in"]')).not.toBeNull();
    expect(container!.textContent).toContain('Continue with Google');
    expect(container!.querySelector('[data-testid="portal-sign-in-denied"]')).toBeNull();
    expect(container!.querySelector('[data-testid="portal-project-name"]')).toBeNull();
    expect(requested).toEqual([`/api/shared/${TOKEN}`].map((p) => expect.stringContaining(p)));
    expect(requested).toHaveLength(1);
  });

  it('tells a signed-in visitor without access, and reloads after a sign-in', async () => {
    header = { sign_in_required: true, signed_in: true };
    await mount();
    expect(container!.querySelector('[data-testid="portal-sign-in-denied"]')).not.toBeNull();
    // T-5-46: the identity here only opens the link ("Signed in as", "Sign out"), it does not comment.
    expect(container!.querySelector('[data-purpose="access"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('e3-share-identity-changed', { detail: { token: TOKEN } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(requested.filter((u) => u.endsWith(`/api/shared/${TOKEN}`))).toHaveLength(2);
  });
});
