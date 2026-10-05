/**
 * D-64 (T-4-20): property categories, the format hint on system customer properties, the catalogs
 * section content and the public projection, on the tracking document.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import { buildTrackingDocument, toPublicTrackingDocument } from './document.service';
import { BadRequestError } from '../errors';

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

describe('property category (D-64)', () => {
  it('derives categories and puts customer and event properties in their arrays', () => {
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'loyalty_tier', data_type: 'string' });
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'browser', data_type: 'string' });
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' });
    const doc = buildTrackingDocument(projectId);
    expect(Object.fromEntries(doc.properties.map((p) => [p.name, p.category]))).toEqual({
      email: 'system_customer',
      loyalty_tier: 'customer',
    });
    const ev = Object.fromEntries(doc.event_properties.map((p) => [p.name, p]));
    expect(ev.browser.category).toBe('sdk_default');
    expect(ev.browser.kind).toBe('context');
    expect(ev.product_id.category).toBe('event');
    expect(ev.product_id.kind).toBe('event');
  });

  it('an override wins, and the sdk_default override turns a default kind into context', () => {
    const p = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'page_lang', data_type: 'string' });
    expect(p.kind).toBe('event');
    const updated = PropertyDAL.updateProperty(projectId, p.id, { category_override: 'sdk_default' });
    expect(updated.category_override).toBe('sdk_default');
    expect(updated.kind).toBe('context');
    expect(buildTrackingDocument(projectId).event_properties.find((x) => x.name === 'page_lang')!.category).toBe('sdk_default');
    const cleared = PropertyDAL.updateProperty(projectId, p.id, { category_override: null });
    expect(cleared.category_override).toBeNull();
  });

  it('an explicit kind is never overridden by the sdk_default inference', () => {
    const p = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'os', data_type: 'string', kind: 'item' });
    expect(p.kind).toBe('item');
  });

  it('rejects an unknown category_override', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'x', data_type: 'string', category_override: 'nope' })
    ).toThrow(BadRequestError);
    const p = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'y', data_type: 'string' });
    expect(() => PropertyDAL.updateProperty(projectId, p.id, { category_override: 'nope' })).toThrow(BadRequestError);
  });

  it('keeps the Data Manager group text in `category` apart from the override', () => {
    const p = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'foo', data_type: 'string', category: 'My group' });
    expect(p.category).toBe('My group');
    expect(p.category_override).toBeNull();
  });
});

describe('system customer format hints (D-64)', () => {
  it('attaches the recommended format when none is given, mirrored on the general definition', () => {
    const cases: Record<string, string> = {
      email: 'email',
      phone: 'e164_phone',
      first_name: 'title_case',
      last_name: 'title_case',
      country: 'country_code',
      language: 'language_tag',
      timezone: 'iana_timezone',
    };
    for (const [name, format] of Object.entries(cases)) {
      const p = PropertyDAL.createProperty(projectId, { scope: 'customer', name, data_type: 'string' });
      expect(p.data_formats_json).toEqual([format]);
    }
    const doc = buildTrackingDocument(projectId);
    expect(doc.properties.find((p) => p.name === 'phone')!.definitions[0].formats).toEqual(['e164_phone']);
  });

  it('never overrides given formats and does not touch other properties', () => {
    const given = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string', data_formats_json: ['uri'] });
    expect(given.data_formats_json).toEqual(['uri']);
    const other = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'nickname', data_type: 'string' });
    expect(other.data_formats_json).toEqual([]);
    const eventEmail = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'email', data_type: 'string' });
    expect(eventEmail.data_formats_json).toEqual([]);
  });

  it('no hint when the category is overridden away from system_customer', () => {
    const p = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'phone', data_type: 'string', category_override: 'customer' });
    expect(p.data_formats_json).toEqual([]);
  });
});

describe('catalogs in the tracking document (D-64)', () => {
  it('carries fields and mapped properties, and no owner or client_name, internal or public', () => {
    const catalog = CatalogDAL.createCatalog(projectId, {
      name: 'products',
      owner: 'Secret Owner',
      client_name: 'Client Catalog Name',
      priority: 'high',
      source_system: 'PIM',
      sync_method: 'daily import',
      mapping_role: 'main',
    });
    const field = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'item_id', data_type: 'string', is_lookup_key: true, is_searchable: true });
    PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'product_id',
      data_type: 'string',
      mapped_catalog_id: catalog.id,
      mapped_catalog_field_id: field.id,
      mapping_type: 'lookup',
    });
    const doc = buildTrackingDocument(projectId);
    const pub = toPublicTrackingDocument(doc);
    for (const d of [doc, pub]) {
      const c = d.catalogs[0];
      expect(c.name).toBe('products');
      expect(c.source_system).toBe('PIM');
      expect(c.sync_method).toBe('daily import');
      expect(c.fields).toEqual([
        { name: 'item_id', description: null, data_type: 'string', is_lookup_key: true, is_searchable: true, is_required: false },
      ]);
      expect(c.mapped_properties).toEqual([{ property_name: 'product_id', scope: 'event', field_name: 'item_id', mapping_type: 'lookup' }]);
      const json = JSON.stringify(c);
      expect(json).not.toContain('Secret Owner');
      expect(json).not.toContain('Client Catalog Name');
      expect(c).not.toHaveProperty('owner');
      expect(c).not.toHaveProperty('client_name');
    }
  });

  it('event_properties lists the events that link a property', () => {
    const ev = EventDAL.createEvent(projectId, { name: 'view_item', class: 'custom' });
    const prop = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'item_name', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, ev.id, { property_id: prop.id });
    const doc = buildTrackingDocument(projectId);
    expect(doc.event_properties.find((p) => p.name === 'item_name')!.used_in_events).toEqual(['view_item']);
  });
});

describe('cross-reference fields (T-4-22)', () => {
  it('carries the card property category, the requirement target ids and the naming convention, through the public projection', async () => {
    const UseCaseDAL = await import('../dal/use-case.dal');
    const RequirementDAL = await import('../dal/requirement.dal');
    const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });
    const browser = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'browser', data_type: 'string' });
    const sku = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: browser.id, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: sku.id, role: 'normal' });
    const uc = UseCaseDAL.createUseCase(projectId, { name: 'Cart recovery' } as never);
    RequirementDAL.replaceRequirements(projectId, uc.id, [
      { target_kind: 'event_property', event_id: event.id, property_id: sku.id, level: 'R' } as never,
    ]);
    ProjectDAL.updateProject(projectId, { naming_convention: 'kebab_case' });

    const doc = toPublicTrackingDocument(buildTrackingDocument(projectId));
    const props = Object.fromEntries(doc.events[0].properties.map((p) => [p.name, p.category]));
    expect(props).toEqual({ browser: 'sdk_default', sku: 'event' });
    expect(doc.use_cases[0].requirements[0]).toMatchObject({ target_kind: 'event_property', event_id: event.id, property_id: sku.id, target_label: 'cart_update.sku' });
    expect(doc.project.naming_convention).toBe('kebab_case');
  });

  it('names the customer property of an event-less finding instead of its raw id', async () => {
    const { runComparison } = await import('./comparison.service');
    const prop = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'loyaltyTier', data_type: 'string' });
    runComparison(projectId);
    const doc = buildTrackingDocument(projectId);
    const finding = doc.unattached_findings.find((f) => f.kind === 'naming_violation');
    expect(finding).toMatchObject({ property_id: prop.id, property: 'loyaltyTier' });
  });
});
