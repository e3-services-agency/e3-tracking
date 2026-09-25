import { describe, expect, it } from 'vitest';
import { checkDataFormat, checkDataType, isE164Phone } from './valueChecks';

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
