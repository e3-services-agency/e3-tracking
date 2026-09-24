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
import { RequirementTargetInvalidError, ValidationError } from '../errors';

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
});
