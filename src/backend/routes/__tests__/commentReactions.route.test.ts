/**
 * Comment reactions and require-name (D-70 items 3 and 5, T-5-03): toggle idempotency, one per
 * author (case-insensitive), on_it -> status with restricted share rules, share visibility with the
 * identical 404, FIELD_NOT_ALLOWED, require_name, public filtering, backup and CSV pick-up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { staffParticipantId } from '../../services/commentParticipant';
import { LOCAL_USER_NAME } from '../../middleware/auth';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { toggleReaction, listReactionSummaries } from '../../dal/comment-reaction.dal';
import { buildBackup } from '../../services/backup.service';
import { buildCsvRows } from '../../services/csvExport.service';

let server: http.Server;
let baseUrl: string;
let projectId: string;
let eventId: string;
let token: string;

const json = (method: string, url: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const base = () => ({ entity_type: 'event', entity_id: eventId });
const mk = (extra: Partial<CommentDAL.CommentInput> = {}) =>
  CommentDAL.createComment(projectId, { ...base(), author_name: 'Jan', body: 'c', ...extra });
const shared = (path: string) => `${baseUrl}/api/shared/${token}${path}`;

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

describe('DAL toggle', () => {
  it('adds then removes; unique per author case-insensitively and per kind', () => {
    const c = mk();
    expect(toggleReaction(projectId, c.id, 'like', 'Anna').added).toBe(true);
    expect(toggleReaction(projectId, c.id, 'like', 'anna').added).toBe(false);
    expect(listReactionSummaries(projectId).get(c.id)).toBeUndefined();
    toggleReaction(projectId, c.id, 'like', 'Anna');
    toggleReaction(projectId, c.id, 'like', 'Bob');
    toggleReaction(projectId, c.id, 'seen', 'Anna');
    expect(listReactionSummaries(projectId).get(c.id)).toEqual([
      { kind: 'seen', count: 1, authors: ['Anna'] },
      { kind: 'like', count: 2, authors: ['Anna', 'Bob'] },
    ]);
  });

  it('removes a migrated internal reaction marked mine instead of creating a duplicate', () => {
    const c = mk();
    toggleReaction(projectId, c.id, 'like', 'Jane'); // Migrated data: participant_id is NULL.
    const staffId = staffParticipantId('jane@example.com');
    expect(listReactionSummaries(projectId, [c.id], 'Jane', staffId).get(c.id)).toEqual([{ kind: 'like', count: 1, authors: ['Jane'], mine: true }]);
    expect(toggleReaction(projectId, c.id, 'like', 'Jane', { participantId: staffId, legacyAuthorName: 'Jane', viaShare: false }).added).toBe(false);
    expect(listReactionSummaries(projectId, [c.id], 'Jane', staffId).get(c.id)).toBeUndefined();
  });

  it('never lets a same-name shared guest claim a legacy internal reaction', () => {
    const c = mk();
    toggleReaction(projectId, c.id, 'like', 'Jane');
    const guestId = 'guest:independent-browser';
    expect(listReactionSummaries(projectId, [c.id], 'Jane', guestId).get(c.id)?.[0]).toMatchObject({ count: 1, mine: false });
    expect(toggleReaction(projectId, c.id, 'like', 'Jane', { participantId: guestId, legacyAuthorName: 'Jane', viaShare: true }).added).toBe(true);
    expect(listReactionSummaries(projectId, [c.id], undefined, guestId).get(c.id)?.[0]).toMatchObject({ count: 2, mine: true });
    expect(toggleReaction(projectId, c.id, 'like', 'Renamed guest', { participantId: guestId, viaShare: true }).added).toBe(false);
    expect(listReactionSummaries(projectId, [c.id], undefined, guestId).get(c.id)?.[0]).toMatchObject({ count: 1, authors: ['Jane'], mine: false });
  });

  it('rejects an unknown kind and a missing author; on_it only on a root', () => {
    const c = mk();
    const reply = mk({ parent_id: c.id });
    expect(() => toggleReaction(projectId, c.id, 'heart', 'A')).toThrow();
    expect(() => toggleReaction(projectId, c.id, 'like', '  ')).toThrow();
    expect(() => toggleReaction(projectId, reply.id, 'on_it', 'A')).toThrow();
    expect(toggleReaction(projectId, reply.id, 'seen', 'A').added).toBe(true);
  });

  it('on_it sets an open root to on_it; removing it leaves the status; closed comments stay closed', () => {
    const c = mk();
    expect(toggleReaction(projectId, c.id, 'on_it', 'Anna').comment.status).toBe('on_it');
    toggleReaction(projectId, c.id, 'on_it', 'Anna');
    expect(CommentDAL.getCommentOrThrow(projectId, c.id).status).toBe('on_it');
    const done = mk();
    CommentDAL.setCommentStatus(projectId, done.id, 'done', 'Jan');
    const r = toggleReaction(projectId, done.id, 'on_it', 'Bob', { viaShare: true });
    expect(r.added).toBe(true);
    expect(r.comment.status).toBe('done');
  });

  it('deleting the comment cascades its reactions', () => {
    const c = mk();
    toggleReaction(projectId, c.id, 'like', 'A');
    CommentDAL.deleteComment(projectId, c.id);
    expect(listReactionSummaries(projectId).get(c.id)).toBeUndefined();
  });
});

describe('internal routes', () => {
  it('uses the trusted actor to remove a legacy reaction that the list marks mine', async () => {
    const c = mk();
    toggleReaction(projectId, c.id, 'like', LOCAL_USER_NAME);
    const url = `${baseUrl}/api/projects/${projectId}/comments`;
    const list = await (await fetch(url)).json();
    expect(list.find((row: any) => row.id === c.id).reactions[0]).toMatchObject({ count: 1, mine: true });
    const result = await (await json('POST', `${url}/${c.id}/reactions`, { kind: 'like' })).json();
    expect(result.added).toBe(false);
    expect(result.reactions).toEqual([]);
  });
  it('POST toggles and the list carries reactions[]', async () => {
    const c = mk();
    const url = `${baseUrl}/api/projects/${projectId}/comments`;
    const res = await json('POST', `${url}/${c.id}/reactions`, { kind: 'like', author_name: 'Jan' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(true);
    expect(body.reactions).toMatchObject([{ kind: "like", count: 1, authors: ["Jan"] }]);
    const list = await (await fetch(`${url}?entity_id=${eventId}`)).json();
    expect(list.find((x: any) => x.id === c.id).reactions).toHaveLength(1);
    expect((await (await json('POST', `${url}/${c.id}/reactions`, { kind: 'like', author_name: 'Jan' })).json()).added).toBe(false);
    expect((await json('POST', `${url}/${c.id}/reactions`, { kind: 'nope' })).status).toBe(400);
  });
});

describe('shared routes', () => {
  it('toggles, sets status on_it, and the public list carries names', async () => {
    const c = mk();
    const res = await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'on_it', author_name: 'Client Carl' });
    expect(res.status).toBe(200);
    expect((await res.json()).comment.status).toBe('on_it');
    const list = await (await fetch(shared(`/comments?entity_id=${eventId}`))).json();
    const row = list.find((x: any) => x.id === c.id);
    expect(row.status).toBe('on_it');
    expect(row.reactions).toEqual([{ kind: 'on_it', count: 1, authors: ['Client Carl'], mine: false }]);
  });

  it('refuses unknown body keys with FIELD_NOT_ALLOWED', async () => {
    const c = mk();
    const res = await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'like', author_name: 'A', via_share: false });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FIELD_NOT_ALLOWED');
  });

  it('hidden, missing and reply-of-hidden ids give the identical 404; reactions on hidden never leak', async () => {
    const hidden = mk({ internal_only: true });
    const hiddenReply = mk({ parent_id: hidden.id });
    toggleReaction(projectId, hidden.id, 'like', 'Secret');
    const bodies: string[] = [];
    for (const id of [hidden.id, hiddenReply.id, 'does-not-exist']) {
      const res = await json('POST', shared(`/comments/${id}/reactions`), { kind: 'like', author_name: 'A' });
      expect(res.status).toBe(404);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain('SHARE_NOT_FOUND');
    const list = JSON.stringify(await (await fetch(shared(`/comments?entity_id=${eventId}`))).json());
    expect(list).not.toContain('Secret');
  });

  it('an independently private reply never returns its body or gains a reaction through its public root', async () => {
    const root = mk({ via_share: true });
    const hidden = mk({ parent_id: root.id, body: 'PRIVATE-REPLY-BODY' });
    CommentDAL.setCommentInternalOnly(projectId, hidden.id, true);
    toggleReaction(projectId, hidden.id, 'like', 'Private staff');
    ProjectDAL.updateShareSettings(projectId, { share_comments: 'via_share_only' });
    try {
      const denied = await json('POST', shared(`/comments/${hidden.id}/reactions`), { kind: 'seen', author_name: 'Guest' });
      const missing = await json('POST', shared('/comments/does-not-exist/reactions'), { kind: 'seen', author_name: 'Guest' });
      expect(denied.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await denied.text()).toBe(await missing.text());
      expect(listReactionSummaries(projectId, [hidden.id]).get(hidden.id)).toEqual([{ kind: 'like', count: 1, authors: ['Private staff'] }]);
      const staff = await json('POST', `${baseUrl}/api/projects/${projectId}/comments/${hidden.id}/reactions`, { kind: 'seen' });
      expect(staff.status).toBe(200);
      expect((await staff.json()).comment.body).toBe('PRIVATE-REPLY-BODY');
      // Staff-authored public replies remain permitted when the root was shared.
      const visible = mk({ parent_id: root.id, body: 'Public staff reply' });
      const allowed = await json('POST', shared(`/comments/${visible.id}/reactions`), { kind: 'like', author_name: 'Guest' });
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).comment.body).toBe('Public staff reply');
      CommentDAL.setCommentInternalOnly(projectId, root.id, true);
      expect((await json('POST', shared(`/comments/${visible.id}/reactions`), { kind: 'seen', author_name: 'Guest' })).status).toBe(404);
    } finally { ProjectDAL.updateShareSettings(projectId, { share_comments: 'all' }); }
  });

  it('a read-only link cannot react', async () => {
    const c = mk();
    ProjectDAL.updateShareAccess(projectId, 'read');
    expect((await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'like', author_name: 'A' })).status).toBe(403);
    ProjectDAL.updateShareAccess(projectId, 'comment');
  });

  it('require_name: header flag, and posts, reactions and status changes need a name', async () => {
    const c = mk();
    ProjectDAL.updateShareSettings(projectId, { share_require_name: true });
    expect((await (await fetch(shared(''))).json()).require_name).toBe(true);
    expect((await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'seen' })).status).toBe(400);
    expect((await json('PATCH', shared(`/comments/${c.id}/status`), { status: 'done' })).status).toBe(400);
    expect(
      (await json('POST', shared('/comments'), { ...base(), body: 'x', author_name: ' ' })).status
    ).toBe(400);
    expect((await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'seen', author_name: 'Carl' })).status).toBe(200);
    ProjectDAL.updateShareSettings(projectId, { share_require_name: false });
    expect((await (await fetch(shared(''))).json()).require_name).toBe(false);
    // Optional-name links now use a server-issued animal/color identity.
    expect((await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'like' })).status).toBe(200);
    expect((await json('POST', shared(`/comments/${c.id}/reactions`), { kind: 'like', author_name: 'Visitor 4f2a' })).status).toBe(200);
    for (const path of [`/comments/${c.id}/reactions`]) {
      expect((await json('POST', shared(path), { kind: 'like', author_name: 'share link' })).status).toBe(400);
    }
    expect((await json('PATCH', shared(`/comments/${c.id}/status`), { status: 'on_it', author_name: 'Share Link' })).status).toBe(400);
    expect((await json('POST', shared('/comments'), { ...base(), body: 'x', author_name: 'Share link' })).status).toBe(400);
  });

  it('PATCH /projects/:id accepts share_require_name as a boolean only', async () => {
    const url = `${baseUrl}/api/projects/${projectId}`;
    expect((await json('PATCH', url, { share_require_name: 'yes' })).status).toBe(400);
    expect((await (await json('PATCH', url, { share_require_name: true })).json()).share_require_name).toBe(true);
    await json('PATCH', url, { share_require_name: false });
  });
});

describe('backup and CSV', () => {
  it('backup carries comment_reactions and CSV exports them', async () => {
    const c = mk();
    toggleReaction(projectId, c.id, 'like', 'Backup Bea');
    const backup = (await buildBackup(projectId)) as unknown as { comment_reactions?: unknown[]; tables?: Record<string, unknown[]> };
    const rows = (backup.comment_reactions ?? backup.tables?.comment_reactions) as { author_name: string }[];
    expect(rows.some((r) => r.author_name === 'Backup Bea')).toBe(true);
    expect(buildCsvRows(projectId, 'comment_reactions').some((r) => r.author_name === 'Backup Bea')).toBe(true);
  });
});
