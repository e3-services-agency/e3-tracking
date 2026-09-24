import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CATALOG_MAIN_COLUMNS,
  STANDARD_CONSENT_KEYS,
  STANDARD_CUSTOMER_PROPERTIES,
  STANDARD_EVENTS,
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
