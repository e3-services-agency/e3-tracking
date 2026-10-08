/**
 * T-5-04 (D-70 item 4): comment images. Pipeline (magic bytes, size, re-encode strips metadata),
 * internal and share upload routes, the 10 image limit, share visibility of the files, the per-token
 * caps, and the backup/restore round trip.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { closeDb, getDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';
import * as CommentDAL from '../../dal/comment.dal';
import { listAttachmentsForComment } from '../../dal/comment-attachment.dal';
import { buildBackup } from '../../services/backup.service';
import { previewRestore, applyRestore } from '../../services/backupRestore.service';
import { reencodeImage, sniffImageMime } from '../../services/commentAttachments.service';
import { getFileStore } from '../../files/FileStore';

let server: http.Server;
let baseUrl: string;
let tmpFilesDir: string;
let projectId: string;
let clientId: string;
let sharedCookie = '';
let eventId: string;

async function png(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();
}

/** A JPEG carrying EXIF text that must not survive re-encoding. */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: '#aa3333' } })
    .withExif({ IFD0: { Copyright: 'SECRET-EXIF-MARKER', Software: 'leaky-tool' } })
    .jpeg()
    .toBuffer();
}

function form(buf: Buffer | Uint8Array, name = 'shot.png', type = 'image/png'): FormData {
  const f = new FormData();
  f.append('file', new Blob([buf as BlobPart], { type }), name);
  return f;
}

async function upload(url: string, buf: Buffer, name?: string, type?: string): Promise<Response> {
  return fetch(url, { method: 'POST', headers: url.includes('/api/shared/') && sharedCookie ? { Cookie: sharedCookie } : undefined, body: form(buf, name, type) });
}

async function postComment(extra: Record<string, unknown> = {}): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'with images', ...extra }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function createShare(access: 'read' | 'comment' = 'comment'): Promise<string> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access }),
  });
  return (await res.json()).share_token as string;
}

async function sharedComment(token: string): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/shared/${token}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type: 'event', entity_id: eventId, author_name: 'Client', body: 'screenshot' }),
  });
  expect(res.status).toBe(201);
  sharedCookie = res.headers.get('set-cookie')?.split(';')[0] ?? sharedCookie;
  return res.json();
}

async function patchShare(body: Record<string, unknown>): Promise<void> {
  await fetch(`${baseUrl}/api/projects/${projectId}/share`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  tmpFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-comment-att-'));
  process.env.E3_DB_PATH = ':memory:';
  process.env.E3_FILES_PATH = tmpFilesDir;
  closeDb();
  clientId = ClientDAL.createClient({ key: 'acme', name: 'Acme' }).id;
  projectId = ProjectDAL.createProject({ client_id: clientId, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'att_event', class: 'custom' }).id;
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpFilesDir, { recursive: true, force: true });
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
});

describe('image pipeline', () => {
  it('detects the type from magic bytes, not the name', async () => {
    expect(sniffImageMime(await png())).toBe('image/png');
    expect(sniffImageMime(await jpegWithExif())).toBe('image/jpeg');
    expect(sniffImageMime(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000000' } }).webp().toBuffer())).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('GIF89a......'))).toBeNull();
  });

  it('rejects a non-image renamed .png and a truncated image', async () => {
    await expect(reencodeImage(Buffer.from('<script>alert(1)</script>'))).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE' });
    const good = await png(64, 64);
    await expect(reencodeImage(good.subarray(0, 30))).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE' });
  });

  it('re-encoding strips EXIF', async () => {
    const original = await jpegWithExif();
    expect(original.includes(Buffer.from('SECRET-EXIF-MARKER'))).toBe(true);
    const out = await reencodeImage(original);
    expect(out.mime).toBe('image/jpeg');
    expect(out.buffer.includes(Buffer.from('SECRET-EXIF-MARKER'))).toBe(false);
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
  });

  it('drops trailing bytes appended after the image data', async () => {
    const withTail = Buffer.concat([await png(), Buffer.from('SECRET-PNG-MARKER')]);
    const out = await reencodeImage(withTail);
    expect(out.buffer.includes(Buffer.from('SECRET-PNG-MARKER'))).toBe(false);
  });
});

describe('internal routes', () => {
  it('uploads, lists, serves and deletes an image', async () => {
    const c = await postComment();
    const res = await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png(20, 10));
    expect(res.status).toBe(201);
    const att = await res.json();
    expect(att).toMatchObject({ mime: 'image/png', width: 20, height: 10, comment_id: c.id });
    expect(att.file_path.startsWith(`${projectId}/comments/${c.id}/`)).toBe(true);

    const list = await (await fetch(`${baseUrl}/api/projects/${projectId}/comments?entity_type=event&entity_id=${eventId}`)).json();
    const row = list.find((r: { id: string }) => r.id === c.id);
    expect(row.attachments).toHaveLength(1);

    const file = await fetch(`${baseUrl}/api/projects/${projectId}/files/${att.file_path}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');

    const del = await fetch(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments/${att.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await fetch(`${baseUrl}/api/projects/${projectId}/files/${att.file_path}`)).status).toBe(404);
  });

  it('rejects an svg/text file, an oversize file and a missing file', async () => {
    const c = await postComment();
    const url = `${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`;
    const bad = await upload(url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.png', 'image/png');
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('UNSUPPORTED_IMAGE_TYPE');
    const big = await upload(url, Buffer.alloc(5 * 1024 * 1024 + 10, 1));
    expect(big.status).toBe(400);
    expect((await big.json()).code).toBe('FILE_TOO_LARGE');
    const none = await fetch(url, { method: 'POST', body: new FormData() });
    expect(none.status).toBe(400);
    const unknown = await upload(`${baseUrl}/api/projects/${projectId}/comments/nope/attachments`, await png());
    expect(unknown.status).toBe(404);
  });

  it('the 11th image is 409 ATTACHMENT_LIMIT', async () => {
    const c = await postComment();
    const url = `${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`;
    const buf = await png();
    for (let i = 0; i < 10; i++) expect((await upload(url, buf)).status).toBe(201);
    const over = await upload(url, buf);
    expect(over.status).toBe(409);
    expect((await over.json()).code).toBe('ATTACHMENT_LIMIT');
  });
});

describe('share routes', () => {
  it('a comment link uploads to its own fresh comment; read-only is 403; unknown token is the identical 404', async () => {
    const token = await createShare('comment');
    const c = await sharedComment(token);
    const res = await upload(`${baseUrl}/api/shared/${token}/comments/${c.id}/attachments`, await png());
    expect(res.status).toBe(201);
    const att = await res.json();
    expect('project_id' in att).toBe(false);

    const file = await fetch(`${baseUrl}/api/shared/${token}/files/${att.file_path}`);
    expect(file.status).toBe(200);

    const list = await (await fetch(`${baseUrl}/api/shared/${token}/comments?entity_type=event&entity_id=${eventId}`)).json();
    expect(list.find((r: { id: string }) => r.id === c.id).attachments).toHaveLength(1);

    const bad = await upload(`${baseUrl}/api/shared/nope-token/comments/${c.id}/attachments`, await png());
    expect(bad.status).toBe(404);
    expect((await bad.json()).code).toBe('SHARE_NOT_FOUND');

    const ro = await createShare('read');
    const denied = await upload(`${baseUrl}/api/shared/${ro}/comments/${c.id}/attachments`, await png());
    expect(denied.status).toBe(403);
  });

  it('an attachment of an internal_only comment is a 404 on the share files route', async () => {
    const token = await createShare('comment');
    const c = await postComment({ internal_only: true });
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png())).json();
    const viaShare = await fetch(`${baseUrl}/api/shared/${token}/files/${att.file_path}`);
    expect(viaShare.status).toBe(404);
    expect(await viaShare.json()).toEqual({error:'This share link is not valid.',code:'SHARE_NOT_FOUND'});
    // the link cannot attach to it either
    expect((await upload(`${baseUrl}/api/shared/${token}/comments/${c.id}/attachments`, await png())).status).toBe(404);
    // internal still serves it
    expect((await fetch(`${baseUrl}/api/projects/${projectId}/files/${att.file_path}`)).status).toBe(200);

    // flipping it public makes the file visible
    await fetch(`${baseUrl}/api/projects/${projectId}/comments/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_only: false }),
    });
    expect((await fetch(`${baseUrl}/api/shared/${token}/files/${att.file_path}`)).status).toBe(200);
  });

  it('via_share_only hides an internally posted comment image', async () => {
    const token = await createShare('comment');
    await patchShare({ share_comments: 'via_share_only' });
    const c = await postComment();
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png())).json();
    expect((await fetch(`${baseUrl}/api/shared/${token}/files/${att.file_path}`)).status).toBe(404);
    await patchShare({ share_comments: 'all' });
  });

  it('a stale comment (older than 15 minutes) cannot receive images through the link', async () => {
    const token = await createShare('comment');
    const c = await sharedComment(token);
    getDb().prepare('UPDATE comments SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60 * 1000).toISOString(), c.id);
    const res = await upload(`${baseUrl}/api/shared/${token}/comments/${c.id}/attachments`, await png());
    expect(res.status).toBe(404);
  });

  it('is rate limited per token (60 uploads per 10 minutes) with a 429 RATE_LIMITED', async () => {
    const token = await createShare('comment');
    const c = await sharedComment(token);
    const url = `${baseUrl}/api/shared/${token}/comments/${c.id}/attachments`;
    const buf = await png();
    let last: Response | null = null;
    for (let i = 0; i < 62; i++) {
      last = await upload(url, buf);
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect((await last!.json()).code).toBe('RATE_LIMITED');
  });
});

describe('share files path normalisation (review fix)', () => {
  function rawGet(rawPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const port = Number(new URL(baseUrl).port);
      const req = http.request({ hostname: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('odd spellings of a hidden comment image are all refused, the visible one still works', async () => {
    const token = await createShare('comment');
    const hidden = await postComment({ internal_only: true });
    const hAtt = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${hidden.id}/attachments`, await png())).json();
    const visible = await postComment();
    const vAtt = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${visible.id}/attachments`, await png())).json();
    const base = `/api/shared/${token}/files/`;
    const hp: string = hAtt.file_path;
    const variants = (p: string) => [
      p.replace('/comments/', '//comments/'),
      p.replace('/comments/', '/Comments/'),
      p.replace('/comments/', '/COMMENTS/'),
      p.replace('/comments/', '/./comments/'),
      p.replace('/comments/', '/%2Fcomments/'),
      p.replace('/comments/', '%2Fcomments/'),
    ];
    for (const v of variants(hp)) {
      const status = await rawGet(base + v);
      expect([400, 404], v).toContain(status);
    }
    expect(await rawGet(base + hp)).toBe(404);
    expect(await rawGet(base + vAtt.file_path)).toBe(200);
    // case variant of a visible one is refused too, never served from the raw path
    expect(await rawGet(base + vAtt.file_path.replace('/comments/', '//comments/'))).toBe(404);
  });
});

describe('reply attachments follow their root', () => {
  it('a private reply under a public root has the same shared file 404 as a missing image, while staff retains access', async () => {
    const token = await createShare('comment');
    await patchShare({ share_comments: 'via_share_only' });
    const root = await sharedComment(token);
    const reply = await postComment({ parent_id: root.id });
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${reply.id}/attachments`, await png())).json();
    const sharedFile = `${baseUrl}/api/shared/${token}/files/${att.file_path}`;
    // Staff replies to a visible shared root stay visible even under via_share_only.
    expect((await fetch(sharedFile)).status).toBe(200);
    CommentDAL.setCommentInternalOnly(projectId, reply.id, true);
    const visibleComments = await (await fetch(`${baseUrl}/api/shared/${token}/comments`)).json();
    expect(visibleComments.some((comment: { id: string }) => comment.id === root.id)).toBe(true);
    expect(visibleComments.some((comment: { id: string }) => comment.id === reply.id)).toBe(false);
    const hiddenFile = await fetch(sharedFile);
    const missingFile = await fetch(`${baseUrl}/api/shared/${token}/files/${projectId}/comments/${reply.id}/missing.png`);
    expect(hiddenFile.status).toBe(404);
    expect(missingFile.status).toBe(404);
    expect(await hiddenFile.json()).toEqual(await missingFile.json());
    expect((await fetch(`${baseUrl}/api/projects/${projectId}/files/${att.file_path}`)).status).toBe(200);
    // Public target + private root must still deny the image, independently of the child's flag.
    CommentDAL.setCommentInternalOnly(projectId, reply.id, false);
    CommentDAL.setCommentInternalOnly(projectId, root.id, true);
    expect((await fetch(sharedFile)).status).toBe(404);
    CommentDAL.setCommentInternalOnly(projectId, root.id, false);
    expect((await fetch(sharedFile)).status).toBe(200);
    await patchShare({ share_comments: 'all' });
  });

  it('a reply image is hidden with an internal_only root and visible with a public one', async () => {
    const token = await createShare('comment');
    for (const internalOnly of [true, false]) {
      const root = await postComment({ internal_only: internalOnly });
      const reply = await postComment({ parent_id: root.id });
      const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${reply.id}/attachments`, await png())).json();
      const status = (await fetch(`${baseUrl}/api/shared/${token}/files/${att.file_path}`)).status;
      expect(status).toBe(internalOnly ? 404 : 200);
    }
  });
});

describe('cleanup', () => {
  it('deleting a root removes its replies image files and the empty directories', async () => {
    const root = await postComment();
    const reply = await postComment({ parent_id: root.id });
    const a1 = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${root.id}/attachments`, await png())).json();
    const a2 = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${reply.id}/attachments`, await png())).json();
    expect((await fetch(`${baseUrl}/api/projects/${projectId}/comments/${root.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(fs.existsSync(path.join(tmpFilesDir, a1.file_path))).toBe(false);
    expect(fs.existsSync(path.join(tmpFilesDir, a2.file_path))).toBe(false);
    expect(fs.existsSync(path.dirname(path.join(tmpFilesDir, a2.file_path)))).toBe(false);
  });


  it('deleting a comment removes its image files', async () => {
    const c = await postComment();
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png())).json();
    expect(fs.existsSync(path.join(tmpFilesDir, att.file_path))).toBe(true);
    expect((await fetch(`${baseUrl}/api/projects/${projectId}/comments/${c.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(fs.existsSync(path.join(tmpFilesDir, att.file_path))).toBe(false);
  });
});

describe('backup and restore', () => {
  it('embeds the image files, remaps ids and rewrites paths', async () => {
    const c = await postComment({ body: 'backup me' });
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png(12, 7))).json();

    const backup = await buildBackup(projectId);
    expect(backup.comment_attachments.some((a) => a.id === att.id)).toBe(true);
    expect(backup.files.some((f) => f.path === att.file_path)).toBe(true);
    expect(backup.files_missing).not.toContain(att.file_path);

    const preview = previewRestore(backup);
    expect(preview.counts.comment_attachments).toBe(backup.comment_attachments.length);
    const { project } = await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored-key', client_id: clientId });

    const restored = CommentDAL.listComments(project.id).find((r) => r.body === 'backup me')!;
    const rows = listAttachmentsForComment(project.id, restored.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(att.id);
    expect(rows[0].file_path.startsWith(`${project.id}/`)).toBe(true);
    expect(rows[0]).toMatchObject({ width: 12, height: 7, mime: 'image/png' });
    const opened = await getFileStore().openForProject(project.id, rows[0].file_path);
    expect((await sharp(opened.buffer).metadata()).width).toBe(12);
  });

  it('a missing file is reported in files_missing, not thrown', async () => {
    const c = await postComment();
    const att = await (await upload(`${baseUrl}/api/projects/${projectId}/comments/${c.id}/attachments`, await png())).json();
    fs.rmSync(path.join(tmpFilesDir, att.file_path), { force: true });
    const backup = await buildBackup(projectId);
    expect(backup.files_missing).toContain(att.file_path);
  });
});

describe('csv', () => {
  it('exports comment_attachments', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/csv/comment_attachments`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('file_path');
  });
});
