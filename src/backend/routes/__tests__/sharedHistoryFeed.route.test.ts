/**
 * T-5-43 (D-88 plan section 5): `GET /api/shared/:token/history` without a target returns the
 * project's recent public changes for the portal overview. Same projection as the exact-target
 * history: the four public entity types only, visible targets only, current names, allowlisted
 * fields, no envelope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import { createProject, createOrRotateShare } from '../../dal/project.dal';
import { createIdentityRule } from '../../dal/identity-rule.dal';
import { createCatalog, createCatalogField, deleteCatalog } from '../../dal/catalog.dal';
import { createProperty } from '../../dal/property.dal';

let server: http.Server;
let base: string;
let token: string;
let project: string;
let foreign: string;
const ids: Record<string, string> = {};

let seq = 0;
function change(projectId: string, entityType: string, entityId: string, changedAt: string, diff: unknown[], parent: string | null = null) {
  getDb()
    .prepare(
      `INSERT INTO change_log (id, project_id, entity_type, entity_id, entity_label, parent_entity_id, action, actor, source, batch_id, changed_at, diff_json)
       VALUES (?, ?, ?, ?, 'PRIVATE LABEL', ?, 'update', 'jan@e3-services.com', 'ui', 'BATCH-SECRET', ?, ?)`
    )
    .run(`feed-${String(++seq).padStart(3, '0')}`, projectId, entityType, entityId, parent, changedAt, JSON.stringify(diff));
}
const desc = (before: string, after: string) => [{ field: 'description', before, after }];

async function get(path: string) {
  const res = await fetch(base + path);
  return { status: res.status, data: await res.json() };
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = createClient({ key: 'feed', name: 'Feed' }).id;
  project = createProject({ key: 'feed-a', name: 'Feed A', client_id: client }).id;
  foreign = createProject({ key: 'feed-b', name: 'Feed B', client_id: client }).id;
  token = createOrRotateShare(project, 'read').share_token!;
  ids.rule = createIdentityRule(project, { name: 'Identify email', identifier_name: 'email', identity_type: 'hard' }).id;
  ids.catalog = createCatalog(project, { name: 'Products' }).id;
  ids.field = createCatalogField(project, ids.catalog, { name: 'sku' } as never).id;
  ids.gone = createCatalog(project, { name: 'Removed catalog' }).id;
  const property = createProperty(project, { name: 'action', scope: 'event', data_type: 'string' });
  ids.def = (getDb().prepare('SELECT id FROM property_definitions WHERE property_id = ?').get(property.id) as { id: string }).id;
  ids.foreignCatalog = createCatalog(foreign, { name: 'Foreign catalog' }).id;
  deleteCatalog(project, ids.gone);
  getDb().prepare('DELETE FROM change_log').run();

  change(project, 'property_definition', ids.def, '2026-10-01T10:00:00.000Z', desc('a', 'b'));
  change(project, 'identity_rule', ids.rule, '2026-10-02T10:00:00.000Z', [{ field: 'name', before: 'Identify', after: 'Identify email' }]);
  change(project, 'catalog_field', ids.field, '2026-10-03T10:00:00.000Z', desc('', 'Stock keeping unit'), ids.catalog);
  // Not public: an event change, a private-only diff, a removed catalog, another project.
  change(project, 'event', 'event-1', '2026-10-04T10:00:00.000Z', desc('x', 'EVENT SECRET'));
  change(project, 'catalog', ids.catalog, '2026-10-05T10:00:00.000Z', [{ field: 'internal_notes', before: 'x', after: 'NOTES SECRET' }]);
  change(project, 'catalog', ids.gone, '2026-10-06T10:00:00.000Z', desc('x', 'REMOVED SECRET'));
  change(foreign, 'catalog', ids.foreignCatalog, '2026-10-07T10:00:00.000Z', desc('x', 'FOREIGN SECRET'));
  change(project, 'catalog', ids.catalog, '2026-10-08T10:00:00.000Z', [
    { field: 'description', before: 'old', after: 'new' },
    { field: 'owner', before: 'x', after: 'OWNER SECRET' },
  ]);

  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('GET /api/shared/:token/history without a target (portal overview)', () => {
  it('lists the public changes of visible targets, newest first, with current names', async () => {
    const res = await get(`/api/shared/${token}/history?limit=5`);
    expect(res.status).toBe(200);
    expect(res.data.rows.map((r: { entity_type: string; entity_label: string }) => [r.entity_type, r.entity_label])).toEqual([
      ['catalog', 'Products'],
      ['catalog_field', 'sku'],
      ['identity_rule', 'Identify email'],
      ['property_definition', 'general'], // the definition's name, as on the exact-target history
    ]);
    expect(res.data.rows[0].diff_json).toEqual([{ field: 'description', before: 'old', after: 'new' }]);
    expect(res.data.next_cursor).toBeNull();
  });

  it('never returns private fields, hidden targets, other projects or the change envelope', async () => {
    const body = JSON.stringify((await get(`/api/shared/${token}/history`)).data);
    expect(body).not.toMatch(/SECRET|PRIVATE|internal_notes|owner|jan@|BATCH|project_id|parent_entity_id|source/);
    expect(body).not.toContain(ids.gone);
    expect(body).not.toContain(ids.foreignCatalog);
  });

  it('pages with the cursor and keeps the limit bounds', async () => {
    const first = await get(`/api/shared/${token}/history?limit=1`);
    expect(first.data.rows).toHaveLength(1);
    expect(first.data.next_cursor).toBe(first.data.rows[0].id);
    const second = await get(`/api/shared/${token}/history?limit=1&before=${first.data.next_cursor}`);
    expect(second.data.rows[0].entity_label).toBe('sku');
    expect((await get(`/api/shared/${token}/history?limit=101`)).status).toBe(400);
    expect((await get(`/api/shared/${token}/history?before=unknown`)).status).toBe(404);
  });

  it('still refuses a half target and an unknown share', async () => {
    expect((await get(`/api/shared/${token}/history?entity_type=catalog`)).status).toBe(404);
    expect((await get(`/api/shared/${token}/history?entity_id=${ids.catalog}`)).status).toBe(404);
    expect((await get('/api/shared/not-a-token/history')).status).toBe(404);
  });
});
