/**
 * Requirements matrix computation tests (T-1-07, CONTEXT.md 3.2: "computed, not authored"): rows
 * are distinct targets across use cases, columns are use cases, cells are the level.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import { insertUnresolvedRequirement } from '../dal/requirement.dal';
import { computeRequirementsMatrix } from './requirements-matrix.service';

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

describe('computeRequirementsMatrix', () => {
  it('produces one row per distinct target and one column per use case, with the level as the cell', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' }).id;
    const email = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' }).id;

    const useCaseA = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    const useCaseB = UseCaseDAL.createUseCase(projectId, { name: 'B' });

    RequirementDAL.replaceRequirements(projectId, useCaseA.id, [
      { target_kind: 'event', event_id: event, level: 'R' },
      { target_kind: 'customer_property', property_id: email, level: 'O' },
    ]);
    RequirementDAL.replaceRequirements(projectId, useCaseB.id, [
      { target_kind: 'event', event_id: event, level: 'O' },
    ]);

    const matrix = computeRequirementsMatrix(projectId);
    expect(matrix.use_cases.map((u) => u.id)).toEqual([useCaseA.id, useCaseB.id]);
    expect(matrix.rows).toHaveLength(2);

    const eventRow = matrix.rows.find((r) => r.target_kind === 'event');
    expect(eventRow?.label).toBe('checkout');
    expect(eventRow?.cells).toEqual({ [useCaseA.id]: 'R', [useCaseB.id]: 'O' });

    const propertyRow = matrix.rows.find((r) => r.target_kind === 'customer_property');
    expect(propertyRow?.label).toBe('email');
    expect(propertyRow?.cells).toEqual({ [useCaseA.id]: 'O' });
  });

  it('labels event_property and variant_property rows as "target.property"', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' }).id;
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, event, { property_id: property, role: 'normal' });

    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event_property', event_id: event, property_id: property, level: 'R' },
    ]);

    const matrix = computeRequirementsMatrix(projectId);
    expect(matrix.rows[0].label).toBe('purchase.total_price');
  });

  it('returns an empty matrix for a project with no use cases', () => {
    const matrix = computeRequirementsMatrix(projectId);
    expect(matrix.use_cases).toEqual([]);
    expect(matrix.rows).toEqual([]);
  });

  it('labels a removed target "(removed)" instead of a raw uuid (fix round ERROR 2)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' }).id;
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, event, { property_id: property, role: 'normal' });

    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event_property', event_id: event, property_id: property, level: 'R' },
    ]);

    EventDAL.deleteEvent(projectId, event);

    const matrix = computeRequirementsMatrix(projectId);
    expect(matrix.rows).toHaveLength(1);
    // Second fix round ERROR A: a gap row missing a required id is now suffixed with its own note
    // (or position) so several such rows never collapse into one; "(removed).total_price" is still
    // the label's prefix.
    expect(matrix.rows[0].label).toMatch(/^\(removed\)\.total_price: /);
    expect(matrix.rows[0].label).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  });

  it('second fix round ERROR A: two properties of one event detached from one use case each keep their own matrix row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
    const totalPrice = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    }).id;
    const quantity = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'quantity',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, event, { property_id: totalPrice, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, event, { property_id: quantity, role: 'normal' });

    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event_property', event_id: event, property_id: totalPrice, level: 'R' },
      { target_kind: 'event_property', event_id: event, property_id: quantity, level: 'O' },
    ]);

    EventDAL.detachPropertyFromEvent(projectId, event, totalPrice);
    EventDAL.detachPropertyFromEvent(projectId, event, quantity);

    const matrix = computeRequirementsMatrix(projectId);
    const gapRows = matrix.rows.filter((r) => r.cells[useCase.id]);
    expect(gapRows).toHaveLength(2);
    expect(new Set(gapRows.map((r) => r.label)).size).toBe(2);
    expect(gapRows.map((r) => r.cells[useCase.id]).sort()).toEqual(['O', 'R']);
  });

  it('T-3-06 QA fix (2026-09-28 01:59): two gap rows with identical notes still get distinct keys', () => {
    // Reproduces the qa-tester's repro: two independent use cases (e.g. two instantiations of the
    // same template) each produce a gap requirement on the same unresolvable event name, so both
    // rows render the exact same label text ("(removed): No event named \"wishlist_add\" ...").
    // Before the fix, the frontend derived its React key from `target_kind:label`, which collided;
    // the fix is that the service itself exposes a stable, already-unique `key` per row (`gap:<id>`
    // for a gap row) so no caller ever needs to re-derive one from display text.
    const useCaseA = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    const useCaseB = UseCaseDAL.createUseCase(projectId, { name: 'B' });
    const sameNote = 'No event named "wishlist_add" in this project.';
    insertUnresolvedRequirement(useCaseA.id, 0, { target_kind: 'event', level: 'R', note: sameNote });
    insertUnresolvedRequirement(useCaseB.id, 0, { target_kind: 'event', level: 'R', note: sameNote });

    const matrix = computeRequirementsMatrix(projectId);
    const gapRows = matrix.rows.filter((r) => r.key.startsWith('gap:'));
    expect(gapRows).toHaveLength(2);
    // Identical label text (this is exactly the case that used to collide)...
    expect(gapRows[0].label).toBe(gapRows[1].label);
    // ...but distinct, stable keys.
    expect(gapRows[0].key).not.toBe(gapRows[1].key);
    expect(new Set(gapRows.map((r) => r.key)).size).toBe(2);
  });

  it('T-3-06 QA fix: a resolved row key is stable across recomputes', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' }).id;
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event', event_id: event, level: 'R' },
    ]);

    const first = computeRequirementsMatrix(projectId);
    const second = computeRequirementsMatrix(projectId);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].key).toBe(second.rows[0].key);
    expect(first.rows[0].key).not.toMatch(/^gap:/);
    // T-3-10: rowKey now also includes catalog_field_id/consent_category_id (both empty here),
    // so an `event` row (property_id, variant_id, catalog_field_id, consent_category_id all empty)
    // has three trailing empty segments after the event id.
    expect(first.rows[0].key).toBe(`event::${event}:::`);
  });
});
