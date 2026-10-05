import { describe, expect, it } from 'vitest';
import { CSV_ENTITIES, CSV_ENTITY_NAMES, csvHeadersFor, isCsvEntity } from './csv';

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

describe('CSV_ENTITIES (D-46, T-3-03)', () => {
  it('every entity has at least one header, each unique and snake_case', () => {
    for (const entity of CSV_ENTITY_NAMES) {
      const headers = CSV_ENTITIES[entity].headers;
      expect(headers.length).toBeGreaterThan(0);
      const unique = new Set(headers);
      expect(unique.size, `${entity} has duplicate headers`).toBe(headers.length);
      for (const header of headers) {
        expect(header, `${entity}.${header} is not snake_case`).toMatch(SNAKE_CASE);
      }
    }
  });

  it('events headers match the plan contract exactly', () => {
    expect(csvHeadersFor('events')).toEqual([
      'id',
      'name',
      'business_name',
      'class',
      'implementation_method',
      'dl_event_name',
      'category',
      'status',
      'certified',
      'priority',
      'description',
      'purpose',
      'page',
      'trigger_text',
      'grain',
      'identity_note',
      'owner_business',
      'owner_technical',
      'expiration_json',
      'not_suitable_for',
      'agent_instructions',
      'derived_metrics_json',
      'tags_json',
      'property_count',
      'variant_count',
      'created_at',
      'updated_at',
    ]);
  });

  it('properties headers match the plan contract exactly', () => {
    expect(csvHeadersFor('properties')).toEqual([
      'id',
      'scope',
      'name',
      'category',
      'property_category',
      'category_override',
      'description',
      'data_type',
      'data_formats_json',
      'pii',
      'property_type',
      'allowed_values_json',
      'example_values_json',
      'item_schema_json',
      'kind',
      'derivation_json',
      'bloomreach_customer_property',
      'priority',
      'status',
      'notes',
      'created_at',
      'updated_at',
    ]);
  });

  it('observations carries timestamp_iso right after timestamp (pre-QA fix, LOW 3)', () => {
    const headers = csvHeadersFor('observations');
    const timestampIndex = headers.indexOf('timestamp');
    expect(timestampIndex).toBeGreaterThanOrEqual(0);
    expect(headers[timestampIndex + 1]).toBe('timestamp_iso');
  });

  it('use_cases carries activation/assets_json ahead of D-56 (phase 4)', () => {
    expect(csvHeadersFor('use_cases')).toContain('activation');
    expect(csvHeadersFor('use_cases')).toContain('assets_json');
  });

  it('isCsvEntity narrows unknown strings', () => {
    expect(isCsvEntity('events')).toBe(true);
    expect(isCsvEntity('not_a_real_entity')).toBe(false);
  });

  it('change_log and comments are declared', () => {
    expect(CSV_ENTITY_NAMES).toContain('change_log');
    expect(CSV_ENTITY_NAMES).toContain('comments');
  });
});

describe('catalog and source columns (D-61, D-62)', () => {
  it('catalogs carry kind, market, language, version and live_at; sources is an entity', () => {
    expect(csvHeadersFor('catalogs')).toEqual(expect.arrayContaining(['kind', 'market', 'language', 'version', 'live_at']));
    expect(CSV_ENTITY_NAMES).toContain('sources');
    expect(csvHeadersFor('sources')).toEqual(['id', 'name', 'system', 'method', 'color', 'is_default']);
  });
});
