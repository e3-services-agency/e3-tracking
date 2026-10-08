import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { resolveStaffIdentity } from '../sharedAuth';
const saved = { ...process.env };
const req = { headers: { cookie: '_oauth2_proxy=trusted', 'x-auth-request-access-token': 'browser-forged' } } as unknown as Request;
const payload = () => ({ aud: 'staff-client', iss: 'accounts.google.com', exp: Date.now() / 1000 + 600, sub: 'subject', email_verified: true, email: 'jan.pan@e3-services.com', hd: 'e3-services.com' });
const info = () => ({ id: 'subject', email: 'jan.pan@e3-services.com', verified_email: true, hd: 'e3-services.com', picture: 'https://lh3.googleusercontent.com/photo' });
const auth = (access = 'server-access-token') => new Response('', { status: 202, headers: { 'x-auth-request-email': 'jan.pan@e3-services.com', authorization: 'Bearer server.id.token', ...(access ? { 'x-auth-request-access-token': access } : {}) } });
const proxy = (response: Response, access?: string) => vi.fn().mockResolvedValueOnce(auth(access)).mockResolvedValueOnce(response);
beforeEach(() => { process.env.AUTH_MODE = 'proxy'; process.env.COMMENT_STAFF_SESSION = '1'; process.env.WORKSPACE_DOMAIN = 'e3-services.com'; process.env.GOOGLE_STAFF_CLIENT_ID = 'staff-client'; });
afterEach(() => { for (const key of ['AUTH_MODE', 'COMMENT_STAFF_SESSION', 'WORKSPACE_DOMAIN', 'GOOGLE_STAFF_CLIENT_ID']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
describe('bounded Google Userinfo photo fallback', () => {
  it('uses only the proxy access token at a fixed endpoint, after ID verification, preserving staff identity', async () => {
    const fetcher = proxy(Response.json({ ...info(), name: 'Unused name' })); const verify = vi.fn().mockResolvedValue(payload());
    const result = await resolveStaffIdentity(req, fetcher, verify);
    expect(result).toMatchObject({ name: 'jan.pan', kind: 'staff', avatar_url: info().picture }); expect(result?.id).toMatch(/^staff:/);
    expect(fetcher.mock.calls[1][0]).toBe('https://www.googleapis.com/oauth2/v2/userinfo?fields=id,email,verified_email,hd,picture');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer server-access-token' }, redirect: 'error' });
    expect(Object.keys(fetcher.mock.calls[1][1].headers)).toEqual(['Authorization']); expect(fetcher.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
  });
  it.each([{ id: 'other' }, { email: 'other@e3-services.com' }, { verified_email: false }, { hd: 'other.com' }, { picture: 'https://evil.test/photo' }, { picture: undefined }])('retains initials when Userinfo does not match: %j', async (override) => {
    expect((await resolveStaffIdentity(req, proxy(Response.json({ ...info(), ...override })), vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull();
  });
  it('does not request Userinfo for an unverified ID token, missing server token or existing safe ID-token photo', async () => {
    for (const verify of [vi.fn().mockRejectedValue(new Error('signature')), vi.fn().mockResolvedValue({ ...payload(), email: 'other@e3-services.com' }), vi.fn().mockResolvedValue({ ...payload(), picture: info().picture })]) {
      const fetcher = proxy(Response.json(info())); await resolveStaffIdentity(req, fetcher, verify); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const missing = proxy(Response.json(info()), ''); expect((await resolveStaffIdentity(req, missing, vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull(); expect(missing).toHaveBeenCalledTimes(1);
  });
  it.each([new Response('', { status: 403 }), new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }), new Response('{}', { headers: { 'Content-Type': 'text/html' } })])('retains staff identity on failed or malformed profile response', async (response) => {
    expect((await resolveStaffIdentity(req, proxy(response), vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull();
  });
  it('caps streamed bytes and cancels the oversized response', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4096)); controller.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; } });
    const fetcher = proxy(new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
    expect((await resolveStaffIdentity(req, fetcher, vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull(); expect(cancelled).toBe(true);
  });
  it('retains initials after network/redirect failure or timeout', async () => {
    const failed = vi.fn().mockResolvedValueOnce(auth()).mockRejectedValueOnce(new Error('redirect/network'));
    expect((await resolveStaffIdentity(req, failed, vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull();
    const timed = vi.fn().mockResolvedValueOnce(auth()).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })));
    const start = Date.now(); expect((await resolveStaffIdentity(req, timed, vi.fn().mockResolvedValue(payload())))?.avatar_url).toBeNull(); expect(Date.now() - start).toBeLessThan(3000);
  });
});
