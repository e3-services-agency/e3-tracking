import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as SourceDAL from './source.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as CatalogDAL from './catalog.dal';
import * as BundleDAL from './bundle.dal';
import * as IdentityRuleDAL from './identity-rule.dal';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';

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

  it('rejects a blank name on update with a ValidationError (400), not a ConflictError', () => {
    const source = SourceDAL.createSource(projectId, { name: 'Website' });
    expect(() => SourceDAL.updateSource(projectId, source.id, { name: '   ' })).toThrow(ValidationError);
    // Unchanged: the blank-name attempt never wrote an empty name.
    expect(SourceDAL.getSourceOrThrow(projectId, source.id).name).toBe('Website');
  });

  it('counts identity_rules.source_id in getSourceUsage (LOW 7, T-1-06 integration fix)', () => {
    const source = SourceDAL.createSource(projectId, { name: 'Website' });
    expect(SourceDAL.getSourceUsage(projectId)[0].identity_rule_count).toBe(0);

    IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration email',
      source_id: source.id,
    });

    const usage = SourceDAL.getSourceUsage(projectId).find((u) => u.source_id === source.id);
    expect(usage?.identity_rule_count).toBe(1);
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

  it('reuses a (project, scope, name) after soft delete instead of a raw 500 (fix round finding #4)', () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku', data_type: 'string' });
    PropertyDAL.deleteProperty(projectId, property.id);
    const recreated = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku', data_type: 'string' });
    expect(recreated.id).not.toBe(property.id);
    expect(PropertyDAL.listProperties(projectId).map((p) => p.name)).toEqual(['sku']);
  });

  it('rejects a blank name on create and update with a ValidationError (400)', () => {
    expect(() => PropertyDAL.createProperty(projectId, { scope: 'event', name: '  ', data_type: 'string' })).toThrow(
      ValidationError
    );
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku', data_type: 'string' });
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { name: '   ' })).toThrow(ValidationError);
  });

  it('rejects mapped_catalog_id / mapped_catalog_field_id from another project (fix round finding #6)', () => {
    const otherClient = ClientDAL.createClient({ key: 'other2', name: 'Other 2' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other2-eu', name: 'Other 2 EU' }).id;
    const foreignCatalog = CatalogDAL.createCatalog(otherProjectId, { name: 'Foreign catalog' });
    const foreignField = CatalogDAL.createCatalogField(otherProjectId, foreignCatalog.id, { name: 'id' });

    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'sku',
        data_type: 'string',
        mapped_catalog_id: foreignCatalog.id,
      })
    ).toThrow(BadRequestError);

    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'sku2', data_type: 'string' });
    expect(() =>
      PropertyDAL.updateProperty(projectId, property.id, { mapped_catalog_field_id: foreignField.id })
    ).toThrow(BadRequestError);
  });

  it('keeps property bundles working (D-26)', () => {
    const p1 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'a', data_type: 'string' });
    const p2 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'b', data_type: 'string' });
    const bundle = BundleDAL.createBundle(projectId, { name: 'Core', property_ids: [p1.id, p2.id] });
    expect(bundle.property_ids.sort()).toEqual([p1.id, p2.id].sort());

    const withBundles = PropertyDAL.getPropertyOrThrow(projectId, p1.id);
    expect(withBundles.bundle_ids).toContain(bundle.id);
  });

  it('reuses a bundle name after soft delete instead of a raw 500 (fix round finding #4)', () => {
    const bundle = BundleDAL.createBundle(projectId, { name: 'Core' });
    BundleDAL.deleteBundle(projectId, bundle.id);
    const recreated = BundleDAL.createBundle(projectId, { name: 'Core' });
    expect(recreated.id).not.toBe(bundle.id);
  });
});

describe('event.dal + event_properties', () => {
  it('creates an event, attaches a property, replaces the link list, and detaches', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
      allowed_values_json: [{ value: 'low' }, { value: 'high' }],
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

  it('dedupes a repeated property_id in replaceEventProperties instead of a raw 500 (fix round 2, finding #F)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'signup' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'email',
      data_type: 'string',
      allowed_values_json: [{ value: 'a' }, { value: 'b' }],
    });

    const result = EventDAL.replaceEventProperties(projectId, event.id, [
      { property_id: property.id, required: false, role: 'normal' },
      { property_id: property.id, required: true, role: 'context' },
    ]);
    expect(result).toHaveLength(1);
    // Last one wins.
    expect(result[0].required).toBe(true);
    expect(result[0].role).toBe('context');
  });

  it('enforces unique event name per project', () => {
    EventDAL.createEvent(projectId, { name: 'purchase' });
    try {
      EventDAL.createEvent(projectId, { name: 'purchase' });
      expect.unreachable('expected a ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe('CONFLICT');
    }
  });

  it('reuses an event name after soft delete instead of a raw 500 (fix round finding #4)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    EventDAL.deleteEvent(projectId, event.id);
    const recreated = EventDAL.createEvent(projectId, { name: 'purchase' });
    expect(recreated.id).not.toBe(event.id);
  });

  it('rejects a blank event name on create and update with a ValidationError (400)', () => {
    expect(() => EventDAL.createEvent(projectId, { name: '   ' })).toThrow(ValidationError);
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    expect(() => EventDAL.updateEvent(projectId, event.id, { name: '  ' })).toThrow(ValidationError);
  });

  it('rejects event_properties.source_id from another project (fix round finding #6)', () => {
    const otherClient = ClientDAL.createClient({ key: 'other3', name: 'Other 3' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other3-eu', name: 'Other 3 EU' }).id;
    const foreignSource = SourceDAL.createSource(otherProjectId, { name: 'Foreign source' });

    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });

    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, source_id: foreignSource.id })
    ).toThrow(BadRequestError);

    const link = EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });
    expect(() =>
      EventDAL.updateEventProperty(projectId, event.id, property.id, { source_id: foreignSource.id })
    ).toThrow(BadRequestError);
    expect(link.source_id).toBeNull();
  });

  it('persists triggers_json (with an image path) through create, update and read (fix round finding #2)', () => {
    const trigger = { title: 'Click buy', description: 'User clicks the buy button', image_path: 'proj-1/event_trigger/abc-shot.png', order: 0 };
    const created = EventDAL.createEvent(projectId, { name: 'checkout', triggers_json: [trigger] });
    expect(created.triggers_json).toEqual([trigger]);

    const reread = EventDAL.getEventOrThrow(projectId, created.id);
    expect(reread.triggers_json).toEqual([trigger]);

    const updatedTrigger = { ...trigger, title: 'Click buy now' };
    const updated = EventDAL.updateEvent(projectId, created.id, { triggers_json: [updatedTrigger] });
    expect(updated.triggers_json).toEqual([updatedTrigger]);
    expect(EventDAL.getEventOrThrow(projectId, created.id).triggers_json).toEqual([updatedTrigger]);
  });

  it('T-4-03 pre-QA fix: rejects a non-http(s) triggers_json[].source on create and update, allows empty', () => {
    expect(() =>
      EventDAL.createEvent(projectId, {
        name: 'checkout_bad_trigger',
        triggers_json: [{ title: 't', description: 'd', order: 0, source: 'javascript:alert(1)' }],
      })
    ).toThrow(ValidationError);

    const event = EventDAL.createEvent(projectId, {
      name: 'checkout_ok_trigger',
      triggers_json: [{ title: 't', description: 'd', order: 0, source: 'https://shop.example/cart' }],
    });
    expect(event.triggers_json).toEqual([{ title: 't', description: 'd', order: 0, source: 'https://shop.example/cart' }]);

    // Empty/absent source is allowed (not every trigger has a page URL).
    const noSource = EventDAL.updateEvent(projectId, event.id, {
      triggers_json: [{ title: 't', description: 'd', order: 0, source: '' }],
    });
    expect((noSource.triggers_json as { source: string }[])[0].source).toBe('');

    // A PATCH-style update with a bad scheme also 400s.
    expect(() =>
      EventDAL.updateEvent(projectId, event.id, {
        triggers_json: [{ title: 't', description: 'd', order: 0, source: 'javascript:alert(1)' }],
      })
    ).toThrow(ValidationError);
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

  it('enforces one catalog per mapping_role per project (409 CONFLICT, not a raw 500)', () => {
    CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'main' });
    try {
      CatalogDAL.createCatalog(projectId, { name: 'Products 2', mapping_role: 'main' });
      expect.unreachable('expected a ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).code).toBe('CONFLICT');
    }
  });

  it('allows a new main catalog after the previous main catalog was soft-deleted (fix round 2, 0004 migration)', () => {
    const first = CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'main' });
    CatalogDAL.deleteCatalog(projectId, first.id);
    const second = CatalogDAL.createCatalog(projectId, { name: 'Products v2', mapping_role: 'main' });
    expect(second.mapping_role).toBe('main');
    expect(CatalogDAL.listCatalogs(projectId).map((c) => c.id)).toEqual([second.id]);
  });

  it('rejects a duplicate catalog field name with a ConflictError, not a raw 500', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku' });
    expect(() => CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku' })).toThrow(ConflictError);

    const field2 = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'title' });
    expect(() => CatalogDAL.updateCatalogField(projectId, catalog.id, field2.id, { name: 'sku' })).toThrow(
      ConflictError
    );
  });

  it('rejects blank names on update with a ValidationError (400), not a ConflictError (fix round finding #7)', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    expect(() => CatalogDAL.updateCatalog(projectId, catalog.id, { name: '   ' })).toThrow(ValidationError);
    const field = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku' });
    expect(() => CatalogDAL.updateCatalogField(projectId, catalog.id, field.id, { name: '  ' })).toThrow(
      ValidationError
    );
  });

  it('rejects an unknown mapping_role with a ValidationError, not the mapping_role 409 (T-1-06 delta)', () => {
    expect(() =>
      CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'lookup' })
    ).toThrow(ValidationError);
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    expect(() => CatalogDAL.updateCatalog(projectId, catalog.id, { mapping_role: 'lookup' })).toThrow(
      ValidationError
    );
    // null clears the role and is always valid.
    const updated = CatalogDAL.updateCatalog(projectId, catalog.id, { mapping_role: 'main' });
    expect(updated.mapping_role).toBe('main');
    expect(CatalogDAL.updateCatalog(projectId, catalog.id, { mapping_role: null }).mapping_role).toBeNull();
  });

  it('surfaces an inline catalog field rename clash as a ConflictError (qa-tester observation on T-1-02)', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku' });
    const other = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'title' });
    expect(() =>
      CatalogDAL.updateCatalogField(projectId, catalog.id, other.id, { name: 'sku' })
    ).toThrow(ConflictError);
  });

  it('validates bloomreach_column against the CATALOG_MAIN_COLUMNS seed (LOW 4, T-1-06 integration fix)', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    expect(() =>
      CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku', bloomreach_column: 'not_a_column' })
    ).toThrow(ValidationError);
    const field = CatalogDAL.createCatalogField(projectId, catalog.id, {
      name: 'sku',
      bloomreach_column: 'item_id',
    });
    expect(field.bloomreach_column).toBe('item_id');
    expect(() =>
      CatalogDAL.updateCatalogField(projectId, catalog.id, field.id, { bloomreach_column: 'not_a_column' })
    ).toThrow(ValidationError);
    // null clears the mapping and is always valid.
    expect(
      CatalogDAL.updateCatalogField(projectId, catalog.id, field.id, { bloomreach_column: null }).bloomreach_column
    ).toBeNull();
  });
});
