import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import { authHash } from '../../dal/commentAuth.dal';
import { resolveStaffIdentity, safeProfilePhoto } from '../sharedAuth';
import type { Request } from 'express';
import type { TokenPayload } from 'google-auth-library';

let server: http.Server;
let base: string;
let projectId: string;
let eventId: string;
let token: string;
const saved = { ...process.env };
const verifier = vi.fn(async (credential: string, audience: string) => {
  expect(audience).toBe('public-client');
  const payload = JSON.parse(credential);
  if (payload.signature_invalid) throw new Error('Invalid signature');
  return payload as TokenPayload;
});
beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:'; process.env.AUTH_MODE = 'local'; process.env.GOOGLE_COMMENT_CLIENT_ID = 'public-client'; process.env.NODE_ENV = 'test';
  closeDb();
  const client = ClientDAL.createClient({ key: 'google-auth', name: 'Google auth' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'google-auth-eu', name: 'Google Auth EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'auth_identity_check', class: 'custom' }).id;
  server = http.createServer(createApp({ sharedAuth: { verifyGoogle: verifier }, serveStatic: false }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.E3_PUBLIC_ORIGIN = base;
});
beforeEach(() => { token = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!; verifier.mockClear(); process.env.AUTH_MODE = 'local'; });
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve())); closeDb();
  for (const key of ['E3_DB_PATH', 'AUTH_MODE', 'GOOGLE_COMMENT_CLIENT_ID', 'NODE_ENV', 'E3_PUBLIC_ORIGIN', 'COMMENT_STAFF_SESSION', 'WORKSPACE_DOMAIN', 'TRUSTED_PROXY_CIDR']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
const url = (action: string, share = token) => `${base}/api/shared/${share}/auth/${action}`;
async function challenge(cookie?: string) {
  const response = await fetch(url('config'), { headers: cookie ? { Cookie: cookie } : {} });
  expect(response.status).toBe(200);
  return { body: await response.json(), cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function login(overrides: Record<string, unknown> = {}, options: { origin?: string; csrf?: string; cookie?: string } = {}) {
  const c = await challenge();
  const payload = { aud: 'public-client', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, sub: 'google-subject', name: 'Jan Pan', email: 'private@example.com', picture: 'https://lh3.googleusercontent.com/test-avatar', nonce: c.body.nonce, ...overrides };
  const response = await fetch(url('google'), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: options.origin ?? base, Cookie: options.cookie ?? c.cookie }, body: JSON.stringify({ csrf_token: options.csrf ?? c.body.csrf_token, credential: JSON.stringify(payload) }) });
  return { response, challenge: c, payload };
}
function sessionCookie(response: Response): string {
  return response.headers.getSetCookie().find((c) => c.startsWith('e3_comment_auth='))!.split(';')[0];
}

describe('shared Google identity boundaries', () => {
  it('verifies then issues an opaque hashed session and returns no private email or subject', async () => {
    const { response } = await login(); expect(response.status).toBe(200); expect(verifier).toHaveBeenCalledOnce();
    const cookie = sessionCookie(response); expect(cookie).not.toContain('google-subject'); expect(response.headers.get('cache-control')).toBe('no-store');
    const raw = cookie.split('=')[1];
    expect(getDb().prepare('SELECT token_hash FROM comment_auth_sessions WHERE token_hash = ?').get(authHash(raw))).toBeTruthy();
    const config = await fetch(url('config'), { headers: { Cookie: cookie } }); const body = await config.json();
    expect(body.identity).toEqual({ name: 'Jan Pan', avatar_url: 'https://lh3.googleusercontent.com/test-avatar', kind: 'google', verified: true });
    expect(JSON.stringify(body)).not.toContain('private@example.com'); expect(JSON.stringify(body)).not.toContain('google-subject');
  });
  it('uses the verified Google identity for required-name comments, replies and reaction ownership', async () => {
    ProjectDAL.updateShareSettings(projectId, { share_require_name: true });
    try {
      const { response } = await login();
      const cookie = sessionCookie(response);
      const identity = await (await fetch(`${base}/api/shared/${token}/identity`, { headers: { Cookie: cookie } })).json();
      expect(identity).toEqual({ name: 'Jan Pan', kind: 'google', avatar_url: 'https://lh3.googleusercontent.com/test-avatar', verified: true, name_chosen: true });
      const post = (path: string, body: unknown) => fetch(`${base}/api/shared/${token}${path}`, { method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const rootResponse = await post('/comments', { entity_type: 'event', entity_id: eventId, body: 'Verified root', author_name: 'Forged guest name' });
      expect(rootResponse.status).toBe(201);
      const root = await rootResponse.json();
      expect(root).toMatchObject({ author_name: 'Jan Pan', author_kind: 'google', avatar_url: identity.avatar_url });
      expect(root).not.toHaveProperty('participant_id');
      const replyResponse = await post('/comments', { entity_type: 'event', entity_id: eventId, body: 'Verified reply', parent_id: root.id });
      expect(replyResponse.status).toBe(201);
      expect(await replyResponse.json()).toMatchObject({ author_name: 'Jan Pan', author_kind: 'google', parent_id: root.id });
      const reaction = await post(`/comments/${root.id}/reactions`, { kind: 'like', author_name: 'Impersonated reactor' });
      expect(await reaction.json()).toMatchObject({ added: true, reactions: [{ kind: 'like', count: 1, authors: ['Jan Pan'], mine: true }] });
      const other = await login({ sub: 'another-subject', name: 'Jan Pan' });
      const otherList = await (await fetch(`${base}/api/shared/${token}/comments`, { headers: { Cookie: sessionCookie(other.response) } })).json();
      expect(otherList.find((comment: { id: string }) => comment.id === root.id).reactions[0].mine).toBe(false);
      expect(JSON.stringify(otherList)).not.toContain('private@example.com');
    } finally { ProjectDAL.updateShareSettings(projectId, { share_require_name: false }); }
  });
  it('returns the stable guest identity after Google logout without rewriting existing verified comments', async () => {
    const guestResponse = await fetch(`${base}/api/shared/${token}/identity`);
    const guestCookie = guestResponse.headers.get('set-cookie')!.split(';')[0];
    const guest = await guestResponse.json();
    const { response } = await login();
    const googleCookie = sessionCookie(response);
    const c = await challenge(googleCookie);
    const logout = await fetch(url('logout'), { method: 'POST', headers: { Origin: base, Cookie: `${googleCookie}; ${guestCookie}; ${c.cookie}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf_token: c.body.csrf_token }) });
    expect(logout.status).toBe(200);
    const signedOutCookie = logout.headers.getSetCookie().find((value) => value.startsWith('e3_comment_signed_out='))!.split(';')[0];
    const after = await (await fetch(`${base}/api/shared/${token}/identity`, { headers: { Cookie: `${googleCookie}; ${guestCookie}; ${signedOutCookie}` } })).json();
    expect(after).toEqual(guest);
    expect(after).toMatchObject({ kind: 'guest', verified: false });
  });
  it.each([{ aud: 'other-client' }, { iss: 'https://evil.example' }, { exp: 1 }, { nonce: 'wrong' }, { sub: '' }, { signature_invalid: true }])('rejects invalid verified-token claims or signature %j', async (overrides) => {
    const { response } = await login(overrides); expect(response.status).toBe(401); expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('requires exact origin and matching challenge cookie before verification', async () => {
    expect((await login({}, { origin: 'https://evil.example' })).response.status).toBe(403);
    expect((await login({}, { csrf: 'wrong' })).response.status).toBe(403);
    expect((await login({}, { csrf: 'é'.repeat(43) })).response.status).toBe(403);
    expect((await login({}, { cookie: '' })).response.status).toBe(403);
    expect(verifier).not.toHaveBeenCalled();
  });
  it('rejects challenge replay and expiry', async () => {
    const { response, challenge: c, payload } = await login(); expect(response.status).toBe(200);
    const replay = await fetch(url('google'), { method: 'POST', headers: { Origin: base, Cookie: c.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: JSON.stringify(payload), csrf_token: c.body.csrf_token }) });
    expect(replay.status).toBe(403);
    const fresh = await challenge(); getDb().prepare('UPDATE comment_auth_challenges SET expires_at = 1').run();
    const expired = await fetch(url('google'), { method: 'POST', headers: { Origin: base, Cookie: fresh.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'x', csrf_token: fresh.body.csrf_token }) });
    expect(expired.status).toBe(403);
  });
  it('binds each challenge to its share rather than permitting another link', async () => {
    const c = await challenge(); const other = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!;
    const response = await fetch(url('google', other), { method: 'POST', headers: { Origin: base, Cookie: c.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'x', csrf_token: c.body.csrf_token }) }); expect(response.status).toBe(403);
  });
  it('never widens read-only links or grants internal API access', async () => {
    ProjectDAL.updateShareAccess(projectId, 'read');
    const { response } = await login(); expect(response.status).toBe(200); const cookie = sessionCookie(response);
    const post = await fetch(`${base}/api/shared/${token}/comments`, { method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' }); expect(post.status).toBe(403);
    process.env.AUTH_MODE = 'proxy'; process.env.TRUSTED_PROXY_CIDR = '127.0.0.1/32';
    const internal = await fetch(`${base}/api/clients`, { headers: { Cookie: cookie } }); expect(internal.status).toBe(401);
  });
  it('revoked shares reject valid sessions and unknown share configs', async () => {
    const { response } = await login(); const cookie = sessionCookie(response); ProjectDAL.revokeShare(projectId);
    expect((await fetch(url('config'), { headers: { Cookie: cookie } })).status).toBe(404);
  });
  it('expires sessions and signs out without affecting staff cookie', async () => {
    const { response } = await login(); const cookie = sessionCookie(response); const c = await challenge(cookie);
    const logout = await fetch(url('logout'), { method: 'POST', headers: { Origin: base, Cookie: `${cookie}; ${c.cookie}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf_token: c.body.csrf_token }) });
    expect(logout.status).toBe(200); expect(logout.headers.getSetCookie().some((c) => c.startsWith('_oauth2_proxy'))).toBe(false);
    expect((await (await fetch(url('config'), { headers: { Cookie: cookie } })).json()).identity).toBeNull();
    const second = await login(); getDb().prepare('UPDATE comment_auth_sessions SET expires_at = 1').run();
    expect((await (await fetch(url('config'), { headers: { Cookie: sessionCookie(second.response) } })).json()).identity).toBeNull();
  });
  it('blocks cross-origin verified mutations and malicious profile image URLs', async () => {
    const { response } = await login({ picture: 'https://tracker.evil.example/avatar' }); const cookie = sessionCookie(response);
    const body = await (await fetch(url('config'), { headers: { Cookie: cookie } })).json(); expect(body.identity.avatar_url).toBeNull();
    const mutation = await fetch(`${base}/api/shared/${token}/comments`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }); expect(mutation.status).toBe(403);
  });
});

describe('trusted Internal staff bridge', () => {
  beforeEach(() => { process.env.AUTH_MODE = 'proxy'; process.env.COMMENT_STAFF_SESSION = '1'; process.env.WORKSPACE_DOMAIN = 'e3-services.com'; });
  it('ignores forwarded identity headers and never calls proxy without a staff cookie', async () => {
    process.env.AUTH_MODE = 'proxy'; process.env.COMMENT_STAFF_SESSION = '1'; process.env.WORKSPACE_DOMAIN = 'e3-services.com';
    const fetcher = vi.fn(); const req = { headers: { 'x-forwarded-email': 'forged@e3-services.com', 'x-auth-request-user': 'forged' } } as unknown as Request;
    expect(await resolveStaffIdentity(req, fetcher)).toBeUndefined(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses fixed destinations and selected cookies, actual trusted profile where available', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 202, headers: { 'x-auth-request-email': 'jan.pan@e3-services.com', 'x-auth-request-preferred-username': 'Jan' } })).mockResolvedValueOnce(Response.json({ name: 'Jan Pan', picture: 'https://lh3.googleusercontent.com/avatar' }));
    const req = { headers: { cookie: '_oauth2_proxy=trusted; tracking=secret; _oauth2_proxy_0=chunk', 'x-forwarded-email': 'attacker@example.com' } } as unknown as Request;
    const participant = await resolveStaffIdentity(req, fetcher); expect(participant?.name).toBe('Jan Pan'); expect(participant?.avatar_url).toContain('googleusercontent.com'); expect(participant?.id).not.toContain('@');
    expect(fetcher.mock.calls[0][0]).toBe('http://oauth2-proxy:4180/oauth2/auth'); expect(fetcher.mock.calls[0][1].headers).toEqual({ Cookie: '_oauth2_proxy=trusted; _oauth2_proxy_0=chunk' }); expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('falls back to initials without exposing staff email, rejects wrong domain and unavailable proxy', async () => {
    const req = { headers: { cookie: '_oauth2_proxy=x' } } as unknown as Request;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 202, headers: { 'x-auth-request-email': 'jan.pan@e3-services.com' } })).mockResolvedValueOnce(new Response('', { status: 404 }));
    expect((await resolveStaffIdentity(req, fetcher))?.name).toBe('jan.pan');
    expect(await resolveStaffIdentity(req, vi.fn().mockResolvedValue(new Response('', { status: 202, headers: { 'x-auth-request-email': 'evil@example.com' } })))).toBeUndefined();
    expect(await resolveStaffIdentity(req, vi.fn().mockRejectedValue(new Error('down')))).toBeUndefined();
  });
  it.each(['javascript:alert(1)', 'http://lh3.googleusercontent.com/avatar', 'https://googleusercontent.com.evil.test/a', 'https://user@lh3.googleusercontent.com/a'])('rejects unsafe profile URL %s', (url) => expect(safeProfilePhoto(url)).toBeNull());
});
