import { describe, it, expect } from 'vitest';
import {
  PROPERTY_CATEGORIES,
  SYSTEM_CUSTOMER_PROPERTIES,
  classifyProperty,
  recommendedFormatsFor,
} from './propertyCategory';
import { PROPERTY_DATA_FORMATS } from './enums';
import { FORMAT_CHECKS, RECOMMENDATION_ONLY_FORMATS, isIanaTimezone } from './comparison/valueChecks';
import { inferPropertyKind } from './codegen/defaults';

describe('classifyProperty (D-64)', () => {
  it('has the four categories', () => {
    expect(PROPERTY_CATEGORIES).toEqual(['system_customer', 'customer', 'sdk_default', 'event']);
  });
  it('classifies reserved customer names as system_customer, other customer names as customer', () => {
    for (const p of SYSTEM_CUSTOMER_PROPERTIES) expect(classifyProperty({ scope: 'customer', name: p.name })).toBe('system_customer');
    expect(classifyProperty({ scope: 'customer', name: 'loyalty_tier' })).toBe('customer');
  });
  it('does not treat an event property named email as system customer', () => {
    expect(classifyProperty({ scope: 'event', name: 'email' })).toBe('event');
  });
  it('classifies SDK defaults on event scope only', () => {
    for (const n of ['os', 'browser', 'device', 'location']) expect(classifyProperty({ scope: 'event', name: n })).toBe('sdk_default');
    expect(classifyProperty({ scope: 'customer', name: 'os' })).toBe('customer');
  });
  it('override wins; an invalid override is ignored', () => {
    expect(classifyProperty({ scope: 'customer', name: 'email', category_override: 'customer' })).toBe('customer');
    expect(classifyProperty({ scope: 'event', name: 'x', category_override: 'sdk_default' })).toBe('sdk_default');
    expect(classifyProperty({ scope: 'event', name: 'x', category_override: 'bogus' })).toBe('event');
  });
  it('recommends formats only for system customer properties', () => {
    expect(recommendedFormatsFor({ scope: 'customer', name: 'phone' })).toEqual(['e164_phone']);
    expect(recommendedFormatsFor({ scope: 'customer', name: 'foo' })).toEqual([]);
    expect(recommendedFormatsFor({ scope: 'customer', name: 'phone', category_override: 'customer' })).toEqual([]);
  });
  it('every recommended format is known; only title_case is recommendation-only', () => {
    for (const p of SYSTEM_CUSTOMER_PROPERTIES) {
      for (const f of p.formats) {
        expect(PROPERTY_DATA_FORMATS).toContain(f);
        expect(Boolean(FORMAT_CHECKS[f])).toBe(!RECOMMENDATION_ONLY_FORMATS.includes(f));
      }
    }
  });
  it('an SDK default name infers kind context, other event names stay event', () => {
    expect(inferPropertyKind('browser', 'string', 'event').kind).toBe('context');
    expect(inferPropertyKind('browser', 'string', 'customer').kind).toBe('event');
    expect(inferPropertyKind('page', 'string', 'event').kind).toBe('event');
  });
});

describe('system customer format checks', () => {
  it('phone E.164', () => {
    expect(FORMAT_CHECKS.e164_phone('+421900123456')).toBe(true);
    expect(FORMAT_CHECKS.e164_phone('0900 123 456')).toBe(false);
    expect(FORMAT_CHECKS.e164_phone('+12')).toBe(false);
  });
  it('country alpha-2', () => {
    expect(FORMAT_CHECKS.country_code('SK')).toBe(true);
    expect(FORMAT_CHECKS.country_code('sk')).toBe(false);
    expect(FORMAT_CHECKS.country_code('SVK')).toBe(false);
  });
  it('language with optional region', () => {
    expect(FORMAT_CHECKS.language_tag('en')).toBe(true);
    expect(FORMAT_CHECKS.language_tag('pt-BR')).toBe(true);
    expect(FORMAT_CHECKS.language_tag('EN')).toBe(false);
    expect(FORMAT_CHECKS.language_tag('english')).toBe(false);
  });
  it('IANA timezone', () => {
    expect(FORMAT_CHECKS.iana_timezone('Europe/Bratislava')).toBe(true);
    expect(FORMAT_CHECKS.iana_timezone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isIanaTimezone('UTC')).toBe(true);
    expect(FORMAT_CHECKS.iana_timezone('Mars/Olympus')).toBe(false);
    expect(FORMAT_CHECKS.iana_timezone('CET+1')).toBe(false);
    expect(FORMAT_CHECKS.iana_timezone('')).toBe(false);
  });
  it('email', () => {
    expect(FORMAT_CHECKS.email('a@b.co')).toBe(true);
    expect(FORMAT_CHECKS.email('a@b')).toBe(false);
  });
  it('title_case has no check', () => {
    expect(FORMAT_CHECKS.title_case).toBeUndefined();
  });
});
