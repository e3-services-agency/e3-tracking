/**
 * T-4-28 (D-67, D-68, migration 0030): event identifiers (validation, derive/override, reset), source
 * colour (auto-assign, validation, restore of free text), the identity-rules routes (set_by,
 * carried_by, flow), the tracking document and HTML export, Tracking API codegen customer_ids, the
 * identity codegen standalone call, and comparison 3's identifier_missing.
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
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as FindingDAL from '../dal/finding.dal';
import { BadRequestError, ValidationError } from '../errors';
import { runComparison } from './comparison.service';
import { buildEventCard, buildTrackingDocument, toPublicTrackingDocument } from './document.service';
import { buildIdentityCodegen } from './codegen.service';
import { getProjectIdentificationFlow, listIdentityRulesForCodegen } from './identification.service';
import { renderIdentityRulesSection } from './docs/sections';
import { eventCardToMarkdown } from '../../domain/document/markdown';
import { pickSourceColor } from '../../domain/sources';

let projectId: string;

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
  const backend = SourceDAL.createSource(projectId, { name: 'Order system', system: 'custom_backend', method: 'tracking_api' });
  const cookie = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cookie', identity_type: 'soft', name: 'Cookie', source_id: web.id });
  const cart = IdentityRuleDAL.createIdentityRule(projectId, {
    identifier_name: 'cart_id',
    identity_type: 'soft',
    name: 'Cart id',
    sdk_call: 'identify',
    trigger_text: 'the checkout page loads',
    source_id: web.id,
  });
  const email = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'email_id', identity_type: 'hard', name: 'Email', sdk_call: 'identify' });
  const view = EventDAL.createEvent(projectId, { name: 'view_item', implementation_method: 'client_web', source_ids: [web.id] });
  const cartUpdate = EventDAL.createEvent(projectId, {
    name: 'cart_update',
    implementation_method: 'server_api',
    source_ids: [backend.id],
    identifiers_json: ['cart_id'],
  });
  return { web, backend, cookie, cart, email, view, cartUpdate };
}

describe('sources.color (D-68)', () => {
  it('auto-assigns by system, then the first unused token, and rejects non-palette values', () => {
    const a = SourceDAL.createSource(projectId, { name: 'A', system: 'shopify' });
    const b = SourceDAL.createSource(projectId, { name: 'B', system: 'shopify' });
    expect(a.color).toBe('source-1');
    expect(b.color).toBe('source-2');
    expect(SourceDAL.createSource(projectId, { name: 'C', system: 'custom_backend' }).color).toBe('source-4');
    expect(() => SourceDAL.createSource(projectId, { name: 'D', color: 'blue' })).toThrow(ValidationError);
    expect(SourceDAL.updateSource(projectId, a.id, { color: 'source-7' }).color).toBe('source-7');
    expect(() => SourceDAL.updateSource(projectId, a.id, { color: '#fff' })).toThrow(ValidationError);
  });

  it('the database trigger rejects a free-text colour written around the DAL', () => {
    const a = SourceDAL.createSource(projectId, { name: 'A' });
    expect(() => getDb().prepare('UPDATE sources SET color = ? WHERE id = ?').run('blue', a.id)).toThrow(/sources.color/);
  });

  it('pickSourceColor falls back to the system token when every token is taken', () => {
    const all = ['source-1', 'source-2', 'source-3', 'source-4', 'source-5', 'source-6', 'source-7', 'source-8'];
    expect(pickSourceColor('crm', all)).toBe('source-6');
  });
});

describe('events.identifiers_json (D-67)', () => {
  it('stores a validated list, 400 for an unknown identifier, null/[] resets to derived', () => {
    const { view } = setUp();
    expect(EventDAL.updateEvent(projectId, view.id, { identifiers_json: ['cookie', 'cart_id'] }).identifiers_json).toEqual(['cookie', 'cart_id']);
    expect(() => EventDAL.updateEvent(projectId, view.id, { identifiers_json: ['nope'] })).toThrow(BadRequestError);
    expect(() => EventDAL.updateEvent(projectId, view.id, { identifiers_json: 'cookie' as unknown as string[] })).toThrow(BadRequestError);
    expect(EventDAL.updateEvent(projectId, view.id, { identifiers_json: [] }).identifiers_json).toBeNull();
    expect(EventDAL.getEventOrThrow(projectId, view.id).identifiers_json).toBeNull();
    expect(() => EventDAL.createEvent(projectId, { name: 'x_event', identifiers_json: ['nope'] })).toThrow(BadRequestError);
  });

  it('is part of the change log diff', () => {
    const { view } = setUp();
    EventDAL.updateEvent(projectId, view.id, { identifiers_json: ['cookie'] });
    const row = getDb().prepare("SELECT diff_json FROM change_log WHERE entity_id = ? AND action = 'update' ORDER BY rowid DESC LIMIT 1").get(view.id) as { diff_json: string };
    expect(row.diff_json).toContain('identifiers_json');
  });
});

describe('identification flow service', () => {
  it('builds set_by, binds and carried_by in one pass and names the merge', () => {
    setUp();
    const flow = getProjectIdentificationFlow(projectId);
    const cart = flow.rules.find((r) => r.identifier_name === 'cart_id')!;
    expect(cart.set_by).toMatchObject({ kind: 'standalone_call', sdk_call: 'identify', trigger_text: 'the checkout page loads', source: { name: 'Storefront' } });
    expect(cart.binds).toEqual(['cart_id', 'cookie']);
    expect(cart.carried_by.map((e) => e.name)).toContain('cart_update');
    expect(flow.paragraph).toContain('cart_id is set by a standalone identify call when the checkout page loads via Storefront together with cookie; cart_update is sent with cart_id only and is merged into the profile through it.');
  });

  it('GET /identity-rules and /identity-rules/flow carry the flow', async () => {
    setUp();
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const rules = await (await fetch(`${base}/api/projects/${projectId}/identity-rules`)).json();
      const cart = rules.find((r: { identifier_name: string }) => r.identifier_name === 'cart_id');
      expect(cart.set_by.kind).toBe('standalone_call');
      expect(cart.carried_by.map((e: { name: string }) => e.name)).toContain('cart_update');
      const flow = await (await fetch(`${base}/api/projects/${projectId}/identity-rules/flow`)).json();
      expect(flow.paragraph).toContain('A customer is identified by 3 identifiers');
      const patch = await fetch(`${base}/api/projects/${projectId}/events/${EventDAL.listEvents(projectId)[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers_json: ['ghost'] }),
      });
      expect(patch.status).toBe(400);
      const events = await (await fetch(`${base}/api/projects/${projectId}/events`)).json();
      expect(events[0].sources[0]).toHaveProperty('color');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('document, export and codegen', () => {
  it('puts identifiers, the flow and source colour in the card, document, public projection and markdown', () => {
    const { view, cartUpdate } = setUp();
    const card = buildEventCard(projectId, view.id);
    expect(card.identifiers).toEqual(['cookie', 'cart_id', 'email_id']);
    expect(card.identifiers_derived).toBe(true);
    expect(card.sources?.[0].color).toBe('source-1');
    expect(buildEventCard(projectId, cartUpdate.id)).toMatchObject({ identifiers: ['cart_id'], identifiers_derived: false });
    expect(eventCardToMarkdown(card)).toContain('- Identifiers (customer_ids): cookie, cart_id, email_id (derived)');

    const doc = buildTrackingDocument(projectId);
    expect(doc.identification_flow).toContain('standalone identify call');
    const cartRule = doc.identity_rules.find((r) => r.identifier_name === 'cart_id')!;
    expect(cartRule.set_by?.kind).toBe('standalone_call');
    expect(cartRule.carried_by).toContain('cart_update');
    const pub = toPublicTrackingDocument(doc);
    expect(pub.identification_flow).toBe(doc.identification_flow);
    expect(pub.events.find((e) => e.name === 'view_item')?.identifiers).toEqual(['cookie', 'cart_id', 'email_id']);
  });

  it('the HTML identity section shows the flow paragraph and Carried by', () => {
    setUp();
    const flow = getProjectIdentificationFlow(projectId);
    const html = renderIdentityRulesSection([{ identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart id', carried_by: ['cart_update'] }], flow.paragraph);
    expect(html).toContain('Identification flow');
    expect(html).toContain('<th>Carried by</th>');
    expect(html).toContain('cart_update');
  });

  it('Tracking API customer_ids come from the event identifiers, keeping the docs link', () => {
    const { cartUpdate, view } = setUp();
    const api = buildEventCard(projectId, cartUpdate.id).codegen.tracking_api;
    expect(api).toContain('"customer_ids": {\n    "cart_id": "<cart_id>"\n  }');
    expect(api).toContain('https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview');
    EventDAL.updateEvent(projectId, view.id, { implementation_method: 'server_api', identifiers_json: ['cookie', 'email_id'] });
    const two = buildEventCard(projectId, view.id).codegen.tracking_api;
    expect(two).toContain('"cookie": "<cookie>"');
    expect(two).toContain('"email_id": "<email_id>"');
  });

  it('the identify snippet lists the identifiers a standalone call binds', () => {
    setUp();
    const snippets = buildIdentityCodegen(listIdentityRulesForCodegen(projectId), []);
    expect(snippets.identify).toContain('// Standalone identify call when the checkout page loads: binds cart_id, cookie');
    expect(snippets.identify).toContain('cart_id: cartId,');
    expect(snippets.identify).not.toContain('cookie:');
  });
});

describe('comparison 3: identifier_missing', () => {
  function observe(properties: Record<string, unknown>) {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: 'cart_update', timestamp: 1_700_000_000, properties });
  }
  const findings = () => FindingDAL.listFindings(projectId, {}).filter((f) => f.kind === 'identifier_missing');

  it('warns when customer_ids lacks an identifier the event carries, and only then', () => {
    setUp();
    observe({ customer_ids: { cookie: 'abc' } });
    runComparison(projectId);
    const found = findings();
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
    expect(found[0].message).toContain('cart_id');
  });

  it('is silent when the identifier is present or the observation records no customer_ids', () => {
    setUp();
    observe({ customer_ids: { cart_id: 'c1' } });
    runComparison(projectId);
    expect(findings()).toHaveLength(0);
    closeDb();
    process.env.E3_DB_PATH = ':memory:';
    const client = ClientDAL.createClient({ key: 'b', name: 'B' });
    projectId = ProjectDAL.createProject({ client_id: client.id, key: 'b-eu', name: 'B' }).id;
    setUp();
    observe({ quantity: 1 });
    runComparison(projectId);
    expect(findings()).toHaveLength(0);
  });
});

describe('identity codegen: standalone rules', () => {
  it('emits a hard standalone rule once, not in the plain identify block', () => {
    const web = SourceDAL.createSource(projectId, { name: 'Storefront', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cookie', identity_type: 'soft', name: 'Cookie' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'email_id', identity_type: 'hard', name: 'Email', sdk_call: 'identify', trigger_text: 'login', source_id: web.id });
    const identify = buildIdentityCodegen(listIdentityRulesForCodegen(projectId), []).identify;
    expect(identify.match(/exponea\.identify\(/g)).toHaveLength(1);
    expect(identify).toContain('Standalone identify call on login');
  });

  it('a standalone rule on a Tracking API source gets the server-side form', () => {
    const api = SourceDAL.createSource(projectId, { name: 'Order system', system: 'custom_backend', method: 'tracking_api' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart', sdk_call: 'identify', trigger_text: 'checkout', source_id: api.id });
    const identify = buildIdentityCodegen(listIdentityRulesForCodegen(projectId), []).identify;
    expect(identify).not.toContain('exponea.identify({');
    expect(identify).toContain('Tracking API');
    expect(identify).toContain('customer_ids: { cart_id: cartId }');
  });
});

describe('identity codegen and Tracking API note polish', () => {
  it('skips an identify block with no ids and strips the trailing period in comments', () => {
    const web = SourceDAL.createSource(projectId, { name: 'Storefront', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cookie', identity_type: 'soft', name: 'Cookie', sdk_call: 'identify', trigger_text: 'First page view of a new visitor.', source_id: web.id });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'cart_id', identity_type: 'soft', name: 'Cart', sdk_call: 'identify', trigger_text: 'Checkout page.', source_id: web.id });
    const identify = buildIdentityCodegen(listIdentityRulesForCodegen(projectId), []).identify;
    expect(identify).not.toContain('exponea.identify({\n});');
    expect(identify).not.toContain('.:');
    expect(identify).toContain('Standalone identify call on checkout page: binds cart_id, cookie');
  });

  it('the Tracking API note mentions soft ids only when a soft id is carried', () => {
    const { cartUpdate, email, view } = setUp();
    expect(buildEventCard(projectId, cartUpdate.id).codegen.tracking_api).toContain('soft ids are merged into the profile');
    EventDAL.updateEvent(projectId, view.id, { implementation_method: 'server_api', identifiers_json: [email.identifier_name] });
    const hardOnly = buildEventCard(projectId, view.id).codegen.tracking_api;
    expect(hardOnly).toContain("customer_ids must match the project's hard ID");
  });
});
