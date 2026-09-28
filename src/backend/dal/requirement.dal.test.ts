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
import * as CatalogDAL from './catalog.dal';
import * as ConsentCategoryDAL from './consent-category.dal';
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

  it('T-4-02: a pure reorder keeps every row\'s id (so a comment on it does not orphan)', () => {
    const first = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
    ]);
    const idsByTarget = new Map(first.map((r) => [r.target_kind, r.id]));

    const reordered = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'O' },
      { target_kind: 'event', event_id: eventId, level: 'R' },
    ]);
    for (const row of reordered) {
      expect(row.id).toBe(idsByTarget.get(row.target_kind));
    }
  });

  it('T-4-02: an unchanged target keeps its id across an edited level/status/note', () => {
    const [first] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R', note: 'first' },
    ]);
    const [edited] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'O', status: 'resolved', note: 'second' },
    ]);
    expect(edited.id).toBe(first.id);
    expect(edited.level).toBe('O');
    expect(edited.status).toBe('resolved');
    expect(edited.note).toBe('second');
  });

  it('T-4-02: swapping a target for a different one yields a new id, not a reused one', () => {
    const secondCustomerPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'phone',
      data_type: 'string',
    }).id;
    const [first] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'R' },
    ]);
    const [changed] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: secondCustomerPropertyId, level: 'R' },
    ]);
    expect(changed.id).not.toBe(first.id);
    expect(changed.property_id).toBe(secondCustomerPropertyId);
  });

  it('T-4-02 pre-QA fix: two same-key gap rows keep their own id (not swapped) on a reversed reorder, matched by (level, note)', () => {
    // Two event_property requirements on the same event, each targeting a different property; once
    // both properties are detached, both rows share the same ambiguous key
    // (`event_property:<event>::`) -- only their level and note (the "target removed: <name>" text
    // markRequirementsGapForDetach appends) still tell them apart.
    const propA = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'A-action', data_type: 'string' }).id;
    const propB = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'B-price', data_type: 'string' }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propA, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propB, role: 'normal' });

    const [reqA, reqB] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event_property', event_id: eventId, property_id: propA, level: 'R' },
      { target_kind: 'event_property', event_id: eventId, property_id: propB, level: 'O' },
    ]);

    EventDAL.detachPropertyFromEvent(projectId, eventId, propA);
    EventDAL.detachPropertyFromEvent(projectId, eventId, propB);
    const gapRows = RequirementDAL.listRequirements(projectId, useCaseId);
    const gapA = gapRows.find((r) => r.id === reqA.id)!;
    const gapB = gapRows.find((r) => r.id === reqB.id)!;
    expect(gapA.status).toBe('gap');
    expect(gapA.level).toBe('R');
    expect(gapA.note).toBe('target removed: A-action');
    expect(gapB.status).toBe('gap');
    expect(gapB.level).toBe('O');
    expect(gapB.note).toBe('target removed: B-price');

    // Reversed order (B first, A second), same level/note as each row currently has.
    const reordered = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event_property', event_id: eventId, level: gapB.level, status: 'gap', note: gapB.note },
      { target_kind: 'event_property', event_id: eventId, level: gapA.level, status: 'gap', note: gapA.note },
    ]);

    const reorderedA = reordered.find((r) => r.note === 'target removed: A-action')!;
    const reorderedB = reordered.find((r) => r.note === 'target removed: B-price')!;
    expect(reorderedA.id).toBe(reqA.id);
    expect(reorderedA.level).toBe('R');
    expect(reorderedB.id).toBe(reqB.id);
    expect(reorderedB.level).toBe('O');
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

  it('second fix round LOW C: normalises an empty-string forbidden id to null instead of a 500 FK error', () => {
    // `target_kind: 'event'` forbids property_id/variant_id; the picker sends "" for "no selection"
    // rather than omitting the key. Before the fix this "" reached the INSERT as a literal string id
    // and SQLite's FK constraint on `requirements.property_id` rejected it with a raw 500, not a 400.
    const result = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, property_id: '', level: 'R' },
    ]);
    expect(result).toMatchObject([{ target_kind: 'event', event_id: eventId, property_id: null }]);
  });

  it('second fix round LOW C: an empty-string required id is treated as missing (400, not 500)', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: '', level: 'R' },
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

  it('second fix round ERROR A: two event_property rows on one event, both detached, re-save unchanged succeeds', () => {
    const propertyA = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    }).id;
    const propertyB = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'quantity',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyA, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyB, role: 'normal' });

    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event_property', event_id: eventId, property_id: propertyA, level: 'R' },
      { target_kind: 'event_property', event_id: eventId, property_id: propertyB, level: 'O' },
    ]);

    EventDAL.detachPropertyFromEvent(projectId, eventId, propertyA);
    EventDAL.detachPropertyFromEvent(projectId, eventId, propertyB);

    const rows = RequirementDAL.listRequirements(projectId, useCaseId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'gap' && r.property_id === null && r.event_id === eventId)).toBe(true);

    // Before the fix, both rows keyed as `event_property:<event>::` and the second one collided with
    // the first, throwing REQUIREMENT_DUPLICATE on an unchanged re-save.
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
    expect(resaved).toHaveLength(2);
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

describe('T-3-10 (D-57): catalog_attribute and consent target kinds', () => {
  let catalogFieldId: string;
  let consentCategoryId: string;

  beforeEach(() => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'main' });
    catalogFieldId = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'image' }).id;
    consentCategoryId = ConsentCategoryDAL.createConsentCategory(projectId, {
      name: 'Newsletter',
      standard_key: 'newsletter',
    }).id;
  });

  it('accepts a catalog_attribute row (catalog_field_id only) and a consent row (consent_category_id only)', () => {
    const rows = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'catalog_attribute', catalog_field_id: catalogFieldId, level: 'O' },
      { target_kind: 'consent', consent_category_id: consentCategoryId, level: 'R' },
    ]);
    expect(rows[0]).toMatchObject({ target_kind: 'catalog_attribute', catalog_field_id: catalogFieldId, property_id: null, event_id: null, variant_id: null, consent_category_id: null });
    expect(rows[1]).toMatchObject({ target_kind: 'consent', consent_category_id: consentCategoryId, catalog_field_id: null });
  });

  it('rejects a catalog_field_id from another project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-eu', name: 'Other EU' }).id;
    const otherCatalog = CatalogDAL.createCatalog(otherProjectId, { name: 'Other catalog', mapping_role: 'main' });
    const otherFieldId = CatalogDAL.createCatalogField(otherProjectId, otherCatalog.id, { name: 'image' }).id;
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'catalog_attribute', catalog_field_id: otherFieldId, level: 'O' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects a consent_category_id from another project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other2', name: 'Other2' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other2-eu', name: 'Other2 EU' }).id;
    const otherConsentId = ConsentCategoryDAL.createConsentCategory(otherProjectId, { name: 'X', standard_key: 'sms' }).id;
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'consent', consent_category_id: otherConsentId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('rejects mixing a catalog_field_id onto an event-kind row, and vice versa', () => {
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'event', event_id: eventId, catalog_field_id: catalogFieldId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
    expect(() =>
      RequirementDAL.replaceRequirements(projectId, useCaseId, [
        { target_kind: 'catalog_attribute', catalog_field_id: catalogFieldId, event_id: eventId, level: 'R' },
      ])
    ).toThrow(RequirementTargetInvalidError);
  });

  it('deleting the catalog field or consent category marks the requirement gap and appends a note', () => {
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'catalog_attribute', catalog_field_id: catalogFieldId, level: 'O' },
      { target_kind: 'consent', consent_category_id: consentCategoryId, level: 'R' },
    ]);
    const catalog = CatalogDAL.listCatalogs(projectId)[0];
    CatalogDAL.deleteCatalogField(projectId, catalog.id, catalogFieldId);
    ConsentCategoryDAL.deleteConsentCategory(projectId, consentCategoryId);

    const rows = RequirementDAL.listRequirements(projectId, useCaseId);
    for (const row of rows) {
      expect(row.status).toBe('gap');
      expect(row.note).toContain('target removed:');
    }
  });
});
