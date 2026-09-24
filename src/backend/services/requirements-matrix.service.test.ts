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
    expect(matrix.rows[0].label).toBe('(removed).total_price');
    expect(matrix.rows[0].label).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  });
});
