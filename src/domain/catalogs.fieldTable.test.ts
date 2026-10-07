import { describe, expect, it } from 'vitest';
import { CATALOG_SEARCHABLE_LIMIT } from './enums';
import { moveFieldByKey, setLookupKey, validateCatalogFields, type CatalogFieldDraftLike } from './catalogs';

const f = (key: string, over: Partial<CatalogFieldDraftLike> = {}): CatalogFieldDraftLike => ({
  key, name: key, data_type: 'string', is_lookup_key: false, is_searchable: false, ...over,
});

describe('validateCatalogFields', () => {
  it('accepts a clean list, and a list with no lookup key yet', () => {
    expect(validateCatalogFields([f('a', { is_lookup_key: true }), f('b')]).ok).toBe(true);
    expect(validateCatalogFields([f('a')]).ok).toBe(true);
  });
  it('flags empty and duplicate names', () => {
    const v = validateCatalogFields([f('a'), f('k2', { name: '  ' }), f('k3', { name: 'a' })]);
    expect(v.ok).toBe(false);
    expect(v.rowErrors.k2).toContain('Name is required.');
    expect(v.rowErrors.a?.[0]).toMatch(/Duplicate/);
    expect(v.rowErrors.k3?.[0]).toMatch(/Duplicate/);
  });
  it('flags a non-string lookup key and several lookup keys', () => {
    expect(validateCatalogFields([f('a', { is_lookup_key: true, data_type: 'number' })]).reasons[0]).toMatch(/string/);
    const v = validateCatalogFields([f('a', { is_lookup_key: true }), f('b', { is_lookup_key: true })]);
    expect(v.reasons).toContain('More than one field is the lookup key.');
  });
  it('flags more than the searchable limit but not exactly the limit', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => f(`f${i}`, { is_searchable: true }));
    expect(validateCatalogFields(mk(CATALOG_SEARCHABLE_LIMIT)).ok).toBe(true);
    const v = validateCatalogFields(mk(CATALOG_SEARCHABLE_LIMIT + 1));
    expect(v.ok).toBe(false);
    expect(v.searchableCount).toBe(CATALOG_SEARCHABLE_LIMIT + 1);
  });
});

describe('reorder and lookup key helpers', () => {
  it('moves up and down, and stays put at the ends', () => {
    const l = [f('a'), f('b'), f('c')];
    expect(moveFieldByKey(l, 'b', -1).map((x) => x.key)).toEqual(['b', 'a', 'c']);
    expect(moveFieldByKey(l, 'b', 1).map((x) => x.key)).toEqual(['a', 'c', 'b']);
    expect(moveFieldByKey(l, 'a', -1).map((x) => x.key)).toEqual(['a', 'b', 'c']);
    expect(moveFieldByKey(l, 'zz', 1).map((x) => x.key)).toEqual(['a', 'b', 'c']);
  });
  it('setLookupKey keeps exactly one key and forces string', () => {
    const r = setLookupKey([f('a', { is_lookup_key: true }), f('b', { data_type: 'number' })], 'b');
    expect(r.map((x) => x.is_lookup_key)).toEqual([false, true]);
    expect(r[1].data_type).toBe('string');
  });
});
