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
