/**
 * Variant DAL tests (D-03, T-1-05): condition validation (`CONDITION_NOT_DISCRIMINATOR`,
 * `CONDITION_VALUE_NOT_ALLOWED`, `MAX_DISCRIMINATORS`), name generation and uniqueness (409).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as VariantDAL from './variant.dal';
import * as StandardEventMappingDAL from './standard-event-mapping.dal';
import {
  BadRequestError,
  ConditionDuplicatePropertyError,
  ConditionNotDiscriminatorError,
  ConditionValueNotAllowedError,
  ConflictError,
  MappingInUseError,
  MaxDiscriminatorsError,
  ValidationError,
} from '../errors';

let projectId: string;
let eventId: string;
let actionPropertyId: string;
let channelPropertyId: string;
let normalPropertyId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;

  actionPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  }).id;
  channelPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'channel',
    data_type: 'string',
    allowed_values_json: [{ value: 'web' }, { value: 'app' }],
  }).id;
  normalPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'total_price',
    data_type: 'number',
  }).id;

  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: actionPropertyId, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: channelPropertyId, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: normalPropertyId, role: 'normal' });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('variant.dal: condition validation', () => {
  it('creates a variant and generates its name', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    expect(variant.name).toBe('cart_update[action=add]');
    expect(variant.conditions_json).toEqual([{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }]);
  });

  it('generates an "in" name for the in operator', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'in', values: ['add', 'remove'] }],
    });
    expect(variant.name).toBe('cart_update[action in (add|remove)]');
  });

  it('generates a two-discriminator name', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    });
    expect(variant.name).toBe('cart_update[action=add,channel=web]');
  });

  it('rejects a condition on a property not linked as discriminator (400 CONDITION_NOT_DISCRIMINATOR)', () => {
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: normalPropertyId, operator: 'equals', values: ['1'] }],
      })
    ).toThrow(ConditionNotDiscriminatorError);
  });

  it('rejects a value outside allowed_values (400 CONDITION_VALUE_NOT_ALLOWED)', () => {
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['not_a_value'] }],
      })
    ).toThrow(ConditionValueNotAllowedError);
  });

  // `event.dal.ts`'s own `assertDiscriminatorLimit` already refuses to attach a third
  // `discriminator`-role property to an event (D-03 rule 3), so a variant can never legitimately
  // see three distinct *discriminator* properties in `conditions`. `validateConditions`'s own
  // `MAX_DISCRIMINATORS` count is still asserted directly here as defense in depth in case that
  // invariant is ever relaxed independently of this file.
  it('rejects three distinct properties in one variant even if all three were discriminators (400 MAX_DISCRIMINATORS)', () => {
    // Attach a third property as `normal` (allowed) and flip its role directly in the DB to
    // simulate "three discriminators exist" without going through the attach-time guard.
    const thirdPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'size',
      data_type: 'string',
      allowed_values_json: [{ value: 'XS' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: thirdPropertyId, role: 'normal' });
    getDb()
      .prepare('UPDATE event_properties SET role = ? WHERE event_id = ? AND property_id = ?')
      .run('discriminator', eventId, thirdPropertyId);

    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [
          { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
          { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
          { property_id: thirdPropertyId, operator: 'equals', values: ['XS'] },
        ],
      })
    ).toThrow(MaxDiscriminatorsError);
  });

  it('requires at least one condition', () => {
    expect(() => VariantDAL.createVariant(projectId, eventId, { conditions: [] })).toThrow(ValidationError);
  });

  it('rejects two variants that generate the same name (409)', () => {
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
      })
    ).toThrow(ConflictError);
  });

  it('updateVariant regenerates the name when conditions change', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    const updated = VariantDAL.updateVariant(projectId, eventId, variant.id, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['remove'] }],
    });
    expect(updated.name).toBe('cart_update[action=remove]');
  });

  it('reordered conditions generate the same canonical name and 409 on the second create (fix round ERROR 1)', () => {
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    });
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [
          { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
          { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
        ],
      })
    ).toThrow(ConflictError);
  });

  it('"in" with reordered/duplicate values normalizes to the same canonical name and 409s (fix round ERROR 1)', () => {
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'in', values: ['add', 'remove'] }],
    });
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: actionPropertyId, operator: 'in', values: ['remove', 'add', 'remove'] }],
      })
    ).toThrow(ConflictError);
  });

  it('an "in" with exactly one value collapses to "equals" and 409s against the equivalent equals variant', () => {
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: actionPropertyId, operator: 'in', values: ['add'] }],
      })
    ).toThrow(ConflictError);
  });

  it('rejects the same property used in two conditions, even a contradiction (400 CONDITION_DUPLICATE_PROPERTY)', () => {
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [
          { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
          { property_id: actionPropertyId, operator: 'equals', values: ['remove'] },
        ],
      })
    ).toThrow(ConditionDuplicatePropertyError);
  });

  it('rejects "in" with zero values (400)', () => {
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: actionPropertyId, operator: 'in', values: [] }],
      })
    ).toThrow(BadRequestError);
  });

  it('rejects a non-string value instead of silently dropping it (400, fix round LOW 5)', () => {
    expect(() =>
      VariantDAL.createVariant(projectId, eventId, {
        conditions: [{ property_id: channelPropertyId, operator: 'in', values: ['app', 5 as unknown as string] }],
      })
    ).toThrow(BadRequestError);
  });

  it('updateVariant with reordered conditions also normalizes and 409s against a sibling variant', () => {
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    });
    const other = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['remove'] }],
    });
    expect(() =>
      VariantDAL.updateVariant(projectId, eventId, other.id, {
        conditions: [
          { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
          { property_id: actionPropertyId, operator: 'equals', values: ['add'] },
        ],
      })
    ).toThrow(ConflictError);
  });

  it('deletes a variant', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    VariantDAL.deleteVariant(projectId, eventId, variant.id);
    expect(VariantDAL.listVariants(projectId, eventId)).toHaveLength(0);
  });

  // D-52 / T-2-05 follow-up (T-3-07): deleting a variant a standard event mapping still targets.
  it('refuses to delete a variant a standard event mapping still targets (409 MAPPING_IN_USE)', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      variant_id: variant.id,
    });
    expect(() => VariantDAL.deleteVariant(projectId, eventId, variant.id)).toThrow(MappingInUseError);
    try {
      VariantDAL.deleteVariant(projectId, eventId, variant.id);
    } catch (err) {
      expect((err as MappingInUseError).message).toContain('add_to_cart');
    }
    // the mapping and the variant are both untouched after the refusal
    expect(VariantDAL.listVariants(projectId, eventId)).toHaveLength(1);
    expect(StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')?.variant_id).toBe(variant.id);
  });

  it('force-deletes a variant a standard event mapping targets, clearing the mapping\'s variant_id instead of the mapping itself', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: actionPropertyId, operator: 'equals', values: ['add'] }],
    });
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: eventId,
      variant_id: variant.id,
    });
    VariantDAL.deleteVariant(projectId, eventId, variant.id, { force: true });
    expect(VariantDAL.listVariants(projectId, eventId)).toHaveLength(0);
    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart');
    expect(mapping).not.toBeNull();
    expect(mapping?.variant_id).toBeNull();
    expect(mapping?.event_id).toBe(eventId);
  });

  it('deletes a variant with no mapping normally, force or not', () => {
    const variant = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: channelPropertyId, operator: 'equals', values: ['web'] }],
    });
    VariantDAL.deleteVariant(projectId, eventId, variant.id, { force: false });
    expect(VariantDAL.listVariants(projectId, eventId)).toHaveLength(0);
  });
});
