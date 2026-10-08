import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { readFileSync } from 'node:fs';
import { resolveInternalStaffPhoto, resolveStaffIdentity } from '../sharedAuth';
import { authHash } from '../../dal/commentAuth.dal';
const saved = { ...process.env };
const req = () => ({ headers: { cookie: '_oauth2_proxy=trusted; tracking=private', authorization: 'Bearer browser.forged.token' } }) as Request;
const profile = () => ({ aud: 'staff-client', iss: 'accounts.google.com', exp: Date.now() / 1000 + 600, sub: 'staff-sub', email_verified: true, email: 'jan.pan@e3-services.com', hd: 'e3-services.com', picture: 'https://lh3.googleusercontent.com/avatar' });
const fetcher = (token = 'Bearer trusted.token.signature') => vi.fn().mockResolvedValue(new Response('', { status: 202, headers: { 'x-auth-request-email': 'jan.pan@e3-services.com', 'x-auth-request-preferred-username': 'Jan', ...(token ? { authorization: token } : {}) } }));
const expected = (avatar_url: string | null) => ({ id: `staff:${authHash('jan.pan@e3-services.com')}`, name: 'Jan', kind: 'staff', verified: true, avatar_url });
beforeEach(() => { process.env.AUTH_MODE = 'proxy'; process.env.COMMENT_STAFF_SESSION = '1'; process.env.WORKSPACE_DOMAIN = 'e3-services.com'; process.env.GOOGLE_STAFF_CLIENT_ID = 'staff-client'; });
afterEach(() => { for (const key of ['AUTH_MODE', 'COMMENT_STAFF_SESSION', 'WORKSPACE_DOMAIN', 'GOOGLE_STAFF_CLIENT_ID']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
describe('staff photo verification', () => {
  it('uses only fixed proxy response and selected cookies, retaining staff id and name', async () => {
    const verify = vi.fn().mockResolvedValue({ ...profile(), name: 'Different name' }); const proxy = fetcher();
    expect(await resolveStaffIdentity(req(), proxy, verify)).toEqual(expected(profile().picture));
    expect(verify).toHaveBeenCalledWith('trusted.token.signature', 'staff-client');
    expect(proxy).toHaveBeenCalledTimes(1);
    expect(proxy.mock.calls[0]).toMatchObject(['http://oauth2-proxy:4180/oauth2/auth', { headers: { Cookie: '_oauth2_proxy=trusted' }, redirect: 'error' }]);
  });
  it.each([{ aud: 'wrong' }, { iss: 'evil' }, { exp: 1 }, { sub: '' }, { email_verified: false }, { email: 'other@e3-services.com' }, { hd: 'other.com' }, { picture: 'https://evil.test/photo' }, { picture: undefined }])('falls back without changing identity for %j', async (override) => {
    expect(await resolveStaffIdentity(req(), fetcher(), vi.fn().mockResolvedValue({ ...profile(), ...override }))).toEqual(expected(null));
  });
  it('fails closed for invalid signature, absent token/audience, browser token and mismatched internal identity', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('Invalid signature'));
    expect(await resolveStaffIdentity(req(), fetcher(), verify)).toEqual(expected(null));
    verify.mockClear(); expect(await resolveStaffIdentity(req(), fetcher(''), verify)).toEqual(expected(null)); expect(verify).not.toHaveBeenCalled();
    const internal = req(); internal.userId = 'other@e3-services.com';
    expect(await resolveStaffIdentity(internal, fetcher(), verify)).toEqual(expected(null)); expect(verify).not.toHaveBeenCalled();
    delete process.env.GOOGLE_STAFF_CLIENT_ID; expect(await resolveStaffIdentity(req(), fetcher(), verify)).toEqual(expected(null)); expect(verify).not.toHaveBeenCalled();
  });
  it('enriches an internal identity only when its middleware user matches the cookie identity', async () => {
    const proxy = fetcher(); const verify = vi.fn().mockResolvedValue(profile()); const internal = req();
    expect(await resolveInternalStaffPhoto(internal, proxy, verify)).toBeNull(); expect(proxy).not.toHaveBeenCalled();
    internal.userId = 'other@e3-services.com';
    expect(await resolveInternalStaffPhoto(internal, proxy, verify)).toBeNull(); expect(verify).not.toHaveBeenCalled();
    internal.userId = 'jan.pan@e3-services.com';
    expect(await resolveInternalStaffPhoto(internal, proxy, verify)).toBe(profile().picture);
    expect(internal.userId).toBe('jan.pan@e3-services.com');
  });
  it('keeps ID tokens off public OAuth responses and only adds nonsecret staff audience', () => {
    const caddy = readFileSync('deploy/edge/Caddyfile', 'utf8');
    const oauth = caddy.slice(caddy.indexOf('handle /oauth2/*'), caddy.indexOf('# Public:'));
    expect(oauth).toContain('header_up -Authorization'); expect(oauth).toContain('header_down -Authorization');
    expect(caddy.match(/copy_headers[^\n]+/)?.[0]).not.toContain('Authorization');
    const compose = readFileSync('docker-compose.yml', 'utf8');
    expect(compose).toContain('GOOGLE_STAFF_CLIENT_ID: ${OAUTH2_CLIENT_ID:-}'); expect(compose).toContain('OAUTH2_PROXY_SET_AUTHORIZATION_HEADER: "true"');
    expect(compose).not.toContain('OAUTH2_PROXY_PASS_ACCESS_TOKEN');
  });
});
