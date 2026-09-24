import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as SourceDAL from './source.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as CatalogDAL from './catalog.dal';
import * as BundleDAL from './bundle.dal';
import { ConflictError, NotFoundError } from '../errors';

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

describe('source.dal', () => {
  it('creates, reads, updates and deletes a source; enforces per-project uniqueness', () => {
    const source = SourceDAL.createSource(projectId, { name: 'Website', color: 'blue' });
    expect(SourceDAL.listSources(projectId)).toHaveLength(1);

    const updated = SourceDAL.updateSource(projectId, source.id, { color: 'green' });
    expect(updated.color).toBe('green');

    expect(() => SourceDAL.createSource(projectId, { name: 'Website' })).toThrow(ConflictError);

    SourceDAL.deleteSource(projectId, source.id);
    expect(SourceDAL.listSources(projectId)).toHaveLength(0);
  });
});

describe('property.dal', () => {
  it('creates, reads, updates and deletes a property; enforces (project, scope, name) uniqueness', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'product_id',
      data_type: 'string',
    });
    expect(property.scope).toBe('event');
    expect(property.property_type).toBe('custom'); // sensible default

    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' })
    ).toThrow(ConflictError);

    // Same name is fine under a different scope.
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'product_id', data_type: 'string' });

    const updated = PropertyDAL.updateProperty(projectId, property.id, { description: 'Product id' });
    expect(updated.description).toBe('Product id');

    PropertyDAL.deleteProperty(projectId, property.id);
    expect(PropertyDAL.getPropertyById(projectId, property.id)).toBeNull();
  });

  it('keeps property bundles working (D-26)', () => {
    const p1 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'string' });
    const p2 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'b', data_type: 'string' });
    const bundle = BundleDAL.createBundle(projectId, { name: 'Core', property_ids: [p1.id, p2.id] });
    expect(bundle.property_ids.sort()).toEqual([p1.id, p2.id].sort());

    const withBundles = PropertyDAL.getPropertyOrThrow(projectId, p1.id);
    expect(withBundles.bundle_ids).toContain(bundle.id);
  });
});

describe('event.dal + event_properties', () => {
  it('creates an event, attaches a property, replaces the link list, and detaches', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    });

    const link = EventDAL.attachPropertyToEvent(projectId, event.id, {
      property_id: property.id,
      required: true,
    });
    expect(link.required).toBe(true);

    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(properties).toHaveLength(1);
    expect(properties[0].property.name).toBe('total_price');

    EventDAL.replaceEventProperties(projectId, event.id, [
      { property_id: property.id, required: false, role: 'context' },
    ]);
    const after = EventDAL.getEventWithProperties(projectId, event.id);
    expect(after.properties[0].required).toBe(false);
    expect(after.properties[0].role).toBe('context');

    EventDAL.detachPropertyFromEvent(projectId, event.id, property.id);
    expect(EventDAL.getEventWithProperties(projectId, event.id).properties).toHaveLength(0);
  });

  it('enforces unique event name per project', () => {
    EventDAL.createEvent(projectId, { name: 'purchase' });
    expect(() => EventDAL.createEvent(projectId, { name: 'purchase' })).toThrow(ConflictError);
  });

  it('404s attaching a property from another project', () => {
    const client2 = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: client2.id, key: 'other-eu', name: 'Other EU' }).id;
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const foreignProperty = PropertyDAL.createProperty(otherProjectId, {
      scope: 'event',
      name: 'x',
      data_type: 'string',
    });
    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: foreignProperty.id })
    ).toThrow(NotFoundError);
  });
});

describe('catalog.dal', () => {
  it('creates a catalog with fields, updates and deletes', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    const field = CatalogDAL.createCatalogField(projectId, catalog.id, {
      name: 'sku',
      is_lookup_key: true,
    });
    expect(CatalogDAL.listCatalogFields(projectId, catalog.id)).toHaveLength(1);
    expect(field.is_lookup_key).toBe(true);

    CatalogDAL.updateCatalog(projectId, catalog.id, { status: 'implemented' });
    CatalogDAL.deleteCatalogField(projectId, catalog.id, field.id);
    expect(CatalogDAL.listCatalogFields(projectId, catalog.id)).toHaveLength(0);

    CatalogDAL.deleteCatalog(projectId, catalog.id);
    expect(CatalogDAL.listCatalogs(projectId)).toHaveLength(0);
  });

  it('enforces one catalog per mapping_role per project', () => {
    CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'main' });
    expect(() => CatalogDAL.createCatalog(projectId, { name: 'Products 2', mapping_role: 'main' })).toThrow();
  });
});
