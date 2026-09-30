/**
 * D-64 (T-4-20): the system customer recommended formats through comparison 3's existing
 * `format_violation` check. Valid values produce nothing; invalid values produce one finding per
 * property and format; `title_case` is recommendation-only and never produces a finding.
 */
import { describe, expect, it } from 'vitest';
import { runDefinitionVsObservations, type DefinitionSnapshot, type EngineObservation } from './definitionVsObservations';
import { SYSTEM_CUSTOMER_PROPERTIES } from '../propertyCategory';

const NOW = Date.parse('2026-12-01T00:00:00Z') / 1000;

function definition(): DefinitionSnapshot {
  return {
    project_default_expiration: null,
    events: [
      {
        id: 'event_profile',
        name: 'profile_update',
        status: 'implemented',
        class: 'custom',
        expiration: null,
        properties: SYSTEM_CUSTOMER_PROPERTIES.map((p) => ({
          property_id: `prop_${p.name}`,
          name: p.name,
          payload_key: null,
          role: 'normal' as const,
          required: false,
          data_type: 'string',
          data_formats: [...p.formats],
          allowed_values: null,
        })),
      },
    ],
    variants: [],
    standard_event_mappings: [],
  };
}

function observe(properties: Record<string, unknown>): EngineObservation[] {
  return [{ id: 'obs_1', event_type: 'profile_update', event_id: 'event_profile', variant_id: null, timestamp: NOW - 10, properties, run_kind: 'export_paste' }];
}

const violations = (properties: Record<string, unknown>) =>
  runDefinitionVsObservations(definition(), observe(properties), { now: NOW })
    .filter((f) => f.kind === 'format_violation')
    .map((f) => f.property_id)
    .sort();

describe('system customer formats in comparison 3', () => {
  it('valid values produce no format finding', () => {
    expect(
      violations({
        email: 'jan@example.com',
        phone: '+421900123456',
        first_name: 'Jan',
        last_name: 'Novak',
        country: 'SK',
        language: 'pt-BR',
        timezone: 'Europe/Bratislava',
      })
    ).toEqual([]);
  });

  it('invalid email, phone, country, language and timezone each produce a finding', () => {
    expect(
      violations({
        email: 'not-an-email',
        phone: '0900 123 456',
        country: 'SVK',
        language: 'English',
        timezone: 'Mars/Olympus',
      })
    ).toEqual(['prop_country', 'prop_email', 'prop_language', 'prop_phone', 'prop_timezone']);
  });

  it('title_case is recommendation-only: lower case names never produce a finding', () => {
    expect(violations({ first_name: 'jan', last_name: 'NOVAK' })).toEqual([]);
  });

  it('alpha-2 must be upper case, language lower case', () => {
    expect(violations({ country: 'sk', language: 'EN' })).toEqual(['prop_country', 'prop_language']);
  });
});
