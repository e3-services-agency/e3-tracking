/**
 * T-5-45 (D-88): share audience `listed_people` and listed people (`share_members`). Unlisted,
 * signed-out, wrong-email and unverified-email visitors get the identical 404 SHARE_NOT_FOUND on
 * every data route; the header names nothing; staff recognised by the trusted proxy always get in;
 * a member's role is capped by the link role; no email ever appears in a public response.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TokenPayload } from 'google-auth-library';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { buildBackup } from '../../services/backup.service';
import { applyRestore, previewRestore } from '../../services/backupRestore.service';
import { capShareAccess } from '../../../domain/enums';

let server: http.Server;
let base: string;
let projectId: string;
let eventId: string;
let commentId: string;
let token: string;
let filesDir: string;
const saved = { ...process.env };
const MEMBER = 'Anna.Client@Example.com';
const MEMBER_LC = 'anna.client@example.com';
const OTHER = 'someone.else@example.com';
const verifier = vi.fn(async (credential: string) => JSON.parse(credential) as TokenPayload);
const staffFetch = vi.fn(async () => new Response(null, { status: 202, headers: { 'x-auth-request-email': 'staff@e3-services.com' } }));

beforeAll(async () => {
  filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-share-audience-'));
  Object.assign(process.env, { E3_DB_PATH: ':memory:', AUTH_MODE: 'local', GOOGLE_COMMENT_CLIENT_ID: 'public-client', NODE_ENV: 'test', E3_FILES_PATH: filesDir });
  closeDb();
  const client = ClientDAL.createClient({ key: 'audience-co', name: 'Secret Client Co' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'audience-eu', name: 'Secret Project EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'audience_check', class: 'custom' }).id;
  commentId = CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'E3', body: 'Hello' }).id;
  server = http.createServer(createApp({ sharedAuth: { verifyGoogle: verifier, staffFetch: staffFetch as unknown as typeof fetch }, serveStatic: false }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.E3_PUBLIC_ORIGIN = base;
});
beforeEach(() => {
  token = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!;
  ProjectDAL.updateShareSettings(projectId, { share_audience: 'listed_people' });
  for (const m of ProjectDAL.listShareMembers(projectId)) ProjectDAL.removeShareMember(projectId, m.id);
  ProjectDAL.addShareMember(projectId, { email: MEMBER, role: 'commenter' }, 'E3');
  Object.assign(process.env, { AUTH_MODE: 'local' });
  delete process.env.COMMENT_STAFF_SESSION;
  staffFetch.mockClear();
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(filesDir, { recursive: true, force: true });
  for (const key of ['E3_DB_PATH', 'AUTH_MODE', 'GOOGLE_COMMENT_CLIENT_ID', 'NODE_ENV', 'E3_PUBLIC_ORIGIN', 'E3_FILES_PATH', 'COMMENT_STAFF_SESSION', 'WORKSPACE_DOMAIN']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

const api = (suffix: string, share = token) => `${base}/api/shared/${share}${suffix}`;

/** Signs in through the shared Google route with the injectable verifier; returns the session cookie. */
async function signIn(claims: Record<string, unknown>): Promise<string> {
  const config = await fetch(api('/auth/config'));
  expect(config.status).toBe(200);
  const { csrf_token, nonce } = await config.json();
  const challenge = config.headers.get('set-cookie')!.split(';')[0];
  const payload = { aud: 'public-client', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, sub: `sub-${String(claims.email)}`, name: 'Visitor', nonce, ...claims };
  const res = await fetch(api('/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: challenge },
    body: JSON.stringify({ csrf_token, credential: JSON.stringify(payload) }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().find((c) => c.startsWith('e3_comment_auth='))!.split(';')[0];
}

/** Every data route under /api/shared/:token (header excluded), reads and writes. */
function dataRoutes(): { method: string; path: string; body?: unknown }[] {
  return [
    { method: 'GET', path: '/identity' },
    { method: 'GET', path: '/tracking-document.json' },
    { method: 'GET', path: '/document-summary.json' },
    { method: 'GET', path: `/events/${eventId}/card.json` },
    { method: 'GET', path: '/findings.json' },
    { method: 'GET', path: '/documentation.html' },
    { method: 'GET', path: '/files/logo.png' },
    { method: 'GET', path: '/comments' },
    { method: 'GET', path: `/history?entity_type=event&entity_id=${eventId}` },
    { method: 'GET', path: '/qa-reports' },
    { method: 'GET', path: '/qa-reports/some-report' },
    { method: 'GET', path: '/findings/some-finding/history' },
    { method: 'POST', path: '/comments', body: { entity_type: 'event', entity_id: eventId, body: 'Hi', author_name: 'X' } },
    { method: 'POST', path: `/comments/${commentId}/reactions`, body: { kind: 'thumbs_up' } },
    { method: 'PATCH', path: `/comments/${commentId}/status`, body: { status: 'resolved' } },
    { method: 'POST', path: `/comments/${commentId}/attachments`, body: {} },
  ];
}

async function call(route: { method: string; path: string; body?: unknown }, cookie?: string, share = token) {
  const headers: Record<string, string> = { Origin: base };
  if (cookie) headers.Cookie = cookie;
  if (route.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(api(route.path, share), { method: route.method, headers, body: route.body === undefined ? undefined : JSON.stringify(route.body) });
}

async function expectShutOut(cookie?: string) {
  const header = await (await fetch(api(''), { headers: cookie ? { Cookie: cookie } : {} })).json();
  expect(Object.keys(header).sort()).toEqual(['sign_in_required', 'signed_in']);
  expect(JSON.stringify(header)).not.toMatch(/Secret/);
  for (const route of dataRoutes()) {
    const res = await call(route, cookie);
    const unknown = await call(route, cookie, 'x'.repeat(43));
    expect(res.status, `${route.method} ${route.path}`).toBe(404);
    const body = await res.text();
    expect(body, `${route.method} ${route.path}`).toBe(await unknown.text());
    expect(JSON.parse(body)).toEqual({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' });
    expect(body).not.toMatch(/Secret|audience_check/);
  }
  // The sign-in routes keep working.
  expect((await fetch(api('/auth/config'), { headers: cookie ? { Cookie: cookie } : {} })).status).toBe(200);
}

describe('listed_people shuts out everyone who is not listed', () => {
  it('a signed-out visitor sees only the neutral sign-in header and 404 everywhere', async () => {
    const header = await (await fetch(api(''))).json();
    expect(header).toEqual({ sign_in_required: true, signed_in: false });
    await expectShutOut();
  });

  it('a visitor who signed in and then out is shut out again', async () => {
    const cookie = await signIn({ email: MEMBER, email_verified: true });
    const config = await fetch(api('/auth/config'), { headers: { Cookie: cookie } });
    const { csrf_token } = await config.json();
    const challenge = config.headers.get('set-cookie')!.split(';')[0];
    const out = await fetch(api('/auth/logout'), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: `${cookie}; ${challenge}` }, body: JSON.stringify({ csrf_token }) });
    expect(out.status).toBe(200);
    const signedOut = out.headers.getSetCookie().find((c) => c.startsWith('e3_comment_signed_out='))!.split(';')[0];
    await expectShutOut(signedOut);
  });

  it('a verified Google email that is not listed is shut out', async () => {
    const cookie = await signIn({ email: OTHER, email_verified: true });
    expect(await (await fetch(api(''), { headers: { Cookie: cookie } })).json()).toEqual({ sign_in_required: true, signed_in: true });
    await expectShutOut(cookie);
  });

  it('a listed email Google has not verified is shut out, and is never stored', async () => {
    const withEmail = () => (getDb().prepare('SELECT count(*) AS n FROM comment_auth_sessions WHERE email IS NOT NULL').get() as { n: number }).n;
    const before = withEmail();
    const cookie = await signIn({ email: MEMBER, email_verified: false });
    await expectShutOut(cookie);
    const absent = await signIn({ email: MEMBER });
    await expectShutOut(absent);
    expect(withEmail()).toBe(before);
  });

  it('a removed member is shut out on the next request', async () => {
    const cookie = await signIn({ email: MEMBER, email_verified: true });
    expect((await call({ method: 'GET', path: '/document-summary.json' }, cookie)).status).toBe(200);
    const member = ProjectDAL.findShareMember(projectId, MEMBER_LC)!;
    ProjectDAL.removeShareMember(projectId, member.id);
    await expectShutOut(cookie);
  });
});

describe('listed people get in, with the role capped by the link', () => {
  it('a listed, verified email (any case) opens every read route and never sees an email', async () => {
    const cookie = await signIn({ email: MEMBER.toUpperCase(), email_verified: true });
    const stored = getDb().prepare('SELECT email FROM comment_auth_sessions WHERE email IS NOT NULL').all() as { email: string }[];
    expect(stored.map((r) => r.email)).toContain(MEMBER_LC);
    const header = await (await fetch(api(''), { headers: { Cookie: cookie } })).json();
    expect(header.project.name).toBe('Secret Project EU');
    expect(header.access).toBe('comment');
    const responses = [JSON.stringify(header), await (await fetch(api('/auth/config'), { headers: { Cookie: cookie } })).text()];
    for (const route of dataRoutes().filter((r) => r.method === 'GET')) {
      const res = await call(route, cookie);
      // Missing file/report/finding and a non-history entity are this route's own 404s, past the gate.
      if (!['/files/logo.png', '/qa-reports/some-report', '/findings/some-finding/history'].includes(route.path) && !route.path.startsWith('/history')) expect(res.status, route.path).toBe(200);
      responses.push(await res.text());
    }
    for (const text of responses) expect(text.toLowerCase()).not.toContain(MEMBER_LC);
    const post = await call(dataRoutes().find((r) => r.method === 'POST' && r.path === '/comments')!, cookie);
    expect(post.status).toBe(201);
    expect((await post.text()).toLowerCase()).not.toContain(MEMBER_LC);
  });

  it('a commenter on a read-only link can only read', async () => {
    ProjectDAL.updateShareSettings(projectId, { access: 'read' });
    const cookie = await signIn({ email: MEMBER, email_verified: true });
    expect((await (await fetch(api(''), { headers: { Cookie: cookie } })).json()).access).toBe('read');
    const post = await call({ method: 'POST', path: '/comments', body: { entity_type: 'event', entity_id: eventId, body: 'Hi', author_name: 'X' } }, cookie);
    expect(post.status).toBe(403);
  });

  it('a viewer on a comment link can only read', async () => {
    const member = ProjectDAL.findShareMember(projectId, MEMBER_LC)!;
    ProjectDAL.updateShareMemberRole(projectId, member.id, 'viewer');
    const cookie = await signIn({ email: MEMBER, email_verified: true });
    expect((await (await fetch(api(''), { headers: { Cookie: cookie } })).json()).access).toBe('read');
    for (const route of dataRoutes().filter((r) => r.method !== 'GET' && !r.path.endsWith('/attachments'))) {
      expect((await call(route, cookie)).status, route.path).toBe(403);
    }
  });

  it('capShareAccess: no combination exceeds the link role', () => {
    expect(capShareAccess('comment', 'commenter')).toBe('comment');
    expect(capShareAccess('comment', 'viewer')).toBe('read');
    expect(capShareAccess('read', 'commenter')).toBe('read');
    expect(capShareAccess('read', 'viewer')).toBe('read');
  });

  it('Workspace staff recognised by the trusted proxy are always allowed', async () => {
    Object.assign(process.env, { AUTH_MODE: 'proxy', COMMENT_STAFF_SESSION: '1', WORKSPACE_DOMAIN: 'e3-services.com' });
    const res = await fetch(api('/document-summary.json'), { headers: { Cookie: '_oauth2_proxy=trusted' } });
    expect(res.status).toBe(200);
    expect(staffFetch).toHaveBeenCalled();
    // A browser header claiming staff changes nothing.
    staffFetch.mockImplementation(async () => new Response(null, { status: 401 }));
    try {
      expect((await fetch(api('/document-summary.json'), { headers: { Cookie: '_oauth2_proxy=forged', 'x-auth-request-email': 'staff@e3-services.com', 'x-forwarded-email': 'staff@e3-services.com' } })).status).toBe(404);
    } finally {
      staffFetch.mockImplementation(async () => new Response(null, { status: 202, headers: { 'x-auth-request-email': 'staff@e3-services.com' } }));
    }
    // Staff signed out of the commenter identity are still staff for the audience.
    expect((await fetch(api('/document-summary.json'), { headers: { Cookie: '_oauth2_proxy=trusted; e3_comment_signed_out=1' } })).status).toBe(200);
  });
});

describe('anyone_with_link is unchanged', () => {
  it('no sign-in, the same header keys, every route open', async () => {
    ProjectDAL.updateShareSettings(projectId, { share_audience: 'anyone_with_link' });
    const header = await (await fetch(api(''))).json();
    expect(Object.keys(header).sort()).toEqual(['access', 'client', 'generated_at', 'project', 'require_name']);
    expect(header.access).toBe('comment');
    expect((await fetch(api('/document-summary.json'))).status).toBe(200);
    expect((await fetch(api('/comments'))).status).toBe(200);
  });
});

describe('settings, change_log, rotate/revoke and backup', () => {
  it('members are validated, lower-cased, unique, logged as project updates and kept across rotate and revoke', async () => {
    expect(() => ProjectDAL.addShareMember(projectId, { email: 'not-an-email' }, null)).toThrow(/valid email/);
    expect(() => ProjectDAL.addShareMember(projectId, { email: 'x@y.com', role: 'editor' }, null)).toThrow(/viewer, commenter/);
    expect(() => ProjectDAL.addShareMember(projectId, { email: MEMBER.toUpperCase() }, null)).toThrow(/already listed/);
    expect(() => ProjectDAL.updateShareSettings(projectId, { share_audience: 'everyone' })).toThrow(/share_audience/);
    const logged = getDb().prepare("SELECT diff_json FROM change_log WHERE project_id = ? AND entity_type = 'project' AND diff_json LIKE '%share_members%' ORDER BY changed_at DESC LIMIT 1").get(projectId) as { diff_json: string };
    expect(logged.diff_json).toContain(MEMBER_LC);
    ProjectDAL.createOrRotateShare(projectId, 'comment');
    ProjectDAL.revokeShare(projectId);
    expect(ProjectDAL.listShareMembers(projectId).map((m) => m.email)).toEqual([MEMBER_LC]);
    expect(ProjectDAL.getProjectOrThrow(projectId).share_audience).toBe('listed_people');
  });

  it('backup carries share_members and the audience; restore brings them back (sessions stay out)', async () => {
    await signIn({ email: MEMBER, email_verified: true });
    const backup = await buildBackup(projectId);
    expect(backup.share_members.map((m) => [m.email, m.role])).toEqual([[MEMBER_LC, 'commenter']]);
    expect(backup.project.share_audience).toBe('listed_people');
    expect(JSON.stringify(backup)).not.toContain('comment_auth_sessions');
    const client = ClientDAL.createClient({ key: 'restored-co', name: 'Restored Co' });
    const preview = previewRestore(backup);
    expect(preview.counts.share_members).toBe(1);
    const { project } = await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored-audience', client_id: client.id });
    expect(project.share_audience).toBe('listed_people');
    expect(project.share_token).toBeNull();
    expect(ProjectDAL.listShareMembers(project.id).map((m) => [m.email, m.role])).toEqual([[MEMBER_LC, 'commenter']]);
    expect(ProjectDAL.listShareMembers(projectId)).toHaveLength(1);
  });
});
