/**
 * T-4-35 (D-69): identifiers registry. Migration backfill, DAL (rename cascade, delete 409), routes,
 * the rules-API compatibility path, per-identifier flow aggregation, the tracking document field.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { closeDb, getDb } from '../db';
import { createApp } from '../app';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as SourceDAL from '../dal/source.dal';
import * as EventDAL from '../dal/event.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as IdentifierDAL from '../dal/identifier.dal';
import { buildTrackingDocument, toPublicTrackingDocument } from './document.service';
import { buildIdentificationFlow } from '../../domain/identity/identifiers';

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

const api = (method: string, url: string, body?: unknown) =>
  fetch(`${base}/api/projects/${projectId}/${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('0032_identifiers.sql backfill', () => {
  it('creates one identifier per distinct name (hard wins, cookie flagged) and links the rules', () => {
    const DIR = fileURLToPath(new URL('../db/migrations', import.meta.url));
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.filter((x) => x < '0032')) db.exec(fs.readFileSync(path.join(DIR, f), 'utf-8'));
    const now = new Date().toISOString();
    const clientId = randomUUID();
    db.prepare(`INSERT INTO clients (id, key, name, created_at, updated_at) VALUES (?, 'c', 'C', ?, ?)`).run(clientId, now, now);
    const pid = randomUUID();
    db.prepare(`INSERT INTO projects (id, client_id, name, key, created_at, updated_at) VALUES (?, ?, 'P', 'p', ?, ?)`).run(pid, clientId, now, now);
    const rule = (name: string, identifier: string, type: string, order: number) =>
      db.prepare(
        `INSERT INTO identity_rules (id, project_id, identifier_name, identity_type, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), pid, identifier, type, name, order, now, now);
    rule('Cookie', 'cookie', 'soft', 0);
    rule('Email', 'email_id', 'hard', 1);
    // Two acts of one identifier, differing in case and type: hard wins, the first name is kept.
    rule('Cart a', 'cart_id', 'soft', 2);
    rule('Cart b', 'Cart_ID', 'hard', 3);
    db.exec(fs.readFileSync(path.join(DIR, '0032_identifiers.sql'), 'utf-8'));
    const ids = db.prepare('SELECT name, type, is_cookie FROM identifiers ORDER BY sort_order, name').all();
    expect(ids).toEqual([
      { name: 'cookie', type: 'soft', is_cookie: 1 },
      { name: 'email_id', type: 'hard', is_cookie: 0 },
      { name: 'cart_id', type: 'hard', is_cookie: 0 },
    ]);
    const rules = db.prepare('SELECT identifier_id, identifier_name, identity_type FROM identity_rules ORDER BY sort_order').all() as {
      identifier_id: string | null;
      identifier_name: string;
      identity_type: string;
    }[];
    expect(rules.every((r) => r.identifier_id)).toBe(true);
    expect(rules.slice(2).map((r) => [r.identifier_name, r.identity_type])).toEqual([['cart_id', 'hard'], ['cart_id', 'hard']]);
    expect(rules[2].identifier_id).toBe(rules[3].identifier_id);
    db.close();
  });
});

describe('identifier DAL and routes', () => {
  it('creates, lists with usage, validates, and logs changes', async () => {
    const res = await api('POST', 'identifiers', { name: 'cookie', type: 'soft' });
    expect(res.status).toBe(201);
    const cookie = await res.json();
    expect(cookie.is_cookie).toBe(true);
    expect((await api('POST', 'identifiers', { name: 'COOKIE', type: 'soft' })).status).toBe(409);
    expect((await api('POST', 'identifiers', { name: 'x', type: 'medium' })).status).toBe(400);
    expect((await api('POST', 'identifiers', { name: '', type: 'soft' })).status).toBe(400);
    const list = await (await api('GET', 'identifiers')).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rule_count: 0, event_count: 0 });
    const log = getDb().prepare("SELECT COUNT(*) n FROM change_log WHERE entity_type = 'identifier'").get() as { n: number };
    expect(log.n).toBe(1);
  });

  it('rename cascades to identity rules and events.identifiers_json; type change cascades to rules', async () => {
    const web = SourceDAL.createSource(projectId, { name: 'Storefront', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart', source_id: web.id });
    const ev = EventDAL.createEvent(projectId, { name: 'view_item', implementation_method: 'client_web', source_ids: [web.id] });
    EventDAL.updateEvent(projectId, ev.id, { identifiers_json: ['cart_id'] });
    const patched = await api('PATCH', `identifiers/${rule.identifier_id}`, { name: 'basket_id', type: 'hard' });
    expect(patched.status).toBe(200);
    const after = IdentityRuleDAL.getIdentityRuleOrThrow(projectId, rule.id);
    expect(after.identifier_name).toBe('basket_id');
    expect(after.identity_type).toBe('hard');
    expect(EventDAL.getEventOrThrow(projectId, ev.id).identifiers_json).toEqual(['basket_id']);
    expect((await api('PATCH', `identifiers/${rule.identifier_id}`, { name: 'basket_id' })).status).toBe(200);
  });

  it('delete is 409 IDENTIFIER_IN_USE while a rule or an event references it, else 204', async () => {
    const used = IdentifierDAL.createIdentifier(projectId, { name: 'cart_id', type: 'soft' });
    const free = IdentifierDAL.createIdentifier(projectId, { name: 'spare', type: 'soft' });
    const eventOnly = IdentifierDAL.createIdentifier(projectId, { name: 'ev_only', type: 'soft' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_id: used.id, name: 'Cart' });
    const ev = EventDAL.createEvent(projectId, { name: 'view_item', implementation_method: 'client_web' });
    EventDAL.updateEvent(projectId, ev.id, { identifiers_json: ['ev_only'] });
    const r1 = await api('DELETE', `identifiers/${used.id}`);
    expect(r1.status).toBe(409);
    expect((await r1.json()).code).toBe('IDENTIFIER_IN_USE');
    expect((await api('DELETE', `identifiers/${eventOnly.id}`)).status).toBe(409);
    expect((await api('DELETE', `identifiers/${free.id}`)).status).toBe(204);
    expect((await api('DELETE', `identifiers/${free.id}`)).status).toBe(404);
  });

  it('reorders with PUT /order and rejects a partial list', async () => {
    const a = IdentifierDAL.createIdentifier(projectId, { name: 'a_id', type: 'soft' });
    const b = IdentifierDAL.createIdentifier(projectId, { name: 'b_id', type: 'hard' });
    expect((await api('PUT', 'identifiers/order', { ids: [a.id] })).status).toBe(400);
    const res = await api('PUT', 'identifiers/order', { ids: [b.id, a.id] });
    expect(res.status).toBe(200);
    expect((await res.json()).map((i: { name: string }) => i.name)).toEqual(['b_id', 'a_id']);
  });
});

describe('rules API compatibility (D-69)', () => {
  it('POST with identifier_name + identity_type creates the registry entry; a second rule joins it', async () => {
    const first = await (await api('POST', 'identity-rules', { name: 'Cart on checkout', identifier_name: 'cart_id', identity_type: 'soft' })).json();
    expect(first.identifier_id).toBeTruthy();
    expect(first.identity_type).toBe('soft');
    const second = await (await api('POST', 'identity-rules', { name: 'Cart by backend', identifier_name: 'Cart_ID', identity_type: 'soft' })).json();
    expect(second.identifier_id).toBe(first.identifier_id);
    expect(second.identity_type).toBe('soft');
    const list = await (await api('GET', 'identifiers')).json();
    expect(list).toHaveLength(1);
    expect(list[0].rule_count).toBe(2);
  });

  it('POST with identifier_id works, a new name without a valid type is 400, a bare identity_type PATCH is ignored', async () => {
    const ident = IdentifierDAL.createIdentifier(projectId, { name: 'email_id', type: 'hard' });
    const rule = await (await api('POST', 'identity-rules', { name: 'Email', identifier_id: ident.id })).json();
    expect(rule).toMatchObject({ identifier_name: 'email_id', identity_type: 'hard' });
    expect((await api('POST', 'identity-rules', { name: 'X', identifier_name: 'brand_new' })).status).toBe(400);
    expect((await api('POST', 'identity-rules', { name: 'X', identifier_id: 'nope' })).status).toBe(400);
    const ignored = await api('PATCH', `identity-rules/${rule.id}`, { identity_type: 'soft' });
    expect(ignored.status).toBe(200);
    expect(IdentifierDAL.getIdentifierOrThrow(projectId, ident.id).type).toBe('hard');
  });
});

describe('type mismatch (D-69 amendment 1)', () => {
  it('409 IDENTIFIER_TYPE_MISMATCH for an existing identifier by name or id, on POST and PATCH; a matching type is fine', async () => {
    const ident = IdentifierDAL.createIdentifier(projectId, { name: 'email_id', type: 'hard' });
    const byName = await api('POST', 'identity-rules', { name: 'A', identifier_name: 'EMAIL_ID', identity_type: 'soft' });
    expect(byName.status).toBe(409);
    const body = await byName.json();
    expect(body.code).toBe('IDENTIFIER_TYPE_MISMATCH');
    expect(body.error).toMatch(/hard/);
    expect(body.error).toMatch(/Settings/);
    expect((await api('POST', 'identity-rules', { name: 'A', identifier_id: ident.id, identity_type: 'soft' })).status).toBe(409);
    const ok = await api('POST', 'identity-rules', { name: 'A', identifier_name: 'email_id', identity_type: 'hard' });
    expect(ok.status).toBe(201);
    const rule = await ok.json();
    expect((await api('PATCH', `identity-rules/${rule.id}`, { identifier_name: 'email_id', identity_type: 'soft' })).status).toBe(409);
    expect((await api('PATCH', `identity-rules/${rule.id}`, { identity_type: 'soft' })).status).toBe(200);
    expect(IdentifierDAL.getIdentifierOrThrow(projectId, ident.id).type).toBe('hard');
  });
});

describe('cascade details', () => {
  it('logs each rewritten rule, matches case-insensitively and rewrites soft-deleted events but does not count them', () => {
    const ident = IdentifierDAL.createIdentifier(projectId, { name: 'cart_id', type: 'soft' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, { identifier_id: ident.id, name: 'Cart' });
    const live = EventDAL.createEvent(projectId, { name: 'view_item', implementation_method: 'client_web' });
    const gone = EventDAL.createEvent(projectId, { name: 'old_event', implementation_method: 'client_web' });
    EventDAL.updateEvent(projectId, live.id, { identifiers_json: ['cart_id'] });
    EventDAL.deleteEvent(projectId, gone.id);
    getDb().prepare('UPDATE events SET identifiers_json = ? WHERE id = ?').run(JSON.stringify(['Cart_ID']), gone.id);
    IdentifierDAL.updateIdentifier(projectId, ident.id, { name: 'basket_id' });
    const logged = getDb().prepare("SELECT COUNT(*) n FROM change_log WHERE entity_type = 'identity_rule' AND entity_id = ? AND action = 'update'").get(rule.id) as { n: number };
    expect(logged.n).toBe(1);
    const row = getDb().prepare('SELECT identifiers_json FROM events WHERE id = ?').get(gone.id) as { identifiers_json: string };
    expect(JSON.parse(row.identifiers_json)).toEqual(['basket_id']);
    expect(EventDAL.getEventOrThrow(projectId, live.id).identifiers_json).toEqual(['basket_id']);
    const guard = IdentifierDAL.usageOf(projectId, IdentifierDAL.getIdentifierOrThrow(projectId, ident.id));
    expect(guard.events).toBe(1);
  });
});

describe('registry-driven consumers', () => {
  it('hardIdKey comes from the registry even with no rule', async () => {
    IdentifierDAL.createIdentifier(projectId, { name: 'email_id', type: 'hard' });
    const { buildEventCardContext } = await import('./document.service');
    expect(buildEventCardContext(projectId).hardIdKey).toBe('email_id');
  });
});

describe('restore of a pre-0032 backup', () => {
  it('backfills the registry from the rules and links them', async () => {
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cookie', identity_type: 'soft', name: 'Cookie' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'email_id', identity_type: 'hard', name: 'Email' });
    const { buildBackup } = await import('./backup.service');
    const { previewRestore, applyRestore } = await import('./backupRestore.service');
    const backup = JSON.parse(JSON.stringify(await buildBackup(projectId))) as Record<string, unknown>;
    delete backup.identifiers;
    for (const r of backup.identity_rules as Record<string, unknown>[]) delete r.identifier_id;
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'old', name: 'Old Co' });
    const { project } = await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored-old', client_id: client.id });
    const names = IdentifierDAL.listIdentifiers(project.id).map((i) => [i.name, i.type, i.is_cookie]);
    expect(names).toEqual([['cookie', 'soft', true], ['email_id', 'hard', false]]);
    expect(IdentityRuleDAL.listIdentityRules(project.id).every((r) => r.identifier_id)).toBe(true);
  });
});

describe('flow per identifier', () => {
  const sources = [{ id: 's1', name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' }, { id: 's2', name: 'Backend', system: 'custom_backend', method: 'tracking_api' }];
  const events = [
    { id: 'e1', name: 'checkout', implementation_method: 'client_web', source_ids: ['s1'] },
    { id: 'e2', name: 'order_placed', implementation_method: 'server_api', source_ids: ['s2'] },
  ];

  it('aggregates every act of one identifier into one sentence and reads type and cookie from the registry', () => {
    const rules = [
      { id: 'r1', identifier_name: 'cart_id', identity_type: 'soft', trigger_event_id: 'e1', source_id: 's1', sdk_call: 'identify' },
      { id: 'r2', identifier_name: 'cart_id', identity_type: 'soft', trigger_event_id: 'e2', source_id: 's2' },
    ];
    const flow = buildIdentificationFlow(rules, events, sources, [
      { name: 'cart_id', type: 'hard' },
      { name: 'visitor', type: 'soft', is_cookie: true },
    ]);
    expect(flow.paragraph).toContain('identified by one identifier: cart_id (hard)');
    expect(flow.paragraph).toMatch(/cart_id is set when the checkout event fires, by .*, and also when the order_placed event fires/);
    expect(flow.paragraph).toContain('No identification act is defined yet for visitor (soft).');
    expect(flow.paragraph.match(/cart_id is set/g)).toHaveLength(1);
    expect(flow.rules.map((r) => r.identity_type)).toEqual(['hard', 'hard']);
    // The cookie flag comes from the registry: the client event carries the cookie-flagged identifier only when a rule exists for it.
    expect(flow.rules[0].carried_by.map((e) => e.name)).toContain('checkout');
  });
});

describe('tracking document', () => {
  it('lists identifiers with their acts, and the public projection keeps them', () => {
    const ident = IdentifierDAL.createIdentifier(projectId, { name: 'email_id', type: 'hard', description: 'Customer email' });
    IdentifierDAL.createIdentifier(projectId, { name: 'cookie', type: 'soft' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_id: ident.id, name: 'Email on signup' });
    const doc = buildTrackingDocument(projectId);
    expect(doc.identifiers).toEqual([
      { name: 'email_id', type: 'hard', description: 'Customer email', is_cookie: false, acts: ['Email on signup'] },
      { name: 'cookie', type: 'soft', description: null, is_cookie: true, acts: [] },
    ]);
    expect(toPublicTrackingDocument(doc).identifiers).toHaveLength(2);
  });
});
