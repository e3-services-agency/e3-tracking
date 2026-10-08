import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { getFileStore } from '../../files/FileStore';
import { insertAttachment } from '../../dal/comment-attachment.dal';
import { beforeAll, afterAll, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject, createOrRotateShare } from '../../dal/project.dal';
import { createEvent } from '../../dal/event.dal';
import { upsertFinding } from '../../dal/finding.dal';
import { createComment } from '../../dal/comment.dal';
import { runComparison } from '../../services/comparison.service';
let filesDir: string, cookie = '';
let server: http.Server, base: string, project: string, token: string, other: string, report: string, finding: string;
beforeAll(async () => {
    process.env.E3_DB_PATH = ':memory:';
    filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-report-routes-'));
    process.env.E3_FILES_PATH = filesDir;
    closeDb();
    const c = createClient({ key: 'reports', name: 'Reports' });
    project = createProject({ client_id: c.id, key: 'reports', name: 'Reports' }).id;
    other = createProject({ client_id: c.id, key: 'other', name: 'Other' }).id;
    token = createOrRotateShare(project, 'comment').share_token!;
    createEvent(project, { name: 'checkout' });
    report = runComparison(project).report_id!;
    finding = (getDb().prepare('SELECT finding_id FROM qa_report_findings WHERE report_id=? LIMIT 1').get(report) as {
        finding_id: string;
    }).finding_id;
    server = http.createServer(createApp());
    await new Promise<void>(r => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); closeDb(); delete process.env.E3_DB_PATH; delete process.env.E3_FILES_PATH; fs.rmSync(filesDir, { recursive: true, force: true }); });
async function call(path: string, method = 'GET', body?: unknown) { const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); if (res.headers.get('set-cookie'))
    cookie = res.headers.get('set-cookie')!.split(';')[0]; return { status: res.status, data: await res.json() }; }
it('reads scoped immutable reports, supports distinct report/finding roots and replies, refuses foreign reports', async () => {
    expect((await call(`/api/projects/${project}/qa-reports`)).data).toHaveLength(1);
    expect((await call(`/api/shared/${token}/qa-reports/${report}`)).status).toBe(200);
    expect((await call(`/api/projects/${other}/qa-reports/${report}`)).status).toBe(404);
    const foreign = runComparison(other).report_id!;
    expect((await call(`/api/shared/${token}/qa-reports/${foreign}`)).data.code).toBe('SHARE_NOT_FOUND');
    for (const [type, id] of [['qa_report', report], ['finding', finding]]) {
        const root = await call(`/api/shared/${token}/comments`, 'POST', { entity_type: type, entity_id: id, author_name: 'Guest', body: 'Public root' });
        expect(root.status).toBe(201);
        expect((await call(`/api/shared/${token}/comments`, 'POST', { parent_id: root.data.id, body: 'Reply', author_name: 'Guest' })).data.entity_id).toBe(id);
    }
    expect((await call(`/api/shared/${token}/findings/${finding}/history`)).data.appearances[0].report_id).toBe(report);
});
it('central shared predicate hides nonpublic findings from every discussion operation while retaining internal records', async () => {
    const event = createEvent(project, { name: 'hidden' });
    const hidden = upsertFinding(project, { comparison: 'catalogs', kind: 'unmapped_catalog', severity: 'error', fingerprint: 'hidden', event_id: event.id });
    const root = createComment(project, { entity_type: 'finding', entity_id: hidden.id, author_name: 'Staff', body: 'Hidden thread', via_share: true });
    getDb().prepare('UPDATE events SET deleted_at=? WHERE id=?').run('deleted', event.id);
    const prefix = `/api/shared/${token}`;
    for (const [path, method, body] of [[`/comments?entity_type=finding&entity_id=${hidden.id}`, 'GET', undefined], [`/findings/${hidden.id}/history`, 'GET', undefined], ['/comments', 'POST', { entity_type: 'finding', entity_id: hidden.id, author_name: 'Guest', body: 'x' }], ['/comments', 'POST', { parent_id: root.id, body: 'x', author_name: 'Guest' }], [`/comments/${root.id}/status`, 'PATCH', { status: 'done' }], [`/comments/${root.id}/reactions`, 'POST', { kind: 'seen' }]] as const) {
        const res = await call(prefix + path, method, body);
        expect(res.status).toBe(404);
        expect(res.data.code).toBe('SHARE_NOT_FOUND');
    }
    expect((await call(prefix + '/comments')).data.some((c: any) => c.id === root.id)).toBe(false);
    expect((await call(`/api/projects/${project}/comments`)).data.some((c: any) => c.id === root.id)).toBe(true);
});
it('read-only links refuse report/finding submissions', async () => {
    getDb().prepare("UPDATE projects SET share_access='read' WHERE id=?").run(project);
    for (const [type, id] of [['qa_report', report], ['finding', finding]])
        expect((await call(`/api/shared/${token}/comments`, 'POST', { entity_type: type, entity_id: id, author_name: 'Guest', body: 'x' })).status).toBe(403);
});
it('validates actual report/finding image uploads and hides private/invalid targets for upload and download', async () => {
    getDb().prepare("UPDATE projects SET share_access='comment' WHERE id=?").run(project);
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 51, g: 102, b: 153 } } }).png().toBuffer();
    const upload = async (id: string) => { const form = new FormData(); form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'evidence.png'); return fetch(`${base}/api/shared/${token}/comments/${id}/attachments`, { method: 'POST', headers: { Cookie: cookie }, body: form }); };
    for (const [type, id] of [['qa_report', report], ['finding', finding]]) {
        const posted = await call(`/api/shared/${token}/comments`, 'POST', { entity_type: type, entity_id: id, author_name: 'Guest', body: 'Image root' });
        expect(posted.status).toBe(201);
        const image = await upload(posted.data.id);
        expect(image.status).toBe(201);
        const attachment = await image.json();
        expect((await fetch(`${base}/api/shared/${token}/files/${attachment.file_path}`)).status).toBe(200);
        getDb().prepare('UPDATE comments SET internal_only=1 WHERE id=?').run(posted.data.id);
        for (const response of [await upload(posted.data.id), await fetch(`${base}/api/shared/${token}/files/${attachment.file_path}`)]) {
            expect(response.status).toBe(404);
            expect((await response.json()).code).toBe('SHARE_NOT_FOUND');
        }
    }
    const hiddenEvent = createEvent(project, { name: 'private_image_target' });
    const hiddenFinding = upsertFinding(project, { comparison: 'catalogs', kind: 'unmapped_catalog', severity: 'error', fingerprint: 'private-image-target', event_id: hiddenEvent.id });
    const hiddenRoot = createComment(project, { entity_type: 'finding', entity_id: hiddenFinding.id, author_name: 'Staff', body: 'Hidden image', via_share: true });
    const hiddenFile = await getFileStore().put(project, `comments/${hiddenRoot.id}`, 'hidden.png', png, 'image/png');
    insertAttachment(project, hiddenRoot.id, { file_path: hiddenFile.path, mime: 'image/png', width: 2, height: 2, size_bytes: png.length });
    getDb().prepare('UPDATE events SET deleted_at=? WHERE id=?').run('deleted', hiddenEvent.id);
    for (const response of [await upload(hiddenRoot.id), await fetch(`${base}/api/shared/${token}/files/${hiddenFile.path}`)]) {
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe('SHARE_NOT_FOUND');
    }
    const deletedReport = runComparison(project).report_id!;
    const deletedRoot = await call(`/api/shared/${token}/comments`, 'POST', { entity_type: 'qa_report', entity_id: deletedReport, author_name: 'Guest', body: 'Deleted report image' });
    const deletedImage = await upload(deletedRoot.data.id);
    expect(deletedImage.status).toBe(201);
    const deletedAttachment = await deletedImage.json();
    getDb().prepare('DELETE FROM qa_reports WHERE id=?').run(deletedReport);
    for (const response of [await upload(deletedRoot.data.id), await fetch(`${base}/api/shared/${token}/files/${deletedAttachment.file_path}`)]) {
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe('SHARE_NOT_FOUND');
    }
    const foreign = runComparison(other).report_id!;
    const foreignComment = createComment(other, { entity_type: 'qa_report', entity_id: foreign, author_name: 'Staff', body: 'Foreign image', via_share: true });
    const file = await getFileStore().put(other, `comments/${foreignComment.id}`, 'foreign.png', png, 'image/png');
    insertAttachment(other, foreignComment.id, { file_path: file.path, mime: 'image/png', width: 2, height: 2, size_bytes: png.length });
    for (const response of [await upload('missing'), await upload(foreignComment.id), await fetch(`${base}/api/shared/${token}/files/${file.path}`)]) {
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe('SHARE_NOT_FOUND');
    }
});
