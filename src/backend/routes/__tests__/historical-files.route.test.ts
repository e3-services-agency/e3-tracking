import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject, createOrRotateShare } from '../../dal/project.dal';
import { createEvent, attachPropertyToEvent } from '../../dal/event.dal';
import { createProperty } from '../../dal/property.dal';
import { createComment } from '../../dal/comment.dal';
import type { HistoricalManifest } from '../../../domain/historicalFiles';
let server: http.Server, base: string, project: string, foreign: string, event: string, property: string, token: string, directory: string;
beforeAll(async () => {
  vi.stubEnv('E3_DB_PATH', ':memory:'); vi.stubEnv('AUTH_MODE', 'local');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-historical-http-')); vi.stubEnv('E3_FILES_PATH', directory); closeDb();
  const client = createClient({ key: 'native-http', name: 'Native HTTP' });
  project = createProject({ client_id: client.id, key: 'native-http', name: 'Native HTTP' }).id; foreign = createProject({ client_id: client.id, key: 'foreign-http', name: 'Foreign' }).id;
  event = createEvent(project, { name: 'purchase', status: 'planned' }).id; property = createProperty(project, { name: 'value', scope: 'event', data_type: 'number' }).id;
  attachPropertyToEvent(project, event, { property_id: property }); token = createOrRotateShare(project, 'comment').share_token!;
  server = http.createServer(createApp({ serveStatic: false })); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise<void>(r => server.close(() => r())); closeDb(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
async function json(url: string, body: unknown, origin: string | null = base) { return fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }); }
it('staff multipart upload, preview, confirmed apply and human report readback use the same project-scoped native path', async () => {
  const endpoint = '/api/projects/' + project + '/historical-files';
  const form = () => { const data = new FormData(); data.append('file', new Blob(['value,source_only\n1,private@example.com\n']), 'reviewed-purchases.csv'); data.append('source_ref', 'https://drive.google.com/file/d/native-reviewed/view'); return data; };
  expect((await fetch(base + endpoint + '/sources', { method: 'POST', body: form() })).status).toBe(403);
  const uploaded = await fetch(base + endpoint + '/sources', { method: 'POST', headers: { Origin: base }, body: form() }); expect(uploaded.status).toBe(201); const source = await uploaded.json();
  expect(JSON.stringify(source)).not.toContain('private@example.com'); expect(JSON.stringify(source)).not.toContain('file_path');
  const definition = getDb().prepare('SELECT definition_id FROM event_properties WHERE event_id=? AND property_id=?').get(event, property) as { definition_id: string };
  const manifest: HistoricalManifest = { version: 1, parse_policy: 'csv-lexical-v1', files: [{ source_id: source.id, event_id: event, mappings: [{ column: 'value', property_id: property, definition_id: definition.definition_id }], source_only_columns: ['source_only'], trailing_empty_columns: [] }], joins: [] };
  expect((await json(endpoint + '/preview', { manifest }, 'https://evil.example')).status).toBe(403);
  expect((await json('/api/projects/' + foreign + '/historical-files/preview', { manifest })).status).toBe(404);
  const preview = await (await json(endpoint + '/preview', { manifest })).json(); expect(preview.confirmation_required).toBe(true);
  expect((await json(endpoint + '/apply', { manifest, payload_hash: preview.payload_hash })).status).toBe(400);
  const applied = await json(endpoint + '/apply', { manifest, payload_hash: preview.payload_hash, confirmed: true }); expect(applied.status).toBe(200); const report = await applied.json();
  expect(report.report_url).toBe(endpoint + '/reports/' + report.report_id + '/view'); expect(report.detail_url).toBe(report.report_url);
  const view = await fetch(base + report.report_url); expect(view.status).toBe(200); const html = await view.text(); expect(html).toContain('reviewed-purchases.csv'); expect(html).toContain('https://drive.google.com/file/d/native-reviewed/view'); expect(html).not.toContain('private@example.com'); expect(html).toContain('href="' + report.tracking_url + '"'); expect(html).toContain('Back to Tracking QA reports');
  expect((await fetch(base + '/api/projects/' + foreign + '/historical-files/reports/' + report.report_id)).status).toBe(404);
  createComment(project, { entity_type: 'qa_report', entity_id: report.report_id, body: 'PRIVATE_REPORT_DISCUSSION', author_name: 'Native staff' });
  const pathRow = getDb().prepare('SELECT file_path FROM historical_file_sources WHERE id=?').get(source.id) as { file_path: string };
  for (const raw of [pathRow.file_path, pathRow.file_path.replace('historical-sources', 'HISTORICAL-SOURCES'), pathRow.file_path.replace('historical-sources', '%68istorical-sources'), pathRow.file_path.replace('historical-sources/', 'historical-sources%2F')]) {
    const leak = await fetch(base + '/api/shared/' + token + '/files/' + raw); expect(leak.status, raw).toBe(404); expect(await leak.text()).not.toContain('private@example.com');
  }
  expect((await fetch(base + '/api/shared/' + token + '/qa-reports/' + report.report_id)).status).toBe(404);
  expect(JSON.stringify(await (await fetch(base + '/api/shared/' + token + '/qa-reports')).json())).not.toContain(report.report_id);
  expect(JSON.stringify(await (await fetch(base + '/api/shared/' + token + '/comments')).json())).not.toContain('PRIVATE_REPORT_DISCUSSION');
  expect(getDb().prepare('SELECT COUNT(*) n FROM observations').get()).toEqual({ n: 0 });
});
