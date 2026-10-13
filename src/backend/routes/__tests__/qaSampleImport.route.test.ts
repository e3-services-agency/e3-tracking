import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject } from '../../dal/project.dal';
import { listQaRuns } from '../../dal/qa-run.dal';
import { buildQaSampleDocs } from '../../../domain/import/__fixtures__/qa-sample/build';

let server: http.Server, base: string, project: string;

async function zipOf(docs = buildQaSampleDocs()): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('qa-sample/manifest.json', JSON.stringify(docs.manifest));
  zip.file('qa-sample/customer-events-export.json', JSON.stringify(docs.customer_events));
  zip.file('qa-sample/data-manager-events.json', JSON.stringify(docs.data_manager_events));
  zip.file('qa-sample/profile.json', '{}');
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function post(path: string, zip: Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(zip)]), 'sample.zip');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${base}/api/projects/${project}/import/qa-sample/${path}`, { method: 'POST', body: form });
  return { status: res.status, data: await res.json() };
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const c = createClient({ key: 'qs', name: 'QS' });
  project = createProject({ client_id: c.id, key: 'qs', name: 'QS' }).id;
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('QA sample archive import', () => {
  it('previews, rejects a changed archive, then applies into one extension run', async () => {
    const zip = await zipOf();
    const prev = await post('preview', zip);
    expect(prev.status).toBe(200);
    expect(prev.data.customers).toBe(3);
    expect(prev.data.events).toBe(20);
    expect(prev.data.event_types).toBe(4);
    expect(prev.data.data_manager.events).toBe(4);
    expect(prev.data.facts.matched).toBe(1234);
    expect(prev.data.run_name).toBe('QA sample 2026-01-02T03:04:05.000Z');
    expect(listQaRuns(project)).toHaveLength(0); // preview writes nothing

    const changed = buildQaSampleDocs();
    (changed.customer_events[0].events[0] as { timestamp: number }).timestamp += 1;
    const stale = await post('apply', await zipOf(changed), { payload_hash: prev.data.payload_hash, selected_item_ids: '[]' });
    expect(stale.status).toBe(409);
    expect(stale.data.code).toBe('PAYLOAD_CHANGED');
    expect(listQaRuns(project)).toHaveLength(0);

    const ids = prev.data.data_manager.items.map((i: { id: string }) => i.id);
    const applied = await post('apply', zip, { payload_hash: prev.data.payload_hash, selected_item_ids: JSON.stringify(ids) });
    expect(applied.status).toBe(200);
    expect(applied.data.inserted).toBe(20);
    const runs = listQaRuns(project);
    expect(runs).toHaveLength(1);
    expect(runs[0].source).toBe('extension');
    expect((runs[0].manifest_json as { tool: string }).tool).toBe('QA Sampler');
    expect(runs[0].notes).toBe('QA sample 2026-01-02T03:04:05.000Z');

    // masked values stay verbatim and raise no value findings
    const masked = getDb().prepare("SELECT properties_json FROM observations WHERE event_type='page_visit' LIMIT 1").get() as { properties_json: string };
    expect(JSON.parse(masked.properties_json).latitude).toBe('[redacted:geo]');
    const bad = getDb().prepare("SELECT COUNT(*) n FROM findings WHERE project_id=? AND kind IN ('type_mismatch','format_violation','enum_violation')").get(project) as { n: number };
    expect(bad.n).toBe(0);

    // change_log attribution: Data Manager writes carry the import batch source
    const log = getDb().prepare("SELECT DISTINCT source, actor FROM change_log WHERE project_id=?").all(project) as { source: string; actor: string }[];
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((r) => r.source === 'import:data-manager-events')).toBe(true);
    expect(log.every((r) => typeof r.actor === 'string' && r.actor.length > 0)).toBe(true);
  });

  it('rejects a non-zip and an archive missing a file', async () => {
    expect((await post('preview', Buffer.from('nope'))).status).toBe(400);
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const res = await post('preview', await zip.generateAsync({ type: 'nodebuffer' }));
    expect(res.status).toBe(400);
  });
});
