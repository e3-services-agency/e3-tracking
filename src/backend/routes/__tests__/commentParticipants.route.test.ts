import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { closeDb, getDb } from '../../db';
import { staffParticipantId } from '../../services/commentParticipant';
import { LOCAL_USER_ID } from '../../middleware/auth';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { toggleReaction } from '../../dal/comment-reaction.dal';
import { buildBackup } from '../../services/backup.service';
import { previewRestore, applyRestore } from '../../services/backupRestore.service';

const savedPublicOrigin = process.env.E3_PUBLIC_ORIGIN;
let server: http.Server;
let base: string;
let token: string;
let projectId: string;
let clientId: string;
let eventId: string;
const endpoint = (path: string) => `${base}/api/shared/${token}${path}`;
const post = (path: string, body: unknown, cookie = '', extra: Record<string, string> = {}) => fetch(endpoint(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, ...extra }, body: JSON.stringify(body) });
const anchor = () => ({ entity_type: 'event', entity_id: eventId });
async function browser() {
  const response = await fetch(endpoint('/identity'));
  expect(response.status).toBe(200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], identity: await response.json() };
}
beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  clientId = ClientDAL.createClient({ key: 'participant-test', name: 'Participants' }).id;
  projectId = ProjectDAL.createProject({ client_id: clientId, key: 'participant-project', name: 'Participants' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'purchase', class: 'custom' }).id;
  token = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!;
  const app = express();
  // Test fixture represents verified middleware, not a production client-header trust path.
  app.use((req, _res, next) => {
    if (req.headers['x-test-verified'] === 'yes') req.commentParticipant = { id: 'google:test-subject', name: 'Verified Jane', kind: 'google', verified: true, avatar_url: 'https://lh3.googleusercontent.com/profile' };
    if (req.headers['x-test-staff'] === 'yes') req.commentParticipant = { id: staffParticipantId(LOCAL_USER_ID), name: 'Verified staff', kind: 'staff', verified: true };
    next();
  });
  app.use(createApp());
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.E3_PUBLIC_ORIGIN = base;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); closeDb(); delete process.env.E3_DB_PATH; if (savedPublicOrigin === undefined) delete process.env.E3_PUBLIC_ORIGIN; else process.env.E3_PUBLIC_ORIGIN = savedPublicOrigin; });

describe('share participants', () => {
  it('uses a stable animal/color guest without exposing session or participant IDs', async () => {
    const guest = await browser();
    expect(guest.identity).toMatchObject({ kind: 'guest', verified: false, name_chosen: false });
    expect(guest.identity.name).toMatch(/^(Blue|Green|Amber|Purple|Coral|Silver|Teal|Rose) /);
    expect(guest.identity).not.toHaveProperty('id');
    const again = await (await fetch(endpoint('/identity'), { headers: { Cookie: guest.cookie } })).json();
    expect(again.name).toBe(guest.identity.name);
    const response = await post('/comments', { ...anchor(), body: 'Anonymous comment' }, guest.cookie);
    expect(response.status).toBe(201);
    const comment = await response.json();
    expect(comment.author_name).toBe(guest.identity.name);
    expect(comment.author_kind).toBe('guest');
    expect(comment).not.toHaveProperty('participant_id');
    const row = CommentDAL.getCommentOrThrow(projectId, comment.id);
    expect(row.participant_id).toMatch(/^guest:/);
    expect(JSON.stringify(await buildBackup(projectId))).not.toContain(guest.cookie.split('=')[1]);
  });
  it('does not race identity initialization by issuing cookies from concurrent comment-list reads', async () => {
    const [identity, comments] = await Promise.all([fetch(endpoint('/identity')), fetch(endpoint('/comments'))]);
    expect(identity.headers.get('set-cookie')).toContain('e3_comment_guest=');
    expect(comments.headers.get('set-cookie')).toBeNull();
    const cookie = identity.headers.get('set-cookie')!.split(';')[0];
    const initialName = (await identity.json()).name;
    const posted = await (await post('/comments', { ...anchor(), body: 'Authoritative identity' }, cookie)).json();
    expect(posted.author_name).toBe(initialName);
    const again = await fetch(endpoint('/comments'), { headers: { Cookie: cookie } });
    expect(again.headers.get('set-cookie')).toBeNull();
  });
  it('keeps reaction ownership separate for identical names, and stable when one guest changes name', async () => {
    const first = await browser();
    const second = await browser();
    const comment = await (await post('/comments', { ...anchor(), body: 'Reaction target' }, first.cookie)).json();
    for (const guest of [first, second]) {
      const result = await (await post(`/comments/${comment.id}/reactions`, { kind: 'like', author_name: 'Alex' }, guest.cookie)).json();
      expect(result.added).toBe(true);
      expect(result.reactions[0].mine).toBe(true);
    }
    const firstList = await (await fetch(endpoint('/comments'), { headers: { Cookie: first.cookie } })).json();
    expect(firstList.find((c: any) => c.id === comment.id).reactions[0]).toMatchObject({ count: 2, authors: ['Alex', 'Alex'], mine: true });
    const removed = await (await post(`/comments/${comment.id}/reactions`, { kind: 'like', author_name: 'Renamed Alex' }, first.cookie)).json();
    expect(removed.added).toBe(false);
    expect(removed.reactions[0]).toMatchObject({ count: 1, mine: false });
    expect((await (await post(`/comments/${comment.id}/reactions`, { kind: 'like', author_name: 'Alex' }, second.cookie)).json()).added).toBe(false);
  });
  it('requires an explicitly chosen name, excluding old generated Visitor labels', async () => {
    ProjectDAL.updateShareSettings(projectId, { share_require_name: true });
    const guest = await browser();
    for (const author_name of [undefined, '', 'Visitor 4f2a']) {
      expect((await post('/comments', { ...anchor(), body: 'Requires a name', ...(author_name !== undefined ? { author_name } : {}) }, guest.cookie)).status).toBe(400);
    }
    expect((await post('/comments', { ...anchor(), body: 'Named', author_name: 'Alex' }, guest.cookie)).status).toBe(201);
    // Middleware identity meets required-name without trusting an author claim from the request.
    const verified = await post('/comments', { ...anchor(), body: 'Verified', author_name: 'Impersonated Name' }, '', { 'x-test-verified': 'yes' });
    expect(verified.status).toBe(201);
    expect(await verified.json()).toMatchObject({ author_name: 'Verified Jane', author_kind: 'google', avatar_url: 'https://lh3.googleusercontent.com/profile' });
    ProjectDAL.updateShareSettings(projectId, { share_require_name: false });
  });
  it('refuses client identity/photo claims and treats named guests as unverified', async () => {
    const guest = await browser();
    for (const claim of [{ participant_id: 'google:other' }, { author_kind: 'google' }, { avatar_url: 'https://evil.test/a' }, { verified: true }]) {
      const response = await post('/comments', { ...anchor(), body: 'Forged', author_name: 'Verified Jane', ...claim }, guest.cookie);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('FIELD_NOT_ALLOWED');
    }
    const named = await (await post('/comments', { ...anchor(), body: 'Just a display name', author_name: 'Verified Jane' }, guest.cookie)).json();
    expect(named.author_kind).toBe('guest');
    expect(named.avatar_url).toBeNull();
  });
  it('shares staff reaction ownership across internal and verified shared sessions', async () => {
    const response = await fetch(`${base}/api/projects/${projectId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...anchor(), body: 'Staff thread' }) });
    const comment = await response.json();
    expect(comment.author_kind).toBe('staff');
    expect(comment.participant_id).toBe(staffParticipantId(LOCAL_USER_ID));
    const reaction = await fetch(`${base}/api/projects/${projectId}/comments/${comment.id}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'like' }) });
    expect((await reaction.json()).added).toBe(true);
    const sameStaff = await post(`/comments/${comment.id}/reactions`, { kind: 'like' }, '', { 'x-test-staff': 'yes' });
    expect((await sameStaff.json()).added).toBe(false);
    expect(staffParticipantId('JANE@EXAMPLE.COM')).toBe(staffParticipantId('jane@example.com'));
  });
  it('does not show hidden threads/reactions to identity-bearing guests', async () => {
    const root = CommentDAL.createComment(projectId, { ...anchor(), body: 'PRIVATE BODY', author_name: 'Private staff', internal_only: true });
    toggleReaction(projectId, root.id, 'like', 'PRIVATE REACTOR', { participantId: 'google:private' });
    const guest = await browser();
    const response = await fetch(endpoint('/comments'), { headers: { Cookie: guest.cookie } });
    const data = await response.text();
    expect(data).not.toContain('PRIVATE');
    expect((await post(`/comments/${root.id}/reactions`, { kind: 'like' }, guest.cookie)).status).toBe(404);
  });
  it('binds new comment image uploads to the originating participant', async () => {
    const first = await browser(); const second = await browser();
    const comment = await (await post('/comments', { ...anchor(), body: 'Image owner' }, first.cookie)).json();
    const data = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(data)], { type: 'image/png' }), 'shot.png');
    const response = await fetch(endpoint(`/comments/${comment.id}/attachments`), { method: 'POST', headers: { Cookie: second.cookie }, body: form });
    expect(response.status).toBe(404);
  });
  it('restores backups made before participant columns, retaining names and legacy reactions', async () => {
    const root = CommentDAL.createComment(projectId, { ...anchor(), body: 'Legacy', author_name: 'Old guest' });
    toggleReaction(projectId, root.id, 'like', 'Old guest');
    const backup = await buildBackup(projectId);
    for (const comment of backup.comments) { delete comment.participant_id; delete comment.author_kind; delete comment.avatar_url; }
    for (const reaction of backup.comment_reactions) delete reaction.participant_id;
    const restored = await applyRestore(backup, previewRestore(backup).payload_hash, { client_id: clientId, name: 'Restored', key: 'participant-restored' });
    const old = CommentDAL.listComments(restored.project.id).find((c) => c.body === 'Legacy')!;
    expect(old).toMatchObject({ author_name: 'Old guest', author_kind: 'legacy', participant_id: null, avatar_url: null });
    expect(getDb().prepare('SELECT author_name, participant_id FROM comment_reactions WHERE project_id = ? AND comment_id = ?').get(restored.project.id, old.id)).toEqual({ author_name: 'Old guest', participant_id: null });
  });
});
