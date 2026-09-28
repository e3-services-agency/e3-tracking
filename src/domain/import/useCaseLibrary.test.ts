/**
 * `parseUseCaseLibrary` tests (T-3-06): the sample library parses clean with no warnings, and each
 * strict-but-forgiving drop path (bad `type`, unknown `target_kind`, missing `event_name`,
 * duplicate `code`) produces exactly the warning it should and drops only what it must, never
 * throwing.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseUseCaseLibrary } from './useCaseLibrary';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/use-case-library-sample.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

const uccFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/use-case-library-ucc.json');
const uccFixture = JSON.parse(fs.readFileSync(uccFixturePath, 'utf-8'));

describe('parseUseCaseLibrary', () => {
  it('parses the sample library with no warnings and three templates', () => {
    const model = parseUseCaseLibrary(fixture);
    expect(model.warnings).toEqual([]);
    expect(model.templates.map((t) => t.code)).toEqual(['UC-01', 'UC-02', 'UC-03']);
    const uc01 = model.templates[0];
    expect(uc01.name).toBe('Abandoned cart');
    expect(uc01.type).toBe('marketing');
    expect(uc01.tags.channels).toEqual(['email']);
    expect(uc01.flags.popular).toBe(true);
    expect(uc01.flags.new).toBe(false);
    expect(uc01.default_requirements).toHaveLength(5);
  });

  it('rejects a non-object payload with one warning and no templates', () => {
    expect(parseUseCaseLibrary(null)).toEqual({ templates: [], warnings: ['use case library JSON must be an object.'] });
    expect(parseUseCaseLibrary('nope').warnings).toHaveLength(1);
  });

  it('warns but still parses when format/version do not match', () => {
    const model = parseUseCaseLibrary({ format: 'something-else', version: 2, templates: [] });
    expect(model.warnings).toEqual([
      'format "something-else" is not "e3-use-case-library"; parsing anyway.',
      'version "2" is not 1; parsing anyway.',
    ]);
    expect(model.templates).toEqual([]);
  });

  it('drops a template with an invalid type and warns', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [{ code: 'UC-X', name: 'Bad type', type: 'not-a-type', default_requirements: [] }],
    });
    expect(model.templates).toEqual([]);
    expect(model.warnings).toEqual([
      'templates[code=UC-X].type "not-a-type" is not one of marketing, transactional; skipped.',
    ]);
  });

  it('drops one requirement entry with an unknown target_kind but keeps the template', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-Y',
          name: 'Unknown target kind',
          type: 'marketing',
          default_requirements: [
            { target_kind: 'not_a_kind', event_name: 'checkout', level: 'R' },
            { target_kind: 'event', event_name: 'checkout', level: 'R' },
          ],
        },
      ],
    });
    expect(model.templates).toHaveLength(1);
    expect(model.templates[0].default_requirements).toHaveLength(1);
    expect(model.templates[0].default_requirements[0].target_kind).toBe('event');
    expect(model.warnings.some((w) => w.includes('not_a_kind'))).toBe(true);
  });

  it('accepts catalog_attribute and consent target kinds without warning (D-57: validated here, resolved in T-3-10)', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-Z',
          name: 'Catalog and consent',
          type: 'marketing',
          default_requirements: [
            { target_kind: 'catalog_attribute', field_name: 'image', level: 'R' },
            { target_kind: 'consent', property_name: 'newsletter', level: 'R' },
          ],
        },
      ],
    });
    expect(model.warnings).toEqual([]);
    expect(model.templates[0].default_requirements).toHaveLength(2);
  });

  it('INFO 4 (pre-QA fix, 2026-09-28): warns, but keeps, an event_property/variant_property whose property_name is not a standard field of its standard_event', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-STDFIELD',
          name: 'Non-standard field name',
          type: 'transactional',
          default_requirements: [
            { target_kind: 'event_property', standard_event: 'purchase', property_name: 'nonexistent_std_field', level: 'R' },
            { target_kind: 'event_property', standard_event: 'purchase', property_name: 'total_price', level: 'R' },
          ],
        },
      ],
    });
    expect(model.templates[0].default_requirements).toHaveLength(2); // never dropped
    expect(model.warnings).toHaveLength(1);
    expect(model.warnings[0]).toContain('"nonexistent_std_field"');
    expect(model.warnings[0]).toContain('standard_event "purchase"');
  });

  it('INFO 4: does not warn for a custom event outside the catalog (no standard_event) or an unknown standard_event key', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-NOWARN',
          name: 'No warning cases',
          type: 'marketing',
          default_requirements: [
            { target_kind: 'event_property', event_name: 'wishlist_add', property_name: 'anything', level: 'R' },
            { target_kind: 'event_property', standard_event: 'not_a_real_standard_event', event_name: 'x', property_name: 'anything', level: 'R' },
          ],
        },
      ],
    });
    expect(model.warnings).toEqual([]);
  });

  it('drops a requirement entry missing event_name for an event-scoped target_kind', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-W',
          name: 'Missing event name',
          type: 'marketing',
          default_requirements: [{ target_kind: 'event', level: 'R' }],
        },
      ],
    });
    expect(model.templates[0].default_requirements).toHaveLength(0);
    expect(model.warnings.some((w) => w.includes('event_name'))).toBe(true);
  });

  it('drops the second occurrence of a duplicate code and warns, keeping the first', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        { code: 'UC-DUP', name: 'First', type: 'marketing', default_requirements: [] },
        { code: 'UC-DUP', name: 'Second', type: 'marketing', default_requirements: [] },
      ],
    });
    expect(model.templates).toHaveLength(1);
    expect(model.templates[0].name).toBe('First');
    expect(model.warnings.some((w) => w.includes('duplicates code "UC-DUP"'))).toBe(true);
  });

  it('keeps a tag value outside the suggested vocabulary with a warning instead of dropping it', () => {
    const model = parseUseCaseLibrary({
      format: 'e3-use-case-library',
      version: 1,
      templates: [
        {
          code: 'UC-TAG',
          name: 'Custom tag',
          type: 'marketing',
          tags: { channels: ['carrier_pigeon'] },
          default_requirements: [],
        },
      ],
    });
    expect(model.templates[0].tags.channels).toEqual(['carrier_pigeon']);
    expect(model.warnings.some((w) => w.includes('carrier_pigeon'))).toBe(true);
  });

  it('parses the Use Case Center library (T-4-07) with no warnings, unique codes and at least 60 templates', () => {
    const model = parseUseCaseLibrary(uccFixture);
    expect(model.warnings).toEqual([]);
    expect(model.templates.length).toBeGreaterThanOrEqual(60);
    const codes = model.templates.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^UCC-(email|web|omni|mobile|paid|analytics)-\d{2}$/.test(c))).toBe(true);
  });
});
