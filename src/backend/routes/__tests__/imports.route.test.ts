/**
 * Route-level coverage (T-1-08): `/api/projects/:projectId/import/data-mapping/{preview,apply}`,
 * same pair for `expiration-settings`, and the two exports under
 * `/api/projects/:projectId/export/*.json`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const expirationFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/expiration-settings.json'), 'utf-8')
);

let server: http.Server;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, body: await res.json() };
}

describe('data-mapping import/export', () => {
  it('preview returns items, warnings and a payload_hash', async () => {
    const { res, body } = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/preview`, dataMappingFixture);
    expect(res.status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(typeof body.payload_hash).toBe('string');
  });

  it('apply with a stale hash returns 409 PAYLOAD_CHANGED', async () => {
    const { res, body } = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/apply`, {
      payload: dataMappingFixture,
      payload_hash: 'not-the-real-hash',
      selected_item_ids: [],
    });
    expect(res.status).toBe(409);
    expect(body.code).toBe('PAYLOAD_CHANGED');
  });

  it('apply with the correct hash and all items applies and export diffs clean', async () => {
    const preview = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/preview`, dataMappingFixture);
    const applyRes = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/apply`, {
      payload: dataMappingFixture,
      payload_hash: preview.body.payload_hash,
      selected_item_ids: preview.body.items.map((i: { id: string }) => i.id),
    });
    expect(applyRes.res.status).toBe(200);
    expect(applyRes.body.applied.length).toBe(preview.body.items.length);

    const exportRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/data-mapping.json`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    delete exported._id;
    const expected = JSON.parse(JSON.stringify(dataMappingFixture));
    delete expected._id;
    expect(exported).toEqual(expected);
  });
});

describe('expiration-settings import/export', () => {
  it('preview then apply creates events and the export diffs clean', async () => {
    const preview = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/expiration-settings/preview`,
      expirationFixture
    );
    expect(preview.res.status).toBe(200);

    const applyRes = await postJson(`${baseUrl}/api/projects/${projectId}/import/expiration-settings/apply`, {
      payload: expirationFixture,
      payload_hash: preview.body.payload_hash,
      selected_item_ids: preview.body.items.map((i: { id: string }) => i.id),
    });
    expect(applyRes.res.status).toBe(200);

    const exportRes = await fetch(`${baseUrl}/api/projects/${projectId}/export/expiration-settings.json`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(exported.events.length).toBe(expirationFixture.events.length);
    expect(exported.other).toEqual(expirationFixture.other);
  });
});
