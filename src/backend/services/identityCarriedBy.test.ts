/**
 * T-4-32: `PUT /identity-rules/:id/carried-by` (D-67): derived unchanged writes nothing, explicit add and
 * remove, 400 for unknown or malformed event_ids, one change_log row per changed event.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, getDb } from '../db';
import { createApp } from '../app';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as SourceDAL from '../dal/source.dal';
import * as EventDAL from '../dal/event.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';

let projectId: string;
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});
afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

function setUp() {
  const web = SourceDAL.createSource(projectId, { name: 'Storefront', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
  IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cookie', identity_type: 'soft', name: 'Cookie' });
  const cart = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart', source_id: web.id });
  const view = EventDAL.createEvent(projectId, { name: 'view_item', implementation_method: 'client_web', source_ids: [web.id] });
  const purchase = EventDAL.createEvent(projectId, { name: 'purchase', implementation_method: 'server_api', source_ids: [web.id] });
  return { cart, view, purchase };
}

const put = (ruleId: string, body: unknown) =>
  fetch(`${base}/api/projects/${projectId}/identity-rules/${ruleId}/carried-by`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const changeCount = () => (getDb().prepare("SELECT COUNT(*) n FROM change_log WHERE entity_type = 'event' AND action = 'update'").get() as { n: number }).n;

describe('PUT /identity-rules/:id/carried-by', () => {
  it('writes nothing when the selection equals the derived carriers', async () => {
    const { cart, purchase } = setUp();
    const before = changeCount();
    const res = await put(cart.id, { event_ids: [purchase.id] });
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toEqual([]);
    expect(changeCount()).toBe(before);
  });

  it('ticks a non-derived event (explicit list) and unticks it again (override cleared)', async () => {
    const { cart, view, purchase } = setUp();
    const before = changeCount();
    const add = await (await put(cart.id, { event_ids: [purchase.id, view.id] })).json();
    expect(add.changed).toEqual([{ event_id: view.id, identifiers_json: ['cookie', 'cart_id'] }]);
    expect(EventDAL.getEventOrThrow(projectId, view.id).identifiers_json).toEqual(['cookie', 'cart_id']);
    expect(changeCount()).toBe(before + 1);
    const remove = await (await put(cart.id, { event_ids: [purchase.id] })).json();
    expect(remove.changed).toEqual([{ event_id: view.id, identifiers_json: null }]);
    expect(EventDAL.getEventOrThrow(projectId, view.id).identifiers_json).toBeNull();
    expect(changeCount()).toBe(before + 2);
  });

  it('unticking a derived carrier writes an explicit list without it', async () => {
    const { cart, purchase } = setUp();
    await put(cart.id, { event_ids: [] });
    const row = EventDAL.getEventOrThrow(projectId, purchase.id);
    // D-67 amendment 2: removing the last identifier is an explicit "carries nothing", not a reset.
    expect(row.identifiers_json).toEqual([]);
    expect(changeCount()).toBeGreaterThan(0);
    const again = await (await put(cart.id, { event_ids: [] })).json();
    expect(again.changed).toEqual([]);
  });

  it('400 for an unknown event id and for a malformed body, 404 for an unknown rule', async () => {
    const { cart, purchase } = setUp();
    const before = changeCount();
    expect((await put(cart.id, { event_ids: [purchase.id, 'nope'] })).status).toBe(400);
    expect((await put(cart.id, { event_ids: 'purchase' })).status).toBe(400);
    expect((await put(cart.id, {})).status).toBe(400);
    expect((await put('missing', { event_ids: [] })).status).toBe(404);
    expect(changeCount()).toBe(before);
  });
});

describe('several identity rules may act on one identifier (D-69, supersedes the T-4-32 uniqueness)', () => {
  const post = (body: unknown) =>
    fetch(`${base}/api/projects/${projectId}/identity-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const patch = (id: string, body: unknown) =>
    fetch(`${base}/api/projects/${projectId}/identity-rules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('a second rule with the same identifier_name (any case) joins the existing identifier; a rename-to-existing repoints', async () => {
    const { cart } = setUp();
    const dup = await post({ name: 'Other', identifier_name: 'CART_ID', identity_type: 'soft' });
    expect(dup.status).toBe(201);
    const second = await dup.json();
    expect(second.identifier_id).toBe(cart.identifier_id);
    expect(second.identifier_name).toBe('cart_id');
    const fresh = await post({ name: 'Email', identifier_name: 'email_id', identity_type: 'hard' });
    expect(fresh.status).toBe(201);
    const email = await fresh.json();
    expect(email.identifier_id).not.toBe(cart.identifier_id);
    const repoint = await patch(email.id, { identifier_name: 'Cookie' });
    expect(repoint.status).toBe(200);
    expect((await repoint.json()).identifier_name).toBe('cookie');
    expect((await patch(cart.id, { identifier_name: 'cart_id', name: 'Cart renamed' })).status).toBe(200);
    expect((await patch(cart.id, { identifier_name: 'Cart_Id' })).status).toBe(200);
  });
});
