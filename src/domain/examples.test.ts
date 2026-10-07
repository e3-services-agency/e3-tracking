import { describe, expect, it } from 'vitest';
import { displaySampleValue, exampleValueStrings, formatExampleValues, parseBloomreachExample, toExampleValuesJson } from './examples';

describe('parseBloomreachExample', () => {
  it('unwraps quoted and bracketed text', () => {
    expect(parseBloomreachExample('"2023"]')).toEqual(['2023']);
    expect(parseBloomreachExample('"yes"')).toEqual(['yes']);
    expect(parseBloomreachExample('["a","b"]')).toEqual(['a', 'b']);
  });
  it('keeps plain text and drops empty markers', () => {
    expect(parseBloomreachExample('cg_1_no, cg_2_sunday')).toEqual(['cg_1_no, cg_2_sunday']);
    expect(parseBloomreachExample('(empty)')).toEqual([]);
    expect(parseBloomreachExample(null)).toEqual([]);
    expect(toExampleValuesJson('"x"')).toEqual([{ value: 'x' }]);
  });
});

describe('example rendering', () => {
  it('renders stored shapes readably, never escaped JSON', () => {
    expect(formatExampleValues([{ value: '2023' }])).toBe('2023');
    expect(formatExampleValues([{ value: 'a' }, { value: 'b' }])).toBe('a, b');
    expect(formatExampleValues(['a', 'b'])).toBe('a, b');
    expect(formatExampleValues(null)).toBe('');
    // stored strings render as stored: no re-parsing at render time
    expect(formatExampleValues([{ value: '"hello"' }])).toBe('"hello"');
    expect(exampleValueStrings([{ value: '"a","b"' }])).toEqual(['"a","b"']);
    expect(exampleValueStrings('["x","y"]')).toEqual(['["x","y"]']);
  });
  it('display sample values', () => {
    expect(displaySampleValue('a')).toEqual({ text: 'a', block: false });
    expect(displaySampleValue(['a', 1])).toEqual({ text: 'a, 1', block: false });
    expect(displaySampleValue({ a: 1 })).toEqual({ text: '{\n  "a": 1\n}', block: true });
    expect(displaySampleValue(null).text).toBe('');
  });
});

import { exampleValuesFor, isExampleAllowed, exampleWarnings, splitEnumExampleCell } from './examples';

describe('exampleValuesFor (T-5-11)', () => {
  const allowed = [{ value: 'add' }, { value: 'remove' }, { value: 'view' }];
  it('uses the stored examples when there is no allowed set', () => {
    expect(exampleValuesFor({ allowed_values_json: [], example_values_json: [{ value: 'x' }] })).toEqual([{ value: 'x' }]);
  });
  it('ignores stored examples outside the set and fills from allowed values', () => {
    expect(exampleValuesFor({ allowed_values_json: allowed, example_values_json: [{ value: 'click' }] })).toEqual([{ value: 'add' }, { value: 'remove' }]);
  });
  it('puts allowed stored examples first, deduped', () => {
    expect(exampleValuesFor({ allowed_values_json: allowed, example_values_json: [{ value: 'view' }, { value: 'view' }, { value: 'nope' }] })).toEqual([{ value: 'view' }, { value: 'add' }]);
  });
  it('validates and warns', () => {
    expect(isExampleAllowed({ allowed_values_json: allowed, example_values_json: [{ value: 'click' }] })).toBe(false);
    expect(isExampleAllowed({ allowed_values_json: [], example_values_json: [{ value: 'click' }] })).toBe(true);
    expect(exampleWarnings({ allowed_values_json: allowed, example_values_json: [{ value: 'click' }] })).toEqual(['example click is not an allowed value']);
  });
  it('splits a sheet cell only when all tokens are allowed', () => {
    expect(splitEnumExampleCell('add / remove / ...', ['add', 'remove'])).toEqual(['add', 'remove']);
    expect(splitEnumExampleCell('click', ['add'])).toBeNull();
  });
});

describe('exampleValuesFor typed enums', () => {
  it('keeps the allowed value type', () => {
    expect(exampleValuesFor({ allowed_values_json: [{ value: 1 }, { value: 2 }, { value: 3 }], example_values_json: [{ value: '2' }] })).toEqual([{ value: 2 }, { value: 1 }]);
    expect(exampleValuesFor({ allowed_values_json: [{ value: true }], example_values_json: [] })).toEqual([{ value: true }]);
  });
});
