/**
 * StandardEventMapping DAL tests (T-1-05): unknown standard event, unknown field, unlinked
 * property, project addition (D-26), create-or-replace semantics.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as VariantDAL from './variant.dal';
import * as StandardEventMappingDAL from './standard-event-mapping.dal';
import * as ChangeLogDAL from './change-log.dal';
import { BadRequestError, UnknownStandardEventError } from '../errors';

let projectId: string;
let eventId: string;
let productIdPropertyId: string;
let actionPropertyId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;

  productIdPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'product_id',
    data_type: 'string',
  }).id;
  actionPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: productIdPropertyId, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: actionPropertyId, role: 'discriminator' });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('standard-event-mapping.dal', () => {
  it('rejects an unknown standard_event (400 UNKNOWN_STANDARD_EVENT)', () => {
    expect(() =>
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'not_a_real_standard_event', {
        event_id: eventId,
      })
    ).toThrow(UnknownStandardEventError);
  });

  it('creates a mapping to a seed standard event with a field map', () => {
    const row = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      field_map_json: { product_id: productIdPropertyId },
    });
    expect(row.standard_event).toBe('add_to_cart');
    expect(row.field_map_json).toEqual({ product_id: productIdPropertyId });
  });

  it('rejects a field not in the standard event field list (400)', () => {
    expect(() =>
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
        event_id: eventId,
        field_map_json: { not_a_real_field: productIdPropertyId },
      })
    ).toThrow(BadRequestError);
  });

  it('rejects a field mapped to a property not linked to the event (400)', () => {
    const unlinkedPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'unlinked',
      data_type: 'string',
    }).id;
    expect(() =>
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
        event_id: eventId,
        field_map_json: { product_id: unlinkedPropertyId },
      })
    ).toThrow(BadRequestError);
  });

  it('accepts a project standard event addition (D-26)', () => {
    ProjectDAL.updateProject(projectId, {
      standard_event_additions_json: [{ key: 'loyalty_scan', fields: ['card_id'] }],
    });
    const row = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'loyalty_scan', {
      event_id: eventId,
    });
    expect(row.standard_event).toBe('loyalty_scan');
  });

  it('accepts a variant_id belonging to the mapped event', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    const row = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      variant_id: variant.id,
    });
    expect(row.variant_id).toBe(variant.id);
  });

  it('upsert replaces the existing mapping for the same standard_event', () => {
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'checkout', { event_id: eventId });
    const secondEventId = EventDAL.createEvent(projectId, { name: 'checkout_started' }).id;
    const row = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'checkout', {
      event_id: secondEventId,
    });
    expect(row.event_id).toBe(secondEventId);
    expect(StandardEventMappingDAL.listStandardEventMappings(projectId)).toHaveLength(1);
  });

  it('deletes a mapping', () => {
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'checkout', { event_id: eventId });
    StandardEventMappingDAL.deleteStandardEventMapping(projectId, 'checkout');
    expect(StandardEventMappingDAL.listStandardEventMappings(projectId)).toHaveLength(0);
  });

  // fix round LOW 6: a variant of a *different* event now reaches the intended 400, not the
  // event-scoped lookup's 404 (which made this branch unreachable).
  it('rejects a variant_id that belongs to a different event (400, field variant_id)', () => {
    const otherEventId = EventDAL.createEvent(projectId, { name: 'checkout_started' }).id;
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    expect(() =>
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'checkout', {
        event_id: otherEventId,
        variant_id: variant.id,
      })
    ).toThrow(BadRequestError);
  });

  // fix round WARNING 4: soft-deleting the mapped event removes the mapping too.
  it('listStandardEventMappings excludes a mapping whose event has been soft-deleted', () => {
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'checkout', { event_id: eventId });
    expect(StandardEventMappingDAL.listStandardEventMappings(projectId)).toHaveLength(1);
    EventDAL.deleteEvent(projectId, eventId);
    expect(StandardEventMappingDAL.listStandardEventMappings(projectId)).toHaveLength(0);
  });
});

describe('T-3-10 QA fix (ERROR 2, 2026-09-28 10:22): removePropertyFromFieldMaps runs on every path that drops an event_properties link', () => {
  function changesFor(entityType: string, entityId: string) {
    return ChangeLogDAL.listChanges(projectId, { entity_type: entityType, entity_id: entityId });
  }

  it('detachPropertyFromEvent (DELETE /events/:id/properties/:propertyId) clears the field_map entry and logs one mapping update', () => {
    const mapping = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      field_map_json: { product_id: productIdPropertyId },
    });
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'update')).toHaveLength(0);

    EventDAL.detachPropertyFromEvent(projectId, eventId, productIdPropertyId);

    const after = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(after.field_map_json.product_id).toBeNull();
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });

  // The exact qa-tester repro (2026-09-28 10:19, ERROR 2): the Events page's editor saves the whole
  // link list through `PUT /events/:id/properties` (`replaceEventProperties`), not the single-
  // property `DELETE` -- this used to bypass the field_map cleanup entirely.
  it('replaceEventProperties (PUT /events/:id/properties, the Events page editor\'s save path) clears the field_map entry and logs one mapping update', () => {
    const mapping = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      field_map_json: { product_id: productIdPropertyId },
    });
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'update')).toHaveLength(0);

    // Re-saves the link list without product_id -- action stays linked, product_id is dropped.
    EventDAL.replaceEventProperties(projectId, eventId, [{ property_id: actionPropertyId, role: 'discriminator' }]);

    const after = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(after.field_map_json.product_id).toBeNull();
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });

  it('deleteProperty (project-wide, unscoped) still clears the property from every mapping it appears in', () => {
    const mapping = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      field_map_json: { product_id: productIdPropertyId },
    });
    EventDAL.detachPropertyFromEvent(projectId, eventId, productIdPropertyId);
    PropertyDAL.deleteProperty(projectId, productIdPropertyId);

    const after = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(after.field_map_json.product_id).toBeNull();
    expect(mapping.id).toBe(after.id);
  });
});
