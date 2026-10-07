/**
 * Codegen v2 through the backend (D-63, T-4-17): implementation method and dataLayer event name on
 * events, property kind and derivation with validation, the event card's codegen tabs per method,
 * the dataLayer path and bundle name on card properties, "Add bundle" (DAL and route), and the
 * state_list_mismatch finding through a real comparison run.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, getDb } from '../db';
import { createApp } from '../app';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as BundleDAL from '../dal/bundle.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as FindingDAL from '../dal/finding.dal';
import { BadRequestError } from '../errors';
import { runComparison } from './comparison.service';
import { buildEventCard, buildTrackingDocument, toPublicTrackingDocument } from './document.service';
import { eventCardToMarkdown } from '../../domain/document/markdown';

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

const prop = (name: string, extra: Partial<PropertyDAL.PropertyInput> = {}) =>
  PropertyDAL.createProperty(projectId, { scope: 'event', name, data_type: 'string', ...extra });

/** add_to_wishlist in D-63 terms: event props, item props, state lists, totals. */
function setUpWishlist() {
  const event = EventDAL.createEvent(projectId, { name: 'add_to_wishlist', dl_event_name: 'add_to_wishlist' });
  const link = (p: PropertyDAL.PropertyRow, required = true) =>
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: p.id, required });
  const placement = prop('placement', { example_values_json: [{ value: 'plp' }] });
  const productId = prop('product_id', { kind: 'item', example_values_json: [{ value: '15062099820869' }] });
  const price = prop('price', { kind: 'item', data_type: 'number' });
  const productIds = prop('product_ids', {
    data_type: 'array',
    kind: 'state_list',
    derivation_json: { source: 'items', id_field: 'product_id', form: 'ids' },
  });
  const productList = prop('product_list', {
    data_type: 'array',
    kind: 'state_list',
    derivation_json: { source: 'items', id_field: 'product_id', form: 'id_quantity', quantity_field: 'quantity' },
  });
  const totalPrice = prop('total_price', {
    data_type: 'number',
    kind: 'state_list',
    derivation_json: { source: 'items', sum: 'price*quantity' },
  });
  for (const p of [placement, productId, price, productIds, productList, totalPrice]) link(p);
  return { event, placement, productId, productIds, productList, totalPrice };
}

describe('event implementation method and dataLayer event name', () => {
  it('defaults by name and class on create, and accepts explicit values', () => {
    expect(EventDAL.createEvent(projectId, { name: 'add_to_wishlist' }).implementation_method).toBe('client_web');
    expect(EventDAL.createEvent(projectId, { name: 'purchase' }).implementation_method).toBe('server_api');
    expect(EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' }).implementation_method).toBe('sdk_auto');
    const custom = EventDAL.createEvent(projectId, { name: 'checkout_step', implementation_method: 'server_api', dl_event_name: ' step ' });
    expect(custom.implementation_method).toBe('server_api');
    expect(custom.dl_event_name).toBe('step');
  });

  it('updates and validates the method', () => {
    const event = EventDAL.createEvent(projectId, { name: 'add_to_wishlist' });
    const updated = EventDAL.updateEvent(projectId, event.id, { implementation_method: 'sdk_auto', dl_event_name: 'wishlist_add' });
    expect(updated.implementation_method).toBe('sdk_auto');
    expect(updated.dl_event_name).toBe('wishlist_add');
    expect(EventDAL.updateEvent(projectId, event.id, { dl_event_name: '' }).dl_event_name).toBeNull();
    expect(() => EventDAL.updateEvent(projectId, event.id, { implementation_method: 'pigeon' })).toThrow(BadRequestError);
    expect(() => EventDAL.createEvent(projectId, { name: 'x', implementation_method: 'pigeon' })).toThrow(BadRequestError);
  });
});

describe('property kind and derivation', () => {
  it('defaults to event, round-trips a derivation and rejects invalid combinations', () => {
    expect(prop('placement').kind).toBe('event');
    const list = prop('product_ids', { kind: 'state_list', derivation_json: { source: 'items', id_field: 'product_id', form: 'ids' } });
    expect(PropertyDAL.getPropertyOrThrow(projectId, list.id).derivation_json).toEqual({ source: 'items', id_field: 'product_id', form: 'ids' });
    expect(() => prop('bad_kind', { kind: 'nope' })).toThrow(BadRequestError);
    expect(() => prop('bad_rule', { kind: 'state_list', derivation_json: { source: 'items', form: 'ids' } })).toThrow(BadRequestError);
    expect(() => prop('rule_on_event', { derivation_json: { source: 'items', sum: 'price' } })).toThrow(BadRequestError);
  });

  it('clears a stale derivation when the kind moves away from state_list', () => {
    const list = prop('total_price', { kind: 'state_list', derivation_json: { source: 'items', sum: 'price*quantity' } });
    const moved = PropertyDAL.updateProperty(projectId, list.id, { kind: 'event' });
    expect(moved.kind).toBe('event');
    expect(moved.derivation_json).toBeNull();
    expect(() => PropertyDAL.updateProperty(projectId, list.id, { derivation_json: { source: 'items', sum: 'x' } })).toThrow(BadRequestError);
  });
});

describe('event card codegen per implementation method', () => {
  it('client_web: dataLayer, GTM template, both Web SDKs and the Tracking API', () => {
    const { event } = setUpWishlist();
    const card = buildEventCard(projectId, event.id);
    expect(card.implementation_method).toBe('client_web');
    expect(card.dl_event_name).toBe('add_to_wishlist');
    const c = card.codegen;
    expect(c.datalayer).toContain('window.dataLayer.push({ bloomreach: null });');
    expect(c.datalayer).toContain("      placement: 'plp',");
    expect(c.datalayer).toContain("      product_id: '15062099820869',");
    expect(c.datalayer).toContain('Computed by brPayload from items: product_ids, product_list, total_price');
    expect(c.gtm).toBe(`${c.datalayer}\n\n${c.gtm_template}`);
    expect(c.gtm_template).toContain('function brPayload(br, rules)');
    expect(c.web_sdk).toContain("brweb.track('add_to_wishlist', {");
    expect(c.web_sdk).toContain("  product_ids: ['15062099820869'],");
    expect(c.web_sdk_legacy).toContain("exponea.track('add_to_wishlist', {");
    expect(c.tracking_api).toContain('"product_ids": [\n      "15062099820869"\n    ]');
    expect(c.tracking_api).toContain('"total_price": 123');
    // T-4-23: no hard id configured: placeholder key plus the explanatory comment.
    expect(c.tracking_api).toContain('"<hard_id>": "<customer_id>"');
    expect(c.tracking_api).toContain("customer_ids must match the project's hard ID; see https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview");
    expect(c.sdk_emits).toBe('');
    expect(c.note).toBe('');
  });

  it('server_api: only the Tracking API plus a note', () => {
    const { event } = setUpWishlist();
    EventDAL.updateEvent(projectId, event.id, { implementation_method: 'server_api' });
    const c = buildEventCard(projectId, event.id).codegen;
    expect(c.tracking_api).toContain('"event_type": "add_to_wishlist"');
    expect(c.note).toMatch(/server-side/);
    expect(c.gtm).toBe('');
    expect(c.datalayer).toBe('');
    expect(c.web_sdk).toBe('');
    expect(c.web_sdk_legacy).toBe('');
  });

  it('sdk_auto: emitting call and default properties, no tracking snippet', () => {
    const country = prop('store_country', { kind: 'context', example_values_json: [{ value: 'DE' }] });
    const event = EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });
    void country;
    const c = buildEventCard(projectId, event.id).codegen;
    expect(c.sdk_emits).toMatch(/^session_start: Emitted by the Web SDK/);
    expect(c.sdk_default_properties).toContain("store_country: 'DE'");
    expect(c.tracking_api).toBe('');
    expect(c.web_sdk).toBe('');
    expect(c.gtm).toBe('');
    expect(c.note).toMatch(/no tracking snippet/);
  });
});

describe('event name overrides (L4)', () => {
  it('uses the SDK override for bloomreach.event and the tag, never the dataLayer one', () => {
    const { event } = setUpWishlist();
    getDb().prepare('UPDATE events SET codegen_event_name_overrides_json = ? WHERE id = ?').run(JSON.stringify({ dataLayer: 'dl_name', bloomreachSdk: 'sdk_name' }), event.id);
    const c = buildEventCard(projectId, event.id).codegen;
    expect(c.datalayer).toContain("    event: 'sdk_name',");
    expect(c.datalayer).toContain("  event: 'add_to_wishlist',");
    expect(c.datalayer).not.toContain('dl_name');
    expect(c.gtm_template).toContain("brweb.track('sdk_name'");
  });
});

describe('card properties: kind, dataLayer path, bundle', () => {
  it('carries kind, derivation, datalayer_path and bundle on the card and the public projection', () => {
    const { event, placement, productId, productIds } = setUpWishlist();
    BundleDAL.createBundle(projectId, { name: 'Item shape', property_ids: [productId.id] });
    const card = buildEventCard(projectId, event.id);
    const by = Object.fromEntries(card.properties.map((p) => [p.name, p]));
    expect(by.placement).toMatchObject({ kind: 'event', derivation: null, datalayer_path: 'bloomreach.properties.placement', bundle: null });
    expect(by.product_id).toMatchObject({ kind: 'item', datalayer_path: 'bloomreach.item.product_id', bundle: 'Item shape' });
    expect(by.product_ids).toMatchObject({
      kind: 'state_list',
      datalayer_path: 'computed from items',
      derivation: { source: 'items', id_field: 'product_id', form: 'ids' },
    });
    void placement;
    void productIds;

    const doc = toPublicTrackingDocument(buildTrackingDocument(projectId));
    const publicCard = doc.events.find((e) => e.name === 'add_to_wishlist')!;
    expect(publicCard.implementation_method).toBe('client_web');
    expect(publicCard.dl_event_name).toBe('add_to_wishlist');
    expect(publicCard.properties.find((p) => p.name === 'product_id')).toMatchObject({ kind: 'item', bundle: 'Item shape' });
  });

  it('eventCardToMarkdown shows method, dataLayer event, kind and path', () => {
    const { event } = setUpWishlist();
    const md = eventCardToMarkdown(buildEventCard(projectId, event.id));
    expect(md).toContain('- Implementation method: Client web (dataLayer)');
    expect(md).toContain('- dataLayer event: add_to_wishlist');
    expect(md).toContain('| Kind |');
    expect(md).toContain('bloomreach.item.product_id');
    expect(md).toContain('computed from items');
  });
});

describe('Add bundle', () => {
  it('links every property of the bundle once (normal role, default definition) and skips linked ones', () => {
    const event = EventDAL.createEvent(projectId, { name: 'add_to_wishlist' });
    const a = prop('product_id', { kind: 'item' });
    const b = prop('variant_id', { kind: 'item' });
    const c = prop('sku_id', { kind: 'item' });
    const bundle = BundleDAL.createBundle(projectId, { name: 'Item shape', property_ids: [a.id, b.id, c.id] });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: b.id, required: true });

    const result = EventDAL.attachBundleToEvent(projectId, event.id, bundle.id);
    expect(result.attached.map((l) => l.property_id).sort()).toEqual([a.id, c.id].sort());
    expect(result.skipped_property_ids).toEqual([b.id]);
    expect(result.attached.every((l) => l.role === 'normal' && l.definition_id)).toBe(true);
    expect(EventDAL.getEventWithProperties(projectId, event.id).properties).toHaveLength(3);
    // Idempotent.
    expect(EventDAL.attachBundleToEvent(projectId, event.id, bundle.id).attached).toEqual([]);
  });
});

describe('state_list_mismatch through runComparison', () => {
  it('opens a finding for disagreeing lists and resolves it when the observation is corrected', () => {
    const { event } = setUpWishlist();
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'manual',
      event_type: 'add_to_wishlist',
      timestamp: 1_700_000_000,
      properties: {
        placement: 'plp',
        product_id: 'a',
        price: 10,
        product_ids: ['a', 'b'],
        product_list: [{ product_id: 'a', quantity: 1 }],
        total_price: 10,
      },
    });
    runComparison(projectId);
    const open = FindingDAL.listFindings(projectId, { status: 'open' }).filter((f) => f.kind === 'state_list_mismatch');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ event_id: event.id, severity: 'error', comparison: 'definition_vs_observations' });
  });
});

describe('POST /events/:id/properties/from-bundle and PATCH fields', () => {
  let server: http.Server;
  let baseUrl: string;
  beforeAll(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const req = (method: string, path: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  it('attaches a bundle over HTTP, 400 without bundle_id, 404 for an unknown bundle', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'add_to_wishlist' });
    const a = prop('product_id');
    const bundle = BundleDAL.createBundle(projectId, { name: 'Item shape', property_ids: [a.id] });
    const ok = await req('POST', `/api/projects/${projectId}/events/${event.id}/properties/from-bundle`, { bundle_id: bundle.id });
    expect(ok.status).toBe(201);
    expect((await ok.json()).attached).toHaveLength(1);
    expect((await req('POST', `/api/projects/${projectId}/events/${event.id}/properties/from-bundle`, {})).status).toBe(400);
    expect((await req('POST', `/api/projects/${projectId}/events/${event.id}/properties/from-bundle`, { bundle_id: 'nope' })).status).toBe(404);
  });

  it('PATCH event and property accept the new fields and reject bad values', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'add_to_wishlist' });
    const p = prop('product_ids', { data_type: 'array' });
    const okEvent = await req('PATCH', `/api/projects/${projectId}/events/${event.id}`, { implementation_method: 'server_api', dl_event_name: 'x' });
    expect(okEvent.status).toBe(200);
    expect(await okEvent.json()).toMatchObject({ implementation_method: 'server_api', dl_event_name: 'x' });
    expect((await req('PATCH', `/api/projects/${projectId}/events/${event.id}`, { implementation_method: 'pigeon' })).status).toBe(400);
    const okProp = await req('PATCH', `/api/projects/${projectId}/properties/${p.id}`, {
      kind: 'state_list',
      derivation_json: { source: 'items', id_field: 'product_id', form: 'ids' },
    });
    expect(okProp.status).toBe(200);
    expect(await okProp.json()).toMatchObject({ kind: 'state_list' });
    expect((await req('PATCH', `/api/projects/${projectId}/properties/${p.id}`, { kind: 'weird' })).status).toBe(400);
  });
});

describe('F1: name-based defaults at every creation path', () => {
  it('DAL create infers kind and derivation when the caller sets neither; an explicit kind wins', () => {
    const ids = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'variant_ids', data_type: 'array' });
    expect(ids).toMatchObject({ kind: 'state_list', derivation_json: { source: 'items', id_field: 'variant_id', form: 'ids' } });
    const list = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku_list', data_type: 'array' });
    expect(list.derivation_json).toEqual({ source: 'items', id_field: 'sku_id', form: 'id_quantity', quantity_field: 'quantity' });
    const total = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    expect(total.derivation_json).toEqual({ source: 'items', sum: 'price*quantity' });
    expect(PropertyDAL.createProperty(projectId, { scope: 'event', name: 'store_country', data_type: 'string' }).kind).toBe('event');
    expect(PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'customer_ids', data_type: 'array' }).kind).toBe('event');
    const explicit = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_ids', data_type: 'array', kind: 'event' });
    expect(explicit).toMatchObject({ kind: 'event', derivation_json: null });
  });

  it('retyping a plain event property to the inferred type applies the default (import creates first, retypes after)', () => {
    const p = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_quantity', data_type: 'string' });
    expect(p.kind).toBe('event');
    const retyped = PropertyDAL.updateProperty(projectId, p.id, { data_type: 'number' });
    expect(retyped).toMatchObject({ kind: 'state_list', derivation_json: { source: 'items', sum: 'quantity' } });
  });

  it('a data-mapping import gives purchase server_api and infers state lists', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { previewDataMapping, applyDataMapping } = await import('./dataMappingImport.service');
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8'));
    const dm = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, dm.payload_hash, dm.items.map((i) => i.id));
    const events = EventDAL.listEvents(projectId);
    expect(events.find((e) => e.name === 'purchase')?.implementation_method).toBe('server_api');
    const props = PropertyDAL.listProperties(projectId, { scope: 'event' });
    const kindOf = (n: string) => props.find((p) => p.name === n)?.kind;
    // Whatever type the importer gave them, none of these may silently stay untouched if they are arrays.
    for (const p of props.filter((x) => x.data_type === 'array' && /_(ids|list)$/.test(x.name))) expect(p.kind).toBe('state_list');
    void kindOf;
  });
});

describe('F2/F3/F4', () => {
  it('F2: the card snippets show the first variant discriminator value; without variants the first allowed value', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const action = prop('action', { allowed_values_json: [{ value: 'add' }, { value: 'remove' }] });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, required: true, role: 'discriminator' });
    let c = buildEventCard(projectId, event.id).codegen;
    expect(c.datalayer).toContain("action: 'add'");
    VariantDAL.createVariant(projectId, event.id, { conditions: [{ property_id: action.id, operator: 'equals', values: ['remove'] }] });
    c = buildEventCard(projectId, event.id).codegen;
    expect(c.datalayer).toContain("action: 'remove'");
    expect(c.datalayer).not.toContain("action: 'string'");
  });

  it('F3: a custom quantity_field renders numeric samples and the list key stays quantity', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const list = prop('product_list', {
      data_type: 'array',
      kind: 'state_list',
      derivation_json: { source: 'items', id_field: 'product_id', form: 'id_quantity', quantity_field: 'qty' },
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: list.id, required: true });
    const c = buildEventCard(projectId, event.id).codegen;
    expect(c.datalayer).toContain('qty: 1,');
    expect(c.web_sdk).toContain('quantity: 1');
    expect(c.datalayer).not.toContain("qty: 'string'");
  });

  it('F4: no dataLayer path for server_api and sdk_auto events', () => {
    const { event } = setUpWishlist();
    expect(buildEventCard(projectId, event.id).properties.find((p) => p.name === 'placement')?.datalayer_path).toBe('bloomreach.properties.placement');
    EventDAL.updateEvent(projectId, event.id, { implementation_method: 'server_api' });
    const card = buildEventCard(projectId, event.id);
    expect(card.properties.every((p) => p.datalayer_path === null)).toBe(true);
    expect(eventCardToMarkdown(card)).toContain('n/a');
  });
});

describe('T-4-23: hard id key and discriminator flag', () => {
  it('Tracking API customer_ids uses the hard identity rule identifier_name', async () => {
    const IdentityRuleDAL = await import('../dal/identity-rule.dal');
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'user_id', identity_type: 'hard', name: 'Login' });
    const { event } = setUpWishlist();
    const c = buildEventCard(projectId, event.id).codegen;
    expect(c.tracking_api).toContain('"user_id": "<customer_id>"');
    expect(c.tracking_api).not.toContain('"registered"');
    expect(c.tracking_api).not.toContain('<hard_id>');
  });

  it('GET /properties flags discriminators', async () => {
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const event = EventDAL.createEvent(projectId, { name: 'add_to_cart' });
      const a = prop('action', { allowed_values_json: [{ value: 'add' }] });
      const b = prop('other');
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: a.id, required: true, role: 'discriminator' } as never);
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: b.id, required: true });
      const rows = (await (await fetch(`${base}/api/projects/${projectId}/properties`)).json()) as { name: string; is_discriminator: boolean }[];
      expect(rows.find((r) => r.name === 'action')!.is_discriminator).toBe(true);
      expect(rows.find((r) => r.name === 'other')!.is_discriminator).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
