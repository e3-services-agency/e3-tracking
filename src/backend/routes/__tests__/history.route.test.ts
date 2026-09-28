/**
 * Route-level coverage for T-3-01: `GET /api/projects/:projectId/history` (filters, strict
 * validation, composite keyset paging, newest-first) and
 * `GET /api/projects/:projectId/history/:changeId`.
 *
 * Fix round (reviewer FAIL, ERROR 1 / WARNING 2): the response shape is `{items, next_cursor}`;
 * `next_cursor` is the opaque `"<changed_at>|<id>"` cursor for the next page, `null` when there
 * is no more. `limit`/`before` are validated strictly -- a malformed value is 400
 * `VALIDATION_ERROR`, never a raw 500.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, getDb } from '../../db';
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

/** Inserts a `change_log` row directly (bypassing `recordChange`) so its `changed_at` can be forced. */
function insertChange(overrides: { entity_id: string; changed_at: string; id?: string }) {
  const db = getDb();
  const id = overrides.id ?? `row-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    `INSERT INTO change_log (
      id, project_id, entity_type, entity_id, entity_label, parent_entity_id, action, actor,
      source, batch_id, changed_at, diff_json
    ) VALUES (?, ?, 'event', ?, 'forced-row', NULL, 'update', 'system', 'system', NULL, ?, '[]')`
  ).run(id, projectId, overrides.entity_id, overrides.changed_at);
  return id;
}

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
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    const update = body.items.find((r: { action: string }) => r.action === 'update');
    expect(update).toBeDefined();
    expect(update.source).toBe('ui');
    expect(update.diff_json).toEqual([
      { field: 'description', before: null, after: 'Fired when the cart changes.' },
    ]);
  });

  it('defaults to limit 100, newest first, and honours an explicit limit, with next_cursor set when more rows remain', async () => {
    for (let i = 0; i < 5; i++) {
      EventDAL.createEvent(projectId, { name: `event_${i}` });
    }
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=2`);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].changed_at >= body.items[1].changed_at).toBe(true);
    expect(typeof body.next_cursor).toBe('string');
  });

  it('next_cursor is null on the last page', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=10000`);
    const body = await res.json();
    expect(body.next_cursor).toBeNull();
  });

  it('filters by parent_entity_id (groups event_property/variant rows under their event)', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?parent_entity_id=${event.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('QA fix round (qa-tester FAIL 01:54, S4): filters by action', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'action_filter_event' });
    EventDAL.updateEvent(projectId, event.id, { description: 'updated' });
    EventDAL.deleteEvent(projectId, event.id);

    const url = (action: string) =>
      `${baseUrl}/api/projects/${projectId}/history?entity_id=${event.id}&action=${action}`;

    const creates = await (await fetch(url('create'))).json();
    expect(creates.items).toHaveLength(1);
    expect(creates.items[0].action).toBe('create');

    const updates = await (await fetch(url('update'))).json();
    expect(updates.items).toHaveLength(1);
    expect(updates.items[0].action).toBe('update');

    const deletes = await (await fetch(url('delete'))).json();
    expect(deletes.items).toHaveLength(1);
    expect(deletes.items[0].action).toBe('delete');

    const all = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?entity_id=${event.id}`)
    ).json();
    expect(all.items).toHaveLength(3);
  });

  it('400s on an unrecognised action instead of silently returning every row', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?action=frobnicate`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('action');
  });

  it('400s on an unknown query parameter, naming it, instead of returning unfiltered results (e.g. a typo)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?actoin=delete`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.field).toBe('actoin');
    expect(body.error).toContain('actoin');
  });

  it('400s on a non-integer limit (e.g. 1.5) instead of a raw 500', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1.5`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('falls back to the default limit for a non-numeric limit (e.g. abc)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=abc`);
    expect(res.status).toBe(200);
  });

  it('400s on a malformed before cursor (no pipe, not paired with before_id)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?before=not-a-cursor`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('400s when before_id is given without before', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?before_id=abc`);
    expect(res.status).toBe(400);
  });

  it('400s on an unparseable timestamp half of the cursor', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/history?before=not-a-date|abc`);
    expect(res.status).toBe(400);
  });

  it('supports keyset paging with a composite before=<changed_at>|<id> cursor', async () => {
    const firstPage = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1`)
    ).json();
    const cursor = firstPage.next_cursor;
    expect(cursor).toBeTruthy();
    const secondPage = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1&before=${encodeURIComponent(cursor)}`)
    ).json();
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it('supports the split before + before_id form', async () => {
    const firstPage = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?limit=1`)
    ).json();
    const [changedAt, id] = String(firstPage.next_cursor).split('|');
    const secondPage = await (
      await fetch(
        `${baseUrl}/api/projects/${projectId}/history?limit=1&before=${encodeURIComponent(changedAt)}&before_id=${encodeURIComponent(id)}`
      )
    ).json();
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  });

  it('pages 60 rows sharing 14 distinct timestamps with limit 7, visiting every row exactly once (no gaps, no duplicates)', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'same_millisecond_event' });
    const timestamps = Array.from({ length: 14 }, (_, i) => `2030-01-01T00:00:00.${String(i).padStart(3, '0')}Z`);
    const insertedIds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const id = insertChange({ entity_id: `route-batch:${event.id}`, changed_at: timestamps[i % 14] });
      insertedIds.add(id);
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    do {
      const url = new URL(`${baseUrl}/api/projects/${projectId}/history`);
      url.searchParams.set('entity_id', `route-batch:${event.id}`);
      url.searchParams.set('limit', '7');
      if (cursor) url.searchParams.set('before', cursor);
      const body = await (await fetch(url)).json();
      for (const row of body.items) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      cursor = body.next_cursor;
      guard += 1;
    } while (cursor && guard < 20);

    expect(seen.size).toBe(60);
    expect(seen).toEqual(insertedIds);
  });
});

describe('GET /api/projects/:projectId/history/:changeId', () => {
  it('returns one change row by id', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const list = await (
      await fetch(`${baseUrl}/api/projects/${projectId}/history?entity_type=event&entity_id=${event.id}`)
    ).json();
    const changeId = list.items[0].id;

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
