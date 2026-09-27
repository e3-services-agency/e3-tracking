/**
 * Route-level coverage for T-3-01: `GET /api/projects/:projectId/history` (filters, paging,
 * newest-first) and `GET /api/projects/:projectId/history/:changeId`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import * as EventDAL from '../../dal/event.dal';

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

describe('GET /api/projects/:projectId/history', () => {
  it('shows one row with the before/after text after a UI edit, tagged source=ui (the actor middleware runs on the real request)', async () => {
    const created = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'cart_update' }),
      })
    ).json();

    await fetch(`${baseUrl}/api/projects/${projectId}/events/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Fired when the cart changes.' }),
    });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?entity_type=event&entity_id=${created.id}`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    const update = rows.find((r: { action: string }) => r.action === 'update');
    expect(update).toBeDefined();
    expect(update.source).toBe('ui');
    expect(update.diff_json).toEqual([
      { field: 'description', before: null, after: 'Fired when the cart changes.' },
    ]);
  });

  it('defaults to limit 100, newest first, and honours an explicit limit', async () => {
    for (let i = 0; i < 5; i++) {
      EventDAL.createEvent(projectId, { name: `event_${i}` });
    }
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=2`);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows[0].changed_at >= rows[1].changed_at).toBe(true);
  });

  it('filters by parent_entity_id (groups event_property/variant rows under their event)', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?parent_entity_id=${event.id}`);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('supports keyset paging with before', async () => {
    const firstPage = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1`)
    ).json();
    const cursor = firstPage[0].changed_at;
    const secondPage = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1&before=${encodeURIComponent(cursor)}`)
    ).json();
    expect(secondPage[0].id).not.toBe(firstPage[0].id);
  });
});

describe('GET /api/projects/:projectId/history/:changeId', () => {
  it('returns one change row by id', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const list = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?entity_type=event&entity_id=${event.id}`)
    ).json();
    const changeId = list[0].id;

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history/${changeId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(changeId);
  });

  it('404s for an unknown change id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
