import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifySharedIdentity, postGoogleAuth, readGoogleConfig, sharedAuthUrl } from './googleIdentity';

afterEach(() => vi.unstubAllGlobals());
describe('same-origin shared Google browser transport', () => {
  it('encodes token path segments and uses the same-origin API', () => {
    expect(sharedAuthUrl('a/b?x', 'config')).toBe('/api/shared/a%2Fb%3Fx/auth/config');
  });
  it('config bypasses caches and includes only same-origin credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ enabled: false })); vi.stubGlobal('fetch', fetcher);
    expect(await readGoogleConfig('token')).toEqual({ enabled: false });
    expect(fetcher.mock.calls[0][1]).toEqual({ credentials: 'same-origin', cache: 'no-store' });
  });
  it('sends credential and CSRF in POST body rather than URLs or public attribution', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal('fetch', fetcher);
    await postGoogleAuth('token', 'google', 'challenge', 'sensitive-token');
    expect(fetcher.mock.calls[0][0]).not.toContain('sensitive-token');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ csrf_token: 'challenge', credential: 'sensitive-token' });
    expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin');
  });
  it('surfaces rejected credential and loading errors for guest fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Expired challenge' }, { status: 403 })));
    await expect(postGoogleAuth('token', 'google', 'old', 'jwt')).rejects.toThrow('Expired challenge');
    await expect(readGoogleConfig('token')).rejects.toThrow('continue as a guest');
  });
  it('notifies the shared identity store only for the affected token', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} });
    notifySharedIdentity('a-share'); expect(dispatchEvent.mock.calls[0][0].type).toBe('e3-share-identity-changed');
    expect(dispatchEvent.mock.calls[0][0].init).toEqual({ detail: { token: 'a-share' } });
  });
});
