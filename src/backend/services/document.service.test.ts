/**
 * document.service tests (T-2-08): the `EventCard` builder on a small hand-built project (one
 * custom event with a discriminator variant, a context property, and observations), certification
 * flip when a property is marked required, the coverage grid, and the certification route's `applicable: false` for an sdk event.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { runComparison } from './comparison.service';
import { buildEventCard, computeEventCertification, computeEventCoverageGrid, buildTrackingDocument } from './document.service';

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

/** One custom `cart_update` event: `action` discriminator (add/remove), `location` context (web/app), optional `total_price`. */
function setUpCartUpdate(): { eventId: string; totalPricePropertyId: string; actionPropertyId: string; locationPropertyId: string; variantAddId: string } {
  const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });

  const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number', data_formats_json: ['money'] });
  const action = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  });
  const location = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'location',
    data_type: 'string',
    allowed_values_json: [{ value: 'web' }, { value: 'app' }],
  });

  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id, required: false, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, required: true, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: location.id, required: false, role: 'context' });

  const variantAdd = VariantDAL.createVariant(projectId, event.id, {
    conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
  });

  return { eventId: event.id, totalPricePropertyId: totalPrice.id, actionPropertyId: action.id, locationPropertyId: location.id, variantAddId: variantAdd.id };
}

function addObservation(eventType: string, properties: Record<string, unknown>, timestamp = 1_700_000_000): void {
  const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
  ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: eventType, timestamp, properties });
}

describe('buildEventCard', () => {
  it('assembles properties, contexts, variants and certification for a custom event with one observation', () => {
    const { eventId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    runComparison(projectId);

    const card = buildEventCard(projectId, eventId);

    expect(card.name).toBe('cart_update');
    expect(card.class).toBe('custom');
    expect(card.properties.map((p) => p.name).sort()).toEqual(['action', 'location', 'total_price']);
    const totalPriceCard = card.properties.find((p) => p.name === 'total_price');
    expect(totalPriceCard?.required).toBe(false);
    expect(totalPriceCard?.data_type).toBe('number');

    expect(card.contexts).toEqual([{ property_id: expect.any(String), property: 'location', values: ['web', 'app'] }]);

    expect(card.variants).toHaveLength(1);
    expect(card.variants[0].name).toContain('action');
    expect(card.variants[0].conditions).toEqual([
      { property_id: expect.any(String), property_name: 'action', operator: 'equals', values: ['add'] },
    ]);
    expect(card.variants[0].expected_payload.action).toBe('add');

    expect(card.freshness.observation_count).toBe(1);
    expect(card.freshness.last_observation_at).toBe(1_700_000_000);

    expect(card.certification).toEqual({ applicable: true, certified: true, reasons: [] });

    expect(card.codegen.gtm).toContain('cart_update');
    expect(card.sdk_default_properties).toEqual(['os', 'browser', 'device', 'location']);
  });

  it('is not applicable, and not certified, for an sdk/platform event', () => {
    const event = EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });
    const card = buildEventCard(projectId, event.id);
    expect(card.certification).toEqual({ applicable: false, certified: false, reasons: ['not_applicable'] });

    const certification = computeEventCertification(projectId, event.id);
    expect(certification).toEqual({ applicable: false, certified: false, reasons: ['not_applicable'] });
  });
});

describe('certification flip when total_price is marked required', () => {
  it('stays certified while total_price is optional, flips to not-certified once it is required and missing, and flips back once reverted', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    // The observation never sends total_price (an optional field the fixture-style payload omits).
    addObservation('cart_update', { action: 'add', location: 'web' });
    runComparison(projectId);

    expect(buildEventCard(projectId, eventId).certification.certified).toBe(true);

    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    const blocked = buildEventCard(projectId, eventId).certification;
    expect(blocked.certified).toBe(false);
    expect(blocked.reasons).toContain('open_errors: 1');

    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: false });
    runComparison(projectId);

    expect(buildEventCard(projectId, eventId).certification.certified).toBe(true);
  });
});

describe('computeEventCoverageGrid', () => {
  it('reports the observed action=add/location=web cell and the unobserved combinations', () => {
    const { eventId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });

    const grid = computeEventCoverageGrid(projectId, eventId);

    expect(grid.rows).toHaveLength(1);
    expect(grid.columns).toHaveLength(1);
    expect(grid.columns[0].values).toEqual(['web', 'app']);
    const observed = grid.cells.find((c) => c.value === 'web');
    expect(observed?.count).toBe(1);
    expect(grid.unobserved).toContainEqual({ row: grid.rows[0].variant_id as string, property_id: grid.columns[0].property_id, value: 'app' });
  });
});

describe('buildTrackingDocument', () => {
  it('lists custom events before sdk/platform events and carries the project money tolerance', () => {
    setUpCartUpdate();
    EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });

    const doc = buildTrackingDocument(projectId);
    expect(doc.format).toBe('e3-tracking-document');
    expect(doc.version).toBe(1);
    expect(doc.events.map((e) => e.name)).toEqual(['cart_update', 'session_start']);
    expect(doc.project.money_tolerance).toEqual({ percent: 1, floor: 0.01 });
  });
});
