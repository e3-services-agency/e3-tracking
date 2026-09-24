/**
 * Requirement DAL tests (T-1-07): target validation per `target_kind` (400
 * `REQUIREMENT_TARGET_INVALID`), ordering on replace, and cross-project rejection.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as UseCaseDAL from './use-case.dal';
import * as RequirementDAL from './requirement.dal';
import { RequirementDuplicateTargetError, RequirementTargetInvalidError, ValidationError } from '../errors';

let projectId: string;
let useCaseId: string;
let eventId: string;
let eventPropertyId: string;
let customerPropertyId: string;
let variantId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  useCaseId = UseCaseDAL.createUseCase(projectId, { name: 'Checkout' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
  eventPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: eventPropertyId, role: 'discriminator' });
  customerPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'customer',
    name: 'email',
    data_type: 'string',
  }).id;
  variantId = VariantDAL.createVariant(projectId, eventId, {
    conditions: [{ property_id: eventPropertyId, operator: 'equals', values: ['add'] }],
  }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('requirement.dal: target validation', () => {
  it('accepts a valid row for each target_kind and orders them by array position', () => {
    const result = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'R' },
      { target_kind: 'event', event_id: eventId, level: 'R' },
      { target_kind: 'variant', variant_id: variantId, level: 'O' },
      { target_kind: 'event_property', event_id: eventId, property_id: eventPropertyId, level: 'R' },
      { target_kind: 'variant_property', variant_id: variantId, property_id: eventPropertyId, level: 'O' },
    ]);
    expect(result.map((r) => r.target_kind)).toEqual([
      'customer_property',
      'event',
      'variant',
      'event_property',
      'variant_property',
    ]);
    expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('re-orders on a second replace call (array order is the source of truth)', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
    ]);
    const reordered = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
      { target_kind: 'event', event_id: eventId, level: 'R' },
    ]);
    expect(reordered.map((r) => r.target_kind)).toEqual(['customer_property', 'event']);
    expect(reordered.map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it('rejects an unknown target_kind', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'bogus', level: 'R' },
      ])
    ).toThrow(ValidationError);
  });

  it('rejects customer_property with an extra event_id/variant_id', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'customer_property', property_id: customerPropertyId, event_id: eventId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects customer_property pointing at an event-scope property', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'customer_property', property_id: eventPropertyId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects event with a property_id or variant_id set', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, property_id: eventPropertyId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects event_property when the property is not linked to the event', () => {
    const unlinkedProperty = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'unlinked',
      data_type: 'string',
    }).id;
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event_property', event_id: eventId, property_id: unlinkedProperty, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects variant_property when the property is not linked to the variant’s event', () => {
    const unlinkedProperty = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'unlinked',
      data_type: 'string',
    }).id;
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'variant_property', variant_id: variantId, property_id: unlinkedProperty, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects an event_id/property_id/variant_id from another project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-p', name: 'Other' }).id;
    const otherEvent = EventDAL.createEvent(otherProjectId, { name: 'other_event' }).id;

    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: otherEvent, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects an invalid level or status', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, level: 'X' },
      ])
    ).toThrow(ValidationError);
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, level: 'R', status: 'bogus' },
      ])
    ).toThrow(ValidationError);
  });

  it('a failed replace leaves the previous list untouched (transactional)', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
    ]);
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
        { target_kind: 'bogus', level: 'R' },
      ])
    ).toThrow();
    const current = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(current.map((r) => r.target_kind)).toEqual(['event']);
  });

  it('rejects the same target twice in one list (fix round LOW 6, 400 REQUIREMENT_DUPLICATE)', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, level: 'R' },
        { target_kind: 'event', event_id: eventId, level: 'O' },
      ])
    ).toThrow(RequirementDuplicateTargetError);
  });

  it('never treats two fully-null gap rows as duplicates of each other', () => {
    const result = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', level: 'R', status: 'gap', note: 'target removed: a' },
      { target_kind: 'event', level: 'O', status: 'gap', note: 'target removed: b' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('accepts a gap row with all target ids null (an unresolved from-template row round-tripped unchanged)', () => {
    const result = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'variant_property', level: 'R', status: 'gap', note: 'No event named "nope".' },
    ]);
    expect(result).toMatchObject([
      { target_kind: 'variant_property', status: 'gap', property_id: null, event_id: null, variant_id: null },
    ]);
  });

  it('still rejects a gap row that sets a forbidden id for its target_kind', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, variant_id: variantId, level: 'R', status: 'gap' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('still validates a present id on a gap row (does not skip project-membership checks)', () => {
    const otherClient = ClientDAL.createClient({ key: 'other2', name: 'Other2' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-p2', name: 'Other2' }).id;
    const otherEvent = EventDAL.createEvent(otherProjectId, { name: 'other_event' }).id;
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: otherEvent, level: 'R', status: 'gap' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });
});

describe('requirement.dal: markRequirementsGap* (fix round ERROR 2)', () => {
  it('event soft-delete marks direct "event" and "event_property" requirements gap and nulls event_id', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
      { target_kind: 'event_property', event_id: eventId, property_id: eventPropertyId, level: 'R' },
    ]);
    EventDAL.deleteEvent(projectId, eventId);
    const rows = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.event_id).toBeNull();
      expect(row.status).toBe('gap');
      expect(row.note).toContain('target removed: cart_update');
    }
    // The use case must stay saveable unchanged (this is exactly what `replaceRequirements` used to
    // reject with "event_id does not belong to this project.").
    const resaved = RequirementDAL.replaceRequirements(
      projectId,
      useCaseId,
      rows.map((r) => ({
        target_kind: r.target_kind,
        property_id: r.property_id,
        event_id: r.event_id,
        variant_id: r.variant_id,
        level: r.level,
        status: r.status,
        note: r.note,
      }))
    );
    expect(resaved.every((r) => r.status === 'gap')).toBe(true);
  });

  it('event soft-delete also marks requirements on the event\'s variants gap and nulls variant_id', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'variant', variant_id: variantId, level: 'R' },
      { target_kind: 'variant_property', variant_id: variantId, property_id: eventPropertyId, level: 'O' },
    ]);
    EventDAL.deleteEvent(projectId, eventId);
    const rows = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.variant_id).toBeNull();
      expect(row.status).toBe('gap');
      expect(row.note).toContain('target removed:');
    }
  });

  it('variant delete marks "variant" and "variant_property" requirements gap and nulls variant_id', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'variant', variant_id: variantId, level: 'R' },
    ]);
    VariantDAL.deleteVariant(projectId, eventId, variantId);
    const [row] = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(row.variant_id).toBeNull();
    expect(row.status).toBe('gap');
    expect(row.note).toContain('target removed:');
  });

  it('property delete marks the "customer_property" requirement gap and nulls property_id', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'R' },
    ]);
    PropertyDAL.deleteProperty(projectId, customerPropertyId);
    const [row] = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(row.property_id).toBeNull();
    expect(row.status).toBe('gap');
    expect(row.note).toContain('target removed: email');
  });

  it('event-property detach marks "event_property" and "variant_property" requirements on that property gap, keeps the event/variant', () => {
    // A normal-role property, not the discriminator `eventPropertyId` is already used by
    // `variantId`'s own condition (detaching a discriminator a variant conditions on is a separate,
    // already-guarded case: `DiscriminatorInUseError`, unrelated to this fix).
    const normalPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: normalPropertyId, role: 'normal' });

    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event_property', event_id: eventId, property_id: normalPropertyId, level: 'R' },
      { target_kind: 'variant_property', variant_id: variantId, property_id: normalPropertyId, level: 'O' },
    ]);
    EventDAL.detachPropertyFromEvent(projectId, eventId, normalPropertyId);
    const rows = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(rows).toHaveLength(2);
    const [eventPropertyRow, variantPropertyRow] = rows;
    expect(eventPropertyRow.property_id).toBeNull();
    expect(eventPropertyRow.event_id).toBe(eventId); // the event itself is untouched by a detach
    expect(eventPropertyRow.status).toBe('gap');
    expect(variantPropertyRow.property_id).toBeNull();
    expect(variantPropertyRow.variant_id).toBe(variantId); // the variant itself is untouched
    expect(variantPropertyRow.status).toBe('gap');
  });

  it('an existing note is appended to, not overwritten, when a target is removed', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R', note: 'Confirmed by analytics team.' },
    ]);
    EventDAL.deleteEvent(projectId, eventId);
    const [row] = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(row.note).toContain('Confirmed by analytics team.');
    expect(row.note).toContain('target removed: cart_update');
  });
});
