import { describe, expect, it } from 'vitest';
import { checkDataFormat, checkDataType, isE164Phone, jsType, matchesDataType, FORMAT_CHECKS } from './valueChecks';

describe('isE164Phone (D-30)', () => {
  it('accepts a "+" prefixed number', () => expect(isE164Phone('+420123456789')).toBe(true));
  it('accepts a "00" prefixed number', () => expect(isE164Phone('00420123456789')).toBe(true));
  it('rejects a number with no "+"/"00" prefix', () => expect(isE164Phone('420123456789')).toBe(false));
  it('rejects fewer than 8 digits', () => expect(isE164Phone('+4201234')).toBe(false));
  it('rejects more than 15 digits', () => expect(isE164Phone('+42012345678901234')).toBe(false));
  it('rejects non-digit characters', () => expect(isE164Phone('+420-123-456')).toBe(false));
  it('rejects a non-string', () => expect(isE164Phone(420123456789)).toBe(false));
});

describe('checkDataType', () => {
  it('string', () => {
    expect(checkDataType('x', 'string')).toBe(true);
    expect(checkDataType(1, 'string')).toBe(false);
  });
  it('number (accepts numeric strings)', () => {
    expect(checkDataType(1, 'number')).toBe(true);
    expect(checkDataType('1.5', 'number')).toBe(true);
    expect(checkDataType('x', 'number')).toBe(false);
  });
  it('boolean', () => {
    expect(checkDataType(true, 'boolean')).toBe(true);
    expect(checkDataType('true', 'boolean')).toBe(false);
  });
  it('array', () => {
    expect(checkDataType([], 'array')).toBe(true);
    expect(checkDataType({}, 'array')).toBe(false);
  });
});

describe('checkDataFormat', () => {
  it('e164_phone', () => {
    expect(checkDataFormat('+420123456789', 'e164_phone')).toBe(true);
    expect(checkDataFormat('420', 'e164_phone')).toBe(false);
  });
  it('email', () => {
    expect(checkDataFormat('a@b.com', 'email')).toBe(true);
    expect(checkDataFormat('not-an-email', 'email')).toBe(false);
  });
  it('unknown format passes through (not checked)', () => {
    expect(checkDataFormat('anything', 'money')).toBe(true);
  });
});

describe('jsType', () => {
  it('distinguishes array, null and object', () => {
    expect(jsType([])).toBe('array');
    expect(jsType(null)).toBe('null');
    expect(jsType(undefined)).toBe('null');
    expect(jsType({})).toBe('object');
    expect(jsType('x')).toBe('string');
  });
});

describe('matchesDataType', () => {
  it('timestamp accepts a number or an ISO string', () => {
    expect(matchesDataType('timestamp', 1723580094)).toBe(true);
    expect(matchesDataType('timestamp', '2024-08-13T00:00:00Z')).toBe(true);
    expect(matchesDataType('timestamp', 'not-a-date')).toBe(false);
  });
  it('string/number/boolean/object/array require an exact JS type', () => {
    expect(matchesDataType('string', 1)).toBe(false);
    expect(matchesDataType('number', '1')).toBe(false);
    expect(matchesDataType('boolean', 'true')).toBe(false);
    expect(matchesDataType('array', {})).toBe(false);
    expect(matchesDataType('object', [])).toBe(false);
  });
});

describe('FORMAT_CHECKS', () => {
  it('covers email, uri, uuid, iso8601_date, iso8601_datetime, currency_code, country_code, language_code, e164_phone', () => {
    expect(FORMAT_CHECKS.email('a@b.com')).toBe(true);
    expect(FORMAT_CHECKS.uri('https://example.com')).toBe(true);
    expect(FORMAT_CHECKS.uri('not a uri')).toBe(false);
    expect(FORMAT_CHECKS.uuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(FORMAT_CHECKS.iso8601_date('2024-08-13')).toBe(true);
    expect(FORMAT_CHECKS.iso8601_datetime('2024-08-13T00:00:00Z')).toBe(true);
    expect(FORMAT_CHECKS.currency_code('EUR')).toBe(true);
    expect(FORMAT_CHECKS.country_code('CZ')).toBe(true);
    expect(FORMAT_CHECKS.language_code('en')).toBe(true);
    expect(FORMAT_CHECKS.e164_phone('+420123456789')).toBe(true);
  });
});
