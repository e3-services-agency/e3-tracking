/**
 * `createEventResolver` (T-2-11 fix round, WARNING 2): a per-call cached resolver so a caller that
 * resolves many observations against the same definitions (`useCaseCoverage.service.ts`) pays the
 * `listEvents`/`getEventWithProperties`/`listVariants` cost once per distinct event, not once per
 * observation. `resolveEventAndVariant` (the uncached one-shot form used by `comparison.service.ts`)
 * must keep behaving identically -- `createEventResolver` is additive, not a behaviour change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import { createEventResolver, resolveEventAndVariant } from './eventResolution';

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
  vi.restoreAllMocks();
});

describe('createEventResolver', () => {
  it('resolves each observation the same way resolveEventAndVariant does', () => {
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

    const resolve = createEventResolver(projectId);
    expect(resolve('cart_update', { action: 'add' })).toEqual({ event_id: event.id, variant_id: variant.id });
    expect(resolve('cart_update', { action: 'remove' })).toEqual({ event_id: event.id, variant_id: null });
    expect(resolve('unknown_event', {})).toEqual({ event_id: null, variant_id: null });

    // Matches the uncached one-shot resolver for the same inputs.
    expect(resolve('cart_update', { action: 'add' })).toEqual(resolveEventAndVariant(projectId, 'cart_update', { action: 'add' }));
  });

  it('builds the events-by-name map and loads each event\'s links/variants at most once, regardless of how many observations are resolved (WARNING 2 fix round)', () => {
    const eventA = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const eventB = EventDAL.createEvent(projectId, { name: 'checkout' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, eventA.id, { property_id: action.id, role: 'discriminator' });
    VariantDAL.createVariant(projectId, eventA.id, {
      conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
    });

    const listEventsSpy = vi.spyOn(EventDAL, 'listEvents');
    const getEventWithPropertiesSpy = vi.spyOn(EventDAL, 'getEventWithProperties');
    const listVariantsSpy = vi.spyOn(VariantDAL, 'listVariants');

    const resolve = createEventResolver(projectId);
    // 20 observations across the two events -- the per-observation call must not re-hit the DAL.
    for (let i = 0; i < 10; i++) {
      resolve('cart_update', { action: i % 2 === 0 ? 'add' : 'remove' });
      resolve('checkout', {});
    }
    resolve('unknown_event', {});

    // `listEvents` backs the events-by-name map: built exactly once for the whole resolver, not
    // once per `resolve(...)` call.
    expect(listEventsSpy).toHaveBeenCalledTimes(1);
    // Links/variants are loaded lazily, at most once per distinct event id (eventA, eventB) --
    // never for the 21st, unmatched lookup, and never again after the first hit per event.
    expect(getEventWithPropertiesSpy).toHaveBeenCalledTimes(2);
    expect(listVariantsSpy).toHaveBeenCalledTimes(2);
  });
});
