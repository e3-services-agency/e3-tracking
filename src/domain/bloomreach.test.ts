import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CATALOG_MAIN_COLUMNS,
  KNOWN_SYSTEM_EVENT_TYPES,
  PLATFORM_EVENT_TYPES,
  SDK_DEFAULT_PROPERTIES,
  SDK_EVENT_TYPES,
  STANDARD_CONSENT_KEYS,
  STANDARD_CUSTOMER_PROPERTIES,
  STANDARD_EVENTS,
  classifyEventType,
  mergeConsentKeys,
  mergeStandardEvents,
} from './bloomreach';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../.claude/team/samples/data-mapping.json'
);

interface DataMappingFixture {
  catalogs: { main_columns: Record<string, unknown> };
  consents: Record<string, unknown>;
  customer_properties: Record<string, unknown>;
  standard_events: Record<string, Record<string, unknown>>;
}

const fixture: DataMappingFixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('bloomreach seed lists reproduce data-mapping.json', () => {
  it('has the same standard event keys as the fixture', () => {
    const fixtureKeys = Object.keys(fixture.standard_events).sort();
    const seedKeys = STANDARD_EVENTS.map((event) => event.key).sort();
    expect(seedKeys).toEqual(fixtureKeys);
  });

  it('has the same field key set as the fixture for every standard event', () => {
    for (const event of STANDARD_EVENTS) {
      const fixtureEvent = fixture.standard_events[event.key];
      expect(fixtureEvent, `fixture is missing standard event ${event.key}`).toBeDefined();
      const fixtureFieldKeys = Object.keys(fixtureEvent)
        .filter((key) => key !== 'event')
        .sort();
      expect(event.fields.slice().sort(), `field set mismatch for ${event.key}`).toEqual(
        fixtureFieldKeys
      );
    }
  });

  it('has the same catalog main_columns key set as the fixture', () => {
    const fixtureKeys = Object.keys(fixture.catalogs.main_columns).sort();
    expect(CATALOG_MAIN_COLUMNS.slice().sort()).toEqual(fixtureKeys);
  });

  it('has the same customer_properties key set as the fixture', () => {
    const fixtureKeys = Object.keys(fixture.customer_properties).sort();
    expect(STANDARD_CUSTOMER_PROPERTIES.slice().sort()).toEqual(fixtureKeys);
  });

  it('has the same consents key set as the fixture', () => {
    const fixtureKeys = Object.keys(fixture.consents).sort();
    expect(STANDARD_CONSENT_KEYS.slice().sort()).toEqual(fixtureKeys);
  });
});

describe('project addition merge helpers (D-26)', () => {
  it('merges project standard event additions after the seed, keeping seed order', () => {
    const merged = mergeStandardEvents([{ key: 'flight_booked', fields: ['route', 'fare_class'] }]);
    expect(merged.map((event) => event.key)).toEqual([
      ...STANDARD_EVENTS.map((event) => event.key),
      'flight_booked',
    ]);
  });

  it('does not duplicate a project addition that matches a seed key', () => {
    const merged = mergeStandardEvents([{ key: 'purchase', fields: ['custom_field'] }]);
    expect(merged.filter((event) => event.key === 'purchase')).toHaveLength(1);
    expect(merged.find((event) => event.key === 'purchase')?.fields).toEqual(
      STANDARD_EVENTS.find((event) => event.key === 'purchase')?.fields
    );
  });

  it('merges project consent key additions after the seed', () => {
    const merged = mergeConsentKeys(['loyalty_opt_in']);
    expect(merged).toEqual([...STANDARD_CONSENT_KEYS, 'loyalty_opt_in']);
  });

  it('returns the seed unchanged when there are no additions', () => {
    expect(mergeStandardEvents(null).map((e) => e.key)).toEqual(
      STANDARD_EVENTS.map((e) => e.key)
    );
    expect(mergeConsentKeys(undefined)).toEqual(STANDARD_CONSENT_KEYS);
  });
});

describe('event class lists (T-2-01, D-29, D-36)', () => {
  it('SDK and platform event type lists are disjoint', () => {
    const overlap = SDK_EVENT_TYPES.filter((t) => PLATFORM_EVENT_TYPES.includes(t));
    expect(overlap).toEqual([]);
  });

  it('KNOWN_SYSTEM_EVENT_TYPES is exactly the union of SDK and platform types', () => {
    expect(new Set(KNOWN_SYSTEM_EVENT_TYPES)).toEqual(new Set([...SDK_EVENT_TYPES, ...PLATFORM_EVENT_TYPES]));
  });

  it('paper_catalogue and loyalty_update are in neither list (T-1-09 unexpected_event fixture)', () => {
    expect(SDK_EVENT_TYPES).not.toContain('paper_catalogue');
    expect(PLATFORM_EVENT_TYPES).not.toContain('paper_catalogue');
    expect(SDK_EVENT_TYPES).not.toContain('loyalty_update');
    expect(PLATFORM_EVENT_TYPES).not.toContain('loyalty_update');
  });

  it('classifyEventType maps sdk, platform and unknown/custom names correctly', () => {
    expect(classifyEventType('session_start')).toBe('sdk');
    expect(classifyEventType('campaign')).toBe('platform');
    expect(classifyEventType('purchase')).toBe('custom');
    expect(classifyEventType('paper_catalogue')).toBe('custom');
  });

  it('SDK_DEFAULT_PROPERTIES carries os, browser, device, location', () => {
    expect([...SDK_DEFAULT_PROPERTIES].sort()).toEqual(['browser', 'device', 'location', 'os']);
  });
});
