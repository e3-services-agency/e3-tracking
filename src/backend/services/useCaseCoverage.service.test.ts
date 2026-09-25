/**
 * Use case coverage tests (T-2-11, PLAN "Coverage grid"): event/event_property, variant/
 * variant_property, customer_property and gap (removed target) requirement rows, satisfied from
 * observations in non-archived runs only.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { computeUseCaseCoverage } from './useCaseCoverage.service';

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

describe('computeUseCaseCoverage', () => {
  it('marks event/event_property/variant/variant_property satisfied only when an in-scope observation demonstrates them, and customer_property always unsatisfied', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    const productId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' });
    const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: productId.id, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id, role: 'normal' });
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
    });
    const customerProperty = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });

    const otherEvent = EventDAL.createEvent(projectId, { name: 'checkout' });

    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Add to cart' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event', event_id: event.id, level: 'R' },
      { target_kind: 'event_property', event_id: event.id, property_id: productId.id, level: 'R' },
      { target_kind: 'variant', variant_id: variant.id, level: 'R' },
      { target_kind: 'variant_property', variant_id: variant.id, property_id: totalPrice.id, level: 'R' },
      { target_kind: 'customer_property', property_id: customerProperty.id, level: 'O' },
      { target_kind: 'event', event_id: otherEvent.id, level: 'R' },
    ]);

    const run = QaRunDAL.createQaRun(projectId, { kind: 'agent_session' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'agent',
      event_type: 'cart_update',
      event_id: event.id,
      variant_id: variant.id,
      timestamp: 1,
      properties: { action: 'add', product_id: 'p1', total_price: 12.5 },
    });

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.total_count).toBe(6);

    const eventRow = coverage.rows.find((r) => r.target_kind === 'event' && r.satisfied);
    expect(eventRow).toBeDefined();
    const eventPropertyRow = coverage.rows.find((r) => r.target_kind === 'event_property');
    expect(eventPropertyRow?.satisfied).toBe(true);
    const variantRow = coverage.rows.find((r) => r.target_kind === 'variant');
    expect(variantRow?.satisfied).toBe(true);
    const variantPropertyRow = coverage.rows.find((r) => r.target_kind === 'variant_property');
    expect(variantPropertyRow?.satisfied).toBe(true);
    const customerPropertyRow = coverage.rows.find((r) => r.target_kind === 'customer_property');
    expect(customerPropertyRow?.satisfied).toBe(false);
    expect(customerPropertyRow?.observation_count).toBe(0);
    const unsatisfiedEventRow = coverage.rows.find((r) => r.target_kind === 'event' && !r.satisfied);
    expect(unsatisfiedEventRow).toBeDefined();
    expect(unsatisfiedEventRow?.observation_count).toBe(0);

    expect(coverage.satisfied_count).toBe(4);
  });

  it('ignores observations from archived runs', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Checkout' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [{ target_kind: 'event', event_id: event.id, level: 'R' }]);

    const run = QaRunDAL.createQaRun(projectId, { kind: 'agent_session' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'agent',
      event_type: 'checkout',
      event_id: event.id,
      variant_id: null,
      timestamp: 1,
      properties: {},
    });
    QaRunDAL.updateQaRun(projectId, run.id, { archived: true });

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.rows[0].satisfied).toBe(false);
  });

  it('a gap requirement (removed target, nulled ids) is always unsatisfied', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Checkout' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [{ target_kind: 'event', event_id: event.id, level: 'R' }]);
    EventDAL.deleteEvent(projectId, event.id);

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.rows).toHaveLength(1);
    expect(coverage.rows[0].status).toBe('gap');
    expect(coverage.rows[0].satisfied).toBe(false);
  });

  it('ERROR 1 fix: a gap requirement whose property_id was nulled by detaching the property from its event is always unsatisfied, even though event_id survives', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id, role: 'normal' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Checkout' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event_property', event_id: event.id, property_id: totalPrice.id, level: 'R' },
    ]);

    const run = QaRunDAL.createQaRun(projectId, { kind: 'agent_session' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'agent',
      event_type: 'checkout',
      event_id: event.id,
      variant_id: null,
      timestamp: 1,
      properties: {},
    });

    EventDAL.detachPropertyFromEvent(projectId, event.id, totalPrice.id);

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.rows).toHaveLength(1);
    expect(coverage.rows[0].status).toBe('gap');
    expect(coverage.rows[0].target_kind).toBe('event_property');
    expect(coverage.rows[0].satisfied).toBe(false);
    expect(coverage.rows[0].observation_count).toBe(0);
  });

  it('ERROR 1 fix: a gap requirement left by deleting the property outright is always unsatisfied', () => {
    const event = EventDAL.createEvent(projectId, { name: 'checkout' });
    const customerProperty = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Checkout' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'customer_property', property_id: customerProperty.id, level: 'O' },
    ]);
    PropertyDAL.deleteProperty(projectId, customerProperty.id);

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.rows).toHaveLength(1);
    expect(coverage.rows[0].status).toBe('gap');
    expect(coverage.rows[0].satisfied).toBe(false);
    // event exists only so the DB has other rows to distinguish this project's state; unused otherwise.
    expect(event.id).toBeDefined();
  });

  it('WARNING 2 fix: resolves an observation live against current definitions (event by name, variant via evaluateVariant), not its stored event_id/variant_id, without running a comparison', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
    });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Add to cart' });
    RequirementDAL.replaceRequirements(projectId, useCase.id, [{ target_kind: 'variant', variant_id: variant.id, level: 'R' }]);

    // Imported before the variant existed (or never recomputed): stored event_id/variant_id are
    // both null, but the raw payload matches the variant's condition.
    const run = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'customer_events_export',
      event_type: 'cart_update',
      event_id: null,
      variant_id: null,
      timestamp: 1,
      properties: { action: 'add' },
    });

    const coverage = computeUseCaseCoverage(projectId, useCase.id);
    expect(coverage.rows).toHaveLength(1);
    expect(coverage.rows[0].satisfied).toBe(true);
    expect(coverage.rows[0].observation_count).toBe(1);
  });
});
