import { describe, expect, it } from 'vitest';
import {
  COMPARISON_IDS,
  ENTITY_STATUSES,
  EVENT_PROPERTY_ROLES,
  EVENT_SOURCE_KINDS,
  EVENT_STATUSES,
  EXPIRATION_UNITS,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  IDENTITY_TYPES,
  CATALOG_MAPPING_ROLES,
  ORIGIN_TYPES,
  PRIORITIES,
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
  PROPERTY_SCOPES,
  QA_RUN_ENVIRONMENTS,
  QA_RUN_KINDS,
  REQUIREMENT_LEVELS,
  REQUIREMENT_TARGET_KINDS,
  VARIANT_OPERATORS,
} from './enums';

/** Every exported `*_S`-suffixed array must have unique, non-empty string values (sanity, no typos/dupes). */
const arrays: Record<string, readonly string[]> = {
  PRIORITIES,
  EVENT_STATUSES,
  ENTITY_STATUSES,
  PROPERTY_SCOPES,
  ORIGIN_TYPES,
  EVENT_PROPERTY_ROLES,
  REQUIREMENT_LEVELS,
  REQUIREMENT_TARGET_KINDS,
  VARIANT_OPERATORS,
  EXPIRATION_UNITS,
  QA_RUN_KINDS,
  COMPARISON_IDS,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  IDENTITY_TYPES,
  CATALOG_MAPPING_ROLES,
  PROPERTY_DATA_TYPES,
  PROPERTY_DATA_FORMATS,
  EVENT_SOURCE_KINDS,
  QA_RUN_ENVIRONMENTS,
};

describe('enum arrays', () => {
  for (const [name, values] of Object.entries(arrays)) {
    it(`${name} is a non-empty array of unique non-empty strings`, () => {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('D-25 required values', () => {
  it('priority is critical|high|medium|low', () => {
    expect(PRIORITIES).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('event status is planned|in_review|implemented|ignored', () => {
    expect(EVENT_STATUSES).toEqual(['planned', 'in_review', 'implemented', 'ignored']);
  });

  it('finding kinds include the twelve skill kinds plus the three D-21 additions', () => {
    const skillKinds = [
      'missing_required',
      'type_mismatch',
      'format_violation',
      'enum_violation',
      'unknown_variant',
      'shape_inconsistent',
      'rename_mismatch',
      'unmapped_standard_event',
      'unmapped_property',
      'expiration_mismatch',
      'rounding_drift',
      'unexpected_property',
    ];
    const additions = ['missing_event', 'unexpected_event', 'unmapped_catalog'];
    for (const kind of [...skillKinds, ...additions]) {
      expect(FINDING_KINDS).toContain(kind);
    }
    expect(FINDING_KINDS).toHaveLength(skillKinds.length + additions.length);
  });

  it('severities are error, warning, info', () => {
    expect(FINDING_SEVERITIES).toEqual(['error', 'warning', 'info']);
  });

  it('expiration units are days, weeks, months, years', () => {
    expect(EXPIRATION_UNITS).toEqual(['days', 'weeks', 'months', 'years']);
  });
});

describe('T-1-04 delta: property data type/format, event_sources.kind, QaRun.environment', () => {
  it('PROPERTY_DATA_FORMATS includes "money" (drives the rounding-drift QA rule, D-25 Q12)', () => {
    expect(PROPERTY_DATA_FORMATS).toContain('money');
  });

  it('PROPERTY_DATA_TYPES is string|number|boolean|timestamp|object|array', () => {
    expect(PROPERTY_DATA_TYPES).toEqual(['string', 'number', 'boolean', 'timestamp', 'object', 'array']);
  });

  it('EVENT_SOURCE_KINDS is live|historical|daily', () => {
    expect(EVENT_SOURCE_KINDS).toEqual(['live', 'historical', 'daily']);
  });

  it('QA_RUN_ENVIRONMENTS is production|staging|dev', () => {
    expect(QA_RUN_ENVIRONMENTS).toEqual(['production', 'staging', 'dev']);
  });
});
