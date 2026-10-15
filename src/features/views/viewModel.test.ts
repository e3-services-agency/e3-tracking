import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DENSITY,
  DENSITY_STORAGE_KEY,
  filterOptions,
  matchesFilter,
  matchesSearch,
  readDensity,
  withKnownOrder,
  writeDensity,
} from './viewModel';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('density storage', () => {
  it('defaults to comfortable without storage, with blocked storage and with a foreign value', () => {
    expect(DEFAULT_DENSITY).toBe('comfortable');
    expect(readDensity(null)).toBe('comfortable');
    expect(readDensity(throwing)).toBe('comfortable');
    const s = memory();
    s.setItem(DENSITY_STORAGE_KEY, 'huge');
    expect(readDensity(s)).toBe('comfortable');
  });

  it('remembers the choice and never throws when storage is blocked', () => {
    const s = memory();
    writeDensity(s, 'compact');
    expect(s.data.get(DENSITY_STORAGE_KEY)).toBe('compact');
    expect(readDensity(s)).toBe('compact');
    expect(() => writeDensity(throwing, 'compact')).not.toThrow();
    expect(() => writeDensity(undefined, 'compact')).not.toThrow();
  });
});

describe('search and filters', () => {
  it('matches case-insensitively across fields and ignores empty fields', () => {
    expect(matchesSearch('', 'a')).toBe(true);
    expect(matchesSearch('  ', null)).toBe(true);
    expect(matchesSearch('CART', 'view_item', null, 'Add to cart')).toBe(true);
    expect(matchesSearch('purchase', 'view_item', undefined)).toBe(false);
  });

  it('treats an empty filter as all and a list value as any-of', () => {
    expect(matchesFilter('', null)).toBe(true);
    expect(matchesFilter('planned', 'planned')).toBe(true);
    expect(matchesFilter('planned', null)).toBe(false);
    expect(matchesFilter('Shopify via GTM', ['Web SDK', 'Shopify via GTM'])).toBe(true);
    expect(matchesFilter('Shopify via GTM', [])).toBe(false);
  });

  it('builds sorted distinct options and keeps the known order first', () => {
    const rows = [{ s: 'b' }, { s: null }, { s: 'a' }, { s: 'b' }];
    expect(filterOptions(rows, (r) => r.s)).toEqual(['a', 'b']);
    expect(filterOptions([{ l: ['y', 'x'] }, { l: ['x'] }], (r) => r.l)).toEqual(['x', 'y']);
    expect(withKnownOrder(['planned', 'implemented'], ['custom_state', 'planned'])).toEqual(['planned', 'implemented', 'custom_state']);
  });
});
