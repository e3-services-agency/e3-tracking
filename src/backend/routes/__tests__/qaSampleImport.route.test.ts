import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject } from '../../dal/project.dal';
import { listQaRuns } from '../../dal/qa-run.dal';
import * as ObservationDAL from '../../dal/observation.dal';
import { exportDataManagerEvents } from '../../services/bloomreachExport.service';
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

  it('refuses a zip bomb (declared size lies) and an honest oversize with 400 ARCHIVE_TOO_LARGE', async () => {
    const big = 'x'.repeat(26 * 1024 * 1024);
    const honest = new JSZip();
    honest.file('manifest.json', JSON.stringify({ pad: big }));
    honest.file('customer-events-export.json', '[]');
    honest.file('data-manager-events.json', '{}');
    const r1 = await post('preview', await honest.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    expect(r1.status).toBe(400);
    expect(r1.data.code).toBe('ARCHIVE_TOO_LARGE');

    // bomb: patch the declared uncompressed size in the central directory and local header to 100
    const z = new JSZip();
    z.file('manifest.json', JSON.stringify({ pad: 'y'.repeat(60 * 1024 * 1024) }));
    z.file('customer-events-export.json', '[]');
    z.file('data-manager-events.json', '{}');
    const buf = Buffer.from(await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buf.writeUInt32LE(100, cd + 24);
    const lh = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    buf.writeUInt32LE(100, lh + 22);
    const r2 = await post('preview', buf);
    expect(r2.status).toBe(400);
    expect(r2.data.code).toBe('ARCHIVE_TOO_LARGE');
  });

  it('apply is all-or-nothing: a failing observation insert leaves no Data Manager change and no run', async () => {
    const c = createClient({ key: 'atomic', name: 'Atomic' });
    const other = createProject({ client_id: c.id, key: 'atomic', name: 'Atomic' }).id;
    const docs = buildQaSampleDocs();
    const zip = await zipOf(docs);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(zip)]), 'sample.zip');
    const prevRes = await fetch(`${base}/api/projects/${other}/import/qa-sample/preview`, { method: 'POST', body: form });
    const prev = await prevRes.json();
    const ids = prev.data_manager.items.map((i: { id: string }) => i.id);
    expect(ids.length).toBeGreaterThan(0);
    const spy = vi.spyOn(ObservationDAL, 'createObservation').mockImplementation(() => {
      throw new Error('boom');
    });
    const form2 = new FormData();
    form2.append('file', new Blob([new Uint8Array(zip)]), 'sample.zip');
    form2.append('payload_hash', prev.payload_hash);
    form2.append('selected_item_ids', JSON.stringify(ids));
    const res = await fetch(`${base}/api/projects/${other}/import/qa-sample/apply`, { method: 'POST', body: form2 });
    spy.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(listQaRuns(other)).toHaveLength(0);
    expect((getDb().prepare('SELECT COUNT(*) n FROM events WHERE project_id=?').get(other) as { n: number }).n).toBe(0);
    expect((getDb().prepare('SELECT COUNT(*) n FROM change_log WHERE project_id=?').get(other) as { n: number }).n).toBe(0);
  });

  it('after a wrapper import the exported data-manager-events.json equals the bare payload', () => {
    const bare = buildQaSampleDocs().data_manager_events.events;
    expect(exportDataManagerEvents(project)).toEqual(bare);
  });
});
