import { describe, expect, it } from 'vitest';
import { catalogLinkComment, marketsLabel, withCatalogComment } from './catalogLinks';

describe('catalog link comments', () => {
  it('renders one line per link, and nothing without links', () => {
    expect(catalogLinkComment(undefined)).toBe('');
    expect(catalogLinkComment([])).toBe('');
    expect(
      catalogLinkComment([
        { property: 'product_id', catalog: 'products_gb', field: 'item_id', markets: 'all markets' },
        { property: 'variant_id', catalog: 'variants_gb', field: 'item_id', markets: 'GB, CZ' },
      ])
    ).toBe('// product_id looks up products_gb by item_id; all markets\n// variant_id looks up variants_gb by item_id; GB, CZ');
  });

  it('prepends to a snippet and leaves a blank one blank', () => {
    expect(withCatalogComment('code();', '// c')).toBe('// c\ncode();');
    expect(withCatalogComment('', '// c')).toBe('');
    expect(withCatalogComment('code();', '')).toBe('code();');
  });

  it('says all markets or lists the markets that have the field', () => {
    expect(marketsLabel([{ name: 'a', market: 'GB', has_field: true }, { name: 'b', market: 'CZ', has_field: true }])).toBe('all markets');
    expect(marketsLabel([{ name: 'a', market: 'GB', has_field: true }, { name: 'b', market: 'CZ', has_field: false }])).toBe('GB');
    expect(marketsLabel([{ name: 'a', market: null, has_field: true }, { name: 'b', market: 'CZ', has_field: false }])).toBe('a');
  });
});
