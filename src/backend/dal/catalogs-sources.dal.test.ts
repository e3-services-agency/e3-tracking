/**
 * T-4-11B (D-61, D-62): catalog kind/market/language/version and mark-live, source system/method,
 * the project default source, and the source method defaulting an event's implementation method.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as CatalogDAL from './catalog.dal';
import * as SourceDAL from './source.dal';
import * as EventDAL from './event.dal';
import { ValidationError } from '../errors';

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

describe('catalog.dal: kind, market, language, version (D-61)', () => {
  it('derives the kind from the mapping role or catalog_type, else other, and defaults version v1', () => {
    const main = CatalogDAL.createCatalog(projectId, { name: 'products_gb', mapping_role: 'main' });
    expect(main.kind).toBe('product');
    expect(main.version).toBe('v1');
    expect(main.live_at).toBeNull();
    expect(main.searchable_snapshot_json).toBeNull();
    expect(CatalogDAL.createCatalog(projectId, { name: 'variants_gb', mapping_role: 'variant' }).kind).toBe('variant');
    expect(CatalogDAL.createCatalog(projectId, { name: 'v2', catalog_type: 'Variant feed' }).kind).toBe('variant');
    expect(CatalogDAL.createCatalog(projectId, { name: 'stores' }).kind).toBe('other');
    expect(CatalogDAL.createCatalog(projectId, { name: 'explicit', kind: 'product', market: ' CZ ', language: 'cs-CZ', version: 'v2' })).toMatchObject({
      kind: 'product',
      market: 'CZ',
      language: 'cs-CZ',
      version: 'v2',
    });
  });

  it('validates kind and version on create and update', () => {
    expect(() => CatalogDAL.createCatalog(projectId, { name: 'x', kind: 'nope' })).toThrow(ValidationError);
    expect(() => CatalogDAL.createCatalog(projectId, { name: 'x', version: 'v3' })).toThrow(ValidationError);
    const c = CatalogDAL.createCatalog(projectId, { name: 'x' });
    expect(() => CatalogDAL.updateCatalog(projectId, c.id, { kind: 'nope' })).toThrow(ValidationError);
    expect(CatalogDAL.updateCatalog(projectId, c.id, { kind: 'variant', market: 'GB' })).toMatchObject({ kind: 'variant', market: 'GB' });
  });

  it('marks a catalog live with a sorted searchable snapshot, and clears it again', () => {
    const c = CatalogDAL.createCatalog(projectId, { name: 'products_gb' });
    CatalogDAL.createCatalogField(projectId, c.id, { name: 'title', is_searchable: true });
    CatalogDAL.createCatalogField(projectId, c.id, { name: 'brand', is_searchable: true });
    CatalogDAL.createCatalogField(projectId, c.id, { name: 'price' });
    const live = CatalogDAL.setCatalogLive(projectId, c.id, true);
    expect(live.live_at).toBeTruthy();
    expect(live.searchable_snapshot_json).toEqual(['brand', 'title']);
    expect(CatalogDAL.listCatalogs(projectId)[0].searchable_snapshot_json).toEqual(['brand', 'title']);
    const off = CatalogDAL.setCatalogLive(projectId, c.id, false);
    expect(off.live_at).toBeNull();
    expect(off.searchable_snapshot_json).toBeNull();
  });
});

describe('source.dal: system and method (D-62)', () => {
  it('defaults system to other and method to null, stores both, and validates', () => {
    const plain = SourceDAL.createSource(projectId, { name: 'Plain' });
    expect(plain).toMatchObject({ system: 'other', method: null });
    const s = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    expect(s).toMatchObject({ system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    expect(SourceDAL.updateSource(projectId, s.id, { method: null })).toMatchObject({ system: 'shopify', method: null });
    expect(() => SourceDAL.createSource(projectId, { name: 'Bad', system: 'nope' })).toThrow(ValidationError);
    expect(() => SourceDAL.updateSource(projectId, s.id, { method: 'carrier_pigeon' })).toThrow(ValidationError);
  });
});

describe('project default source and implementation method default (D-62)', () => {
  it('sets and clears default_source_id and rejects a foreign source', () => {
    const s = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    expect(ProjectDAL.getProjectOrThrow(projectId).default_source_id).toBeNull();
    expect(ProjectDAL.updateProject(projectId, { default_source_id: s.id }).default_source_id).toBe(s.id);
    expect(() => ProjectDAL.updateProject(projectId, { default_source_id: 'nope' })).toThrow(ValidationError);
    expect(ProjectDAL.updateProject(projectId, { default_source_id: null }).default_source_id).toBeNull();
    ProjectDAL.updateProject(projectId, { default_source_id: s.id });
    SourceDAL.deleteSource(projectId, s.id);
    expect(ProjectDAL.getProjectOrThrow(projectId).default_source_id).toBeNull();
  });

  it('links the default source to a new event that names none', () => {
    const s = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    ProjectDAL.updateProject(projectId, { default_source_id: s.id });
    const e = EventDAL.createEvent(projectId, { name: 'page_view_x' }, { applyDefaultSource: true });
    expect(EventDAL.listEventSourceIds(projectId, e.id)).toEqual([s.id]);
    // not applied without the route flag (import planners), nor to sdk/platform class events
    expect(EventDAL.listEventSourceIds(projectId, EventDAL.createEvent(projectId, { name: 'imported_event' }).id)).toEqual([]);
    const sdk = EventDAL.createEvent(projectId, { name: 'session_x', class: 'sdk' }, { applyDefaultSource: true });
    expect(EventDAL.listEventSourceIds(projectId, sdk.id)).toEqual([]);
    const explicit = EventDAL.createEvent(projectId, { name: 'other_event', source_ids: [] }, { applyDefaultSource: true });
    expect(EventDAL.listEventSourceIds(projectId, explicit.id)).toEqual([]);
  });

  it('a Tracking API source defaults a still-default event to server_api, never overriding an explicit method', () => {
    const api = SourceDAL.createSource(projectId, { name: 'Backend', system: 'custom_backend', method: 'tracking_api' });
    const e = EventDAL.createEvent(projectId, { name: 'wishlist_add' });
    expect(e.implementation_method).toBe('client_web');
    expect(EventDAL.updateEvent(projectId, e.id, { source_ids: [api.id] }).implementation_method).toBe('server_api');

    const explicit = EventDAL.createEvent(projectId, { name: 'sdk_thing', implementation_method: 'sdk_auto', source_ids: [api.id] });
    expect(explicit.implementation_method).toBe('sdk_auto');

    const e2 = EventDAL.createEvent(projectId, { name: 'e_two' });
    expect(EventDAL.updateEvent(projectId, e2.id, { source_ids: [api.id], implementation_method: 'client_web' }).implementation_method).toBe('client_web');

    const created = EventDAL.createEvent(projectId, { name: 'e_three', source_ids: [api.id] });
    expect(created.implementation_method).toBe('server_api');
    // already server_api: linking a web source later must not flip it back
    const web = SourceDAL.createSource(projectId, { name: 'Web', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    expect(EventDAL.updateEvent(projectId, created.id, { source_ids: [api.id, web.id] }).implementation_method).toBe('server_api');
  });
});
