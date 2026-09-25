import { describe, expect, it } from 'vitest';
import { toAppType, toDataManagerType, KNOWN_DATA_MANAGER_TYPES } from './dataManagerTypes';

describe('dataManagerTypes', () => {
  it('maps every row of the D-37 mapping table forward (toAppType)', () => {
    expect(toAppType('string')).toMatchObject({ data_type: 'string', data_formats: [] });
    expect(toAppType('long text')).toMatchObject({ data_type: 'string', data_formats: ['long_text'] });
    expect(toAppType('url')).toMatchObject({ data_type: 'string', data_formats: ['uri'] });
    expect(toAppType('number')).toMatchObject({ data_type: 'number', data_formats: [] });
    expect(toAppType('boolean')).toMatchObject({ data_type: 'boolean', data_formats: [] });
    expect(toAppType('date')).toMatchObject({ data_type: 'timestamp', data_formats: ['iso8601_date'] });
    expect(toAppType('datetime')).toMatchObject({ data_type: 'timestamp', data_formats: [] });
    expect(toAppType('list')).toMatchObject({ data_type: 'array', data_formats: [] });
    for (const t of KNOWN_DATA_MANAGER_TYPES) {
      expect(toAppType(t).warning).toBeNull();
    }
  });

  it('warns and defaults to string on an unknown Data Manager type', () => {
    const result = toAppType('geo_point');
    expect(result).toEqual({ data_type: 'string', data_formats: [], warning: expect.stringContaining('geo_point') });
  });

  it('maps every row of the D-37 mapping table in reverse (toDataManagerType)', () => {
    expect(toDataManagerType('string', [])).toEqual({ type: 'string', warning: null });
    expect(toDataManagerType('string', ['long_text'])).toEqual({ type: 'long text', warning: null });
    expect(toDataManagerType('string', ['uri'])).toEqual({ type: 'url', warning: null });
    expect(toDataManagerType('number', [])).toEqual({ type: 'number', warning: null });
    expect(toDataManagerType('number', ['money'])).toEqual({ type: 'number', warning: null });
    expect(toDataManagerType('boolean', [])).toEqual({ type: 'boolean', warning: null });
    expect(toDataManagerType('timestamp', ['iso8601_date'])).toEqual({ type: 'date', warning: null });
    expect(toDataManagerType('timestamp', [])).toEqual({ type: 'datetime', warning: null });
    expect(toDataManagerType('timestamp', ['iso8601_datetime'])).toEqual({ type: 'datetime', warning: null });
    expect(toDataManagerType('array', [])).toEqual({ type: 'list', warning: null });
  });

  it('exports object as string with a warning (Bloomreach has no object type)', () => {
    const result = toDataManagerType('object', []);
    expect(result.type).toBe('string');
    expect(result.warning).toMatch(/object/);
  });

  it('round-trips: toAppType then toDataManagerType returns the original Data Manager type for every known type', () => {
    for (const dmType of KNOWN_DATA_MANAGER_TYPES) {
      const { data_type, data_formats } = toAppType(dmType);
      expect(toDataManagerType(data_type, data_formats).type).toBe(dmType);
    }
  });
});
