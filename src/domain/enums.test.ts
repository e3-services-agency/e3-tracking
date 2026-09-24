import { describe, expect, it } from 'vitest';
import {
  COMPARISON_IDS,
  ENTITY_STATUSES,
  EVENT_PROPERTY_ROLES,
  EVENT_STATUSES,
  EXPIRATION_UNITS,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  IDENTITY_TYPES,
  CATALOG_MAPPING_ROLES,
  ORIGIN_TYPES,
  PRIORITIES,
  PROPERTY_SCOPES,
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
