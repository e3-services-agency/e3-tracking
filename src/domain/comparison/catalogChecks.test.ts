import { describe, expect, it } from 'vitest';
import { runCatalogChecks, typeFamily, type CatalogCheckCatalog, type CatalogCheckField, type CatalogCheckProperty } from './catalogChecks';

let n = 0;
const field = (name: string, over: Partial<CatalogCheckField> = {}): CatalogCheckField => ({
  id: `f${++n}`,
  name,
  data_type: 'string',
  is_lookup_key: false,
  is_searchable: false,
  client_field_name: null,
  bloomreach_column: null,
  ...over,
});
const catalog = (name: string, fields: CatalogCheckField[], over: Partial<CatalogCheckCatalog> = {}): CatalogCheckCatalog => ({
  id: `c-${name}`,
  name,
  kind: 'product',
  market: null,
  language: null,
  version: 'v1',
  live_at: null,
  searchable_snapshot: null,
  fields,
  ...over,
});
const prop = (name: string, over: Partial<CatalogCheckProperty> = {}): CatalogCheckProperty => ({
  id: `p-${name}`,
  name,
  scope: 'event',
  data_type: 'string',
  mapped_catalog_id: null,
  mapped_catalog_field_id: null,
  ...over,
});
const kinds = (f: { kind: string }[]) => f.map((x) => x.kind);

describe('runCatalogChecks: per catalog', () => {
  it('flags the searchable count: nothing at 39, warning at 40, error at 41', () => {
    const fields = (count: number) => [field('product_id', { is_lookup_key: true }), ...Array.from({ length: count }, (_, i) => field(`s${i}`, { is_searchable: true }))];
    expect(runCatalogChecks({ catalogs: [catalog('a', fields(39))], properties: [] })).toEqual([]);
    const warn = runCatalogChecks({ catalogs: [catalog('a', fields(40))], properties: [] });
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ comparison: 'catalogs', kind: 'catalog_searchable_limit', severity: 'warning' });
    const err = runCatalogChecks({ catalogs: [catalog('a', fields(41))], properties: [] });
    expect(err[0]).toMatchObject({ kind: 'catalog_searchable_limit', severity: 'error' });
  });

  it('flags a live v1 catalog whose searchable set changed, but not v2 or one that never went live', () => {
    const f = [field('product_id', { is_lookup_key: true }), field('title', { is_searchable: true }), field('brand', { is_searchable: true })];
    const live = { live_at: '2026-01-01T00:00:00Z', searchable_snapshot: ['title'] };
    const out = runCatalogChecks({ catalogs: [catalog('a', f, live)], properties: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'catalog_searchable_changed', severity: 'error' });
    expect(out[0].message).toContain('added "brand"');
    expect(runCatalogChecks({ catalogs: [catalog('a', f, { ...live, version: 'v2' })], properties: [] })).toEqual([]);
    expect(runCatalogChecks({ catalogs: [catalog('a', f)], properties: [] })).toEqual([]);
    expect(runCatalogChecks({ catalogs: [catalog('a', f, { ...live, searchable_snapshot: ['brand', 'title'] })], properties: [] })).toEqual([]);
  });

  it('requires exactly one lookup key', () => {
    const none = runCatalogChecks({ catalogs: [catalog('a', [field('title')])], properties: [] });
    expect(none[0]).toMatchObject({ kind: 'catalog_lookup_key', severity: 'error' });
    expect(none[0].message).toContain('no lookup key');
    const two = runCatalogChecks({ catalogs: [catalog('a', [field('x', { is_lookup_key: true }), field('y', { is_lookup_key: true })])], properties: [] });
    expect(two[0]).toMatchObject({ kind: 'catalog_lookup_key', severity: 'error' });
    expect(two[0].message).toContain('2 lookup key');
  });

  it('requires a key in the built-in item_id column to be readable as a property', () => {
    const key = field('item_id', { is_lookup_key: true, bloomreach_column: 'item_id' });
    const bad = runCatalogChecks({ catalogs: [catalog('a', [key])], properties: [] });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ kind: 'catalog_lookup_property', severity: 'error' });
    expect(bad[0].message).toContain('product_id');
    expect(bad[0].message).toContain('Jinja reads only properties');
    expect(runCatalogChecks({ catalogs: [catalog('a', [key, field('product_id')])], properties: [] })).toEqual([]);
    // a key that is a regular field is itself a property
    expect(runCatalogChecks({ catalogs: [catalog('a', [field('product_id', { is_lookup_key: true })])], properties: [] })).toEqual([]);
    // client_field_name wins over the kind default
    const named = field('item_id', { is_lookup_key: true, bloomreach_column: 'item_id', client_field_name: 'sku' });
    expect(runCatalogChecks({ catalogs: [catalog('a', [named, field('sku')])], properties: [] })).toEqual([]);
  });
});

describe('runCatalogChecks: schema drift across markets', () => {
  const schema = () => [field('product_id', { is_lookup_key: true }), field('title', { is_searchable: true }), field('price', { data_type: 'number' })];
  const gb = (fields = schema()) => catalog('products_gb', fields, { market: 'GB' });
  const cz = (fields = schema()) => catalog('products_cz', fields, { market: 'CZ' });

  it('is silent when markets share one schema, and for a single catalog or kind other', () => {
    expect(runCatalogChecks({ catalogs: [gb(), cz()], properties: [] })).toEqual([]);
    expect(runCatalogChecks({ catalogs: [gb()], properties: [] })).toEqual([]);
    const o1 = catalog('o1', [field('product_id', { is_lookup_key: true }), field('a')], { kind: 'other' });
    const o2 = catalog('o2', [field('product_id', { is_lookup_key: true }), field('b')], { kind: 'other' });
    expect(runCatalogChecks({ catalogs: [o1, o2], properties: [] })).toEqual([]);
  });

  it('warns once per field when a field is missing in one market', () => {
    const out = runCatalogChecks({ catalogs: [gb(), cz(schema().slice(0, 2))], properties: [] });
    expect(kinds(out)).toEqual(['catalog_schema_drift']);
    expect(out[0].severity).toBe('warning');
    expect(out[0].message).toContain('"price"');
    expect(out[0].message).toContain('missing in products_cz (CZ)');
  });

  it('warns when a type or the searchable flag differs', () => {
    const czFields = [field('product_id', { is_lookup_key: true }), field('title', { is_searchable: false }), field('price', { data_type: 'string' })];
    const out = runCatalogChecks({ catalogs: [gb(), cz(czFields)], properties: [] });
    expect(kinds(out)).toEqual(['catalog_schema_drift', 'catalog_schema_drift']);
    const messages = out.map((o) => o.message).join(' | ');
    expect(messages).toContain('different types');
    expect(messages).toContain('"title" is searchable in products_gb (GB) but not in products_cz (CZ)');
    expect(new Set(out.map((o) => o.fingerprint)).size).toBe(2);
  });

  it('keeps product and variant catalogs apart', () => {
    const v = catalog('variants_gb', [field('variant_id', { is_lookup_key: true })], { kind: 'variant', market: 'GB' });
    expect(runCatalogChecks({ catalogs: [gb(), v], properties: [] })).toEqual([]);
  });
});

describe('runCatalogChecks: alignment', () => {
  it('flags a property whose type differs from the linked catalog field, ignoring unknown vocabularies', () => {
    const price = field('price', { data_type: 'number' });
    const odd = field('thing', { data_type: 'geopoint' });
    const key = field('product_id', { is_lookup_key: true });
    const c = catalog('a', [key, price, odd]);
    const out = runCatalogChecks({
      catalogs: [c],
      properties: [
        prop('price', { data_type: 'string', mapped_catalog_field_id: price.id }),
        prop('thing', { data_type: 'string', mapped_catalog_field_id: odd.id }),
        prop('okprice', { data_type: 'number', mapped_catalog_field_id: price.id }),
      ],
    });
    expect(kinds(out)).toEqual(['catalog_type_mismatch']);
    expect(out[0]).toMatchObject({ severity: 'error', property_id: 'p-price' });
  });

  it('warns for id-named event properties not linked to the lookup key of the matching kind', () => {
    const pkey = field('product_id', { is_lookup_key: true });
    const vkey = field('variant_id', { is_lookup_key: true });
    const title = field('title');
    const products = catalog('products_gb', [pkey, title]);
    const variants = catalog('variants_gb', [vkey], { kind: 'variant' });
    const out = runCatalogChecks({
      catalogs: [products, variants],
      properties: [
        prop('product_id'),
        prop('item_id', { mapped_catalog_field_id: title.id }),
        prop('variant_id', { mapped_catalog_field_id: vkey.id }),
        prop('product_id_linked_elsewhere'),
        prop('customer_product_id', { scope: 'customer' }),
      ],
    });
    expect(out.map((o) => `${o.kind}:${o.property_id}`).sort()).toEqual(['catalog_link_missing:p-item_id', 'catalog_link_missing:p-product_id']);
    expect(out.every((o) => o.severity === 'warning')).toBe(true);
    // a property linked to the right key passes; with no catalog of the kind there is nothing to link to
    expect(runCatalogChecks({ catalogs: [products], properties: [prop('product_id', { mapped_catalog_field_id: pkey.id }), prop('variant_id')] })).toEqual([]);
  });

  it('a variant id linked to a product key does not satisfy the variant kind', () => {
    const pkey = field('product_id', { is_lookup_key: true });
    const vkey = field('variant_id', { is_lookup_key: true });
    const out = runCatalogChecks({
      catalogs: [catalog('p', [pkey]), catalog('v', [vkey], { kind: 'variant' })],
      properties: [prop('variant_id', { mapped_catalog_field_id: pkey.id })],
    });
    expect(kinds(out)).toEqual(['catalog_link_missing']);
  });
});

describe('typeFamily', () => {
  it('groups catalog and property type names', () => {
    expect(typeFamily('long text')).toBe('string');
    expect(typeFamily('integer')).toBe('number');
    expect(typeFamily('list')).toBe('array');
    expect(typeFamily('datetime')).toBe('timestamp');
    expect(typeFamily('geopoint')).toBeNull();
    expect(typeFamily(null)).toBeNull();
  });
});
