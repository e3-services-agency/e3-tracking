/**
 * Comment threads and status (D-70, T-5-02): migration backfill, DAL threads/inheritance, status
 * rules internal vs share, shared GET filtering of internal threads, `resolved` compatibility.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, getDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { groupThreads, countByStatus } from '../../../domain/commentThreads';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;
let token: string;

const json = (method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'purchase', class: 'custom' }).id;
  token = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!;
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

const base = () => ({ entity_type: 'event', entity_id: eventId });

describe('migration 0033 backfill', () => {
  it('maps resolved comments to done and keeps new rows open', () => {
    const db = getDb();
    const open = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'open one' });
    expect(open.status).toBe('open');
    expect(open.parent_id).toBeNull();
    // The backfill statement itself, run against a legacy-shaped resolved row.
    const legacy = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'legacy' });
    db.prepare("UPDATE comments SET resolved_at = '2026-01-01T00:00:00.000Z', resolved_by = 'Jan' WHERE id = ?").run(legacy.id);
    db.prepare("UPDATE comments SET status = 'done' WHERE resolved_at IS NOT NULL").run();
    expect(CommentDAL.getCommentOrThrow(projectId, legacy.id).status).toBe('done');
  });
});

describe('DAL threads', () => {
  it('replies inherit entity and internal_only from the root, attach to the root, and group', () => {
    const root = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'root', internal_only: true });
    const r1 = CommentDAL.createComment(projectId, { entity_type: 'property', entity_id: 'ignored', author_name: 'B', body: 'r1', parent_id: root.id });
    const r2 = CommentDAL.createComment(projectId, { ...base(), author_name: 'C', body: 'r2', parent_id: r1.id });
    expect(r1.entity_type).toBe('event');
    expect(r1.entity_id).toBe(eventId);
    expect(r1.internal_only).toBe(true);
    expect(r2.parent_id).toBe(root.id);
    const threads = groupThreads(CommentDAL.listComments(projectId, { entity_id: eventId })).filter((t) => t.id === root.id);
    expect(threads[0].replies.map((r) => r.body)).toEqual(['r1', 'r2']);
    expect(countByStatus(CommentDAL.listComments(projectId)).open).toBeGreaterThan(0);
  });

  it('rejects a parent that does not exist in the project', () => {
    expect(() => CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'x', parent_id: 'nope' })).toThrow();
  });

  it('status done mirrors resolved_at and reopening clears it', () => {
    const c = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'mirror' });
    const done = CommentDAL.setCommentStatus(projectId, c.id, 'done', 'Jan');
    expect(done.resolved_at).toBeTruthy();
    expect(done.status_changed_by).toBe('Jan');
    const reopened = CommentDAL.setCommentStatus(projectId, c.id, 'open', 'Jan');
    expect(reopened.resolved_at).toBeNull();
  });

  it('deleting a root cascades its replies', () => {
    const root = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'cascade' });
    const reply = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'child', parent_id: root.id });
    CommentDAL.deleteComment(projectId, root.id);
    expect(() => CommentDAL.getCommentOrThrow(projectId, reply.id)).toThrow();
  });
});

describe('internal routes', () => {
  it('PATCH accepts status and the legacy resolved flag', async () => {
    const c = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'patch' });
    const url = `${baseUrl}/api/projects/${projectId}/comments/${c.id}`;
    expect((await (await json('PATCH', url, { status: 'wont_do' })).json()).status).toBe('wont_do');
    const resolved = await (await json('PATCH', url, { resolved: true })).json();
    expect(resolved.status).toBe('done');
    expect(resolved.resolved_at).toBeTruthy();
    expect((await (await json('PATCH', url, { resolved: false })).json()).status).toBe('open');
    expect((await json('PATCH', url, { status: 'bogus' })).status).toBe(400);
  });

  it('POST accepts parent_id', async () => {
    const root = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'root' });
    const res = await json('POST', `${baseUrl}/api/projects/${projectId}/comments`, { parent_id: root.id, body: 'reply', author_name: 'Jan' });
    expect(res.status).toBe(201);
    expect((await res.json()).parent_id).toBe(root.id);
  });
});

describe('share routes', () => {
  const sharedUrl = (p: string) => `${baseUrl}/api/shared/${token}${p}`;

  it('a link may set on_it and done, never wont_do, and never reopen', async () => {
    const c = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'share status' });
    const url = sharedUrl(`/comments/${c.id}/status`);
    expect((await json('PATCH', url, { status: 'on_it', author_name: 'Client' })).status).toBe(200);
    const wont = await json('PATCH', url, { status: 'wont_do' });
    expect(wont.status).toBe(403);
    expect((await wont.json()).code).toBe('STATUS_NOT_ALLOWED');
    expect((await json('PATCH', url, { status: 'done' })).status).toBe(200);
    const reopen = await json('PATCH', url, { status: 'open' });
    expect(reopen.status).toBe(403);
    expect((await reopen.json()).code).toBe('STATUS_NOT_ALLOWED');
    expect((await json('PATCH', url, { status: 'on_it' })).status).toBe(403);
    expect((await json('PATCH', url, { status: 'done', extra: 1 })).status).toBe(400);
  });

  it('a read-only link cannot change status (SHARE_READ_ONLY)', async () => {
    const c = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'ro' });
    ProjectDAL.updateShareAccess(projectId, 'read');
    const res = await json('PATCH', sharedUrl(`/comments/${c.id}/status`), { status: 'done' });
    ProjectDAL.updateShareAccess(projectId, 'comment');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SHARE_READ_ONLY');
  });

  it('an internal-only comment answers 404 to the status route and its thread never appears in GET', async () => {
    const secret = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'secret thread', internal_only: true });
    CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'secret reply', parent_id: secret.id });
    const res = await json('PATCH', sharedUrl(`/comments/${secret.id}/status`), { status: 'done' });
    expect(res.status).toBe(404);
    const list = (await (await fetch(sharedUrl('/comments'))).json()) as Array<{ body: string; status_changed_by?: string }>;
    expect(list.some((c) => c.body.startsWith('secret'))).toBe(false);
    expect(list.every((c) => !('status_changed_by' in c))).toBe(true);
  });

  it('a share reply goes under its root; parent_id is an allowed key', async () => {
    const root = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'visible root' });
    const res = await json('POST', sharedUrl('/comments'), { parent_id: root.id, author_name: 'Client', body: 'client reply' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parent_id).toBe(root.id);
    expect(body.via_share).toBe(true);
  });

  it('via_share_only keeps replies of share-posted roots only', async () => {
    ProjectDAL.updateShareSettings(projectId, { share_comments: 'via_share_only' });
    const internalRoot = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'vso internal root' });
    CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'vso reply a', parent_id: internalRoot.id, via_share: true });
    const sharedRoot = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'vso shared root', via_share: true });
    CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'vso reply b', parent_id: sharedRoot.id });
    const list = (await (await fetch(sharedUrl('/comments'))).json()) as Array<{ body: string }>;
    ProjectDAL.updateShareSettings(projectId, { share_comments: 'all' });
    const bodies = list.map((c) => c.body);
    expect(bodies).toContain('vso shared root');
    expect(bodies).toContain('vso reply b');
    expect(bodies).not.toContain('vso internal root');
    expect(bodies).not.toContain('vso reply a');
  });

  it('missing, hidden and reply ids give the identical body; no reply is created under a hidden root', async () => {
    const secret = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'hid', internal_only: true });
    const visible = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'vis' });
    const reply = CommentDAL.createComment(projectId, { ...base(), author_name: 'A', body: 'rep', parent_id: visible.id });
    const patch = async (id: string) => {
      const r = await json('PATCH', sharedUrl(`/comments/${id}/status`), { status: 'done' });
      return [r.status, await r.json()];
    };
    const missing = await patch('does-not-exist');
    expect(missing[0]).toBe(404);
    expect(await patch(secret.id)).toEqual(missing);
    expect(await patch(reply.id)).toEqual(missing);
    const before = CommentDAL.listComments(projectId).length;
    const post = async (parent: string) => {
      const r = await json('POST', sharedUrl('/comments'), { parent_id: parent, author_name: 'C', body: 'x' });
      return [r.status, await r.json()];
    };
    const pm = await post('does-not-exist');
    expect(pm[0]).toBe(404);
    expect(await post(secret.id)).toEqual(pm);
    expect(CommentDAL.listComments(projectId).length).toBe(before);
  });
});
