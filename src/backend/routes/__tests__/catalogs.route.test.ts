/**
 * Route coverage for T-4-11B: `POST /catalogs/:id/live` needs a boolean, market/language must be
 * strings or null, and `POST /events` applies the project default source (D-62).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as CatalogDAL from '../../dal/catalog.dal';
import * as SourceDAL from '../../dal/source.dal';
import * as EventDAL from '../../dal/event.dal';

let server: http.Server;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

const post = (url: string, body: unknown) =>
  fetch(`${baseUrl}/api/projects/${projectId}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('catalog routes (T-4-11B)', () => {
  it('/live requires a boolean live', async () => {
    const c = CatalogDAL.createCatalog(projectId, { name: 'products_gb' });
    for (const body of [{}, { live: 'yes' }, { live: 1 }, { live: null }]) {
      const res = await post(`/catalogs/${c.id}/live`, body);
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('live');
    }
    expect((await post(`/catalogs/${c.id}/live`, { live: true })).status).toBe(200);
    expect(CatalogDAL.getCatalogOrThrow(projectId, c.id).live_at).toBeTruthy();
    expect((await post(`/catalogs/${c.id}/live`, { live: false })).status).toBe(200);
    expect(CatalogDAL.getCatalogOrThrow(projectId, c.id).live_at).toBeNull();
  });

  it('market and language must be strings or null', async () => {
    const res = await post('/catalogs', { name: 'x', market: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('market');
    const ok = await post('/catalogs', { name: 'y', market: 'GB', language: null });
    expect(ok.status).toBe(201);
    const id = (await ok.json()).id as string;
    const patch = await fetch(`${baseUrl}/api/projects/${projectId}/catalogs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: ['en'] }) });
    expect(patch.status).toBe(400);
  });

  it('POST /events applies the default source to a custom event only', async () => {
    const s = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    ProjectDAL.updateProject(projectId, { default_source_id: s.id });
    const custom = await (await post('/events', { name: 'route_custom' })).json();
    expect(EventDAL.listEventSourceIds(projectId, custom.id)).toEqual([s.id]);
    const sdk = await (await post('/events', { name: 'route_sdk', class: 'sdk' })).json();
    expect(EventDAL.listEventSourceIds(projectId, sdk.id)).toEqual([]);
  });
});
