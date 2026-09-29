/**
 * Codegen v2 (D-63, T-4-17): the client's add_to_wishlist push (`samples/datalayer-wishlist-legacy.js`)
 * converted to the D-63 shape, and the transformation `brPayload` producing the Bloomreach payload.
 */
import { describe, expect, it } from 'vitest';
import { BR_PAYLOAD_SOURCE, computeBrPayload } from './brPayload';
import { describeDerivation, parseDerivation, validateDerivation, dataLayerPath } from './derivation';
import { defaultImplementationMethod } from './defaults';
import {
  buildDataLayerModel,
  buildDataLayerV2,
  buildGtmTemplate,
  buildSdkDefaultProperties,
  buildWebSdkLegacy,
  buildWebSdkV2,
  describeSdkEmits,
  type CodegenProperty,
} from './snippets';

const prop = (
  name: string,
  kind: CodegenProperty['kind'],
  sample: unknown,
  extra: Partial<CodegenProperty> = {}
): CodegenProperty => ({ name, kind, derivation: null, required: true, sample, ...extra });

const list = (name: string, idField: string, form: 'ids' | 'id_quantity'): CodegenProperty =>
  prop(name, 'state_list', [], { derivation: { source: 'items', id_field: idField, form } });
const total = (name: string, sum: string): CodegenProperty =>
  prop(name, 'state_list', 123, { derivation: { source: 'items', sum } });

/** The wishlist fixture in D-63 terms. */
const WISHLIST: CodegenProperty[] = [
  prop('placement', 'event', 'plp'),
  prop('local_currency', 'event', 'EUR'),
  prop('store_country', 'context', 'DE', { role: 'context' }),
  prop('store_language', 'context', 'de', { role: 'context' }),
  prop('product_id', 'item', '15062099820869'),
  prop('variant_id', 'item', '54723199795525'),
  prop('sku_id', 'item', '30003749000056'),
  prop('price', 'item', 123),
  prop('price_local_currency', 'item', 123),
  prop('product_title', 'item', 'Longsleeve aus Bio-Baumwolle'),
  prop('details_sleeves', 'item', 'Langarm', { required: false }),
  list('product_ids', 'product_id', 'ids'),
  list('product_list', 'product_id', 'id_quantity'),
  list('variant_ids', 'variant_id', 'ids'),
  list('variant_list', 'variant_id', 'id_quantity'),
  list('sku_ids', 'sku_id', 'ids'),
  list('sku_list', 'sku_id', 'id_quantity'),
  total('total_price', 'price*quantity'),
  total('total_price_local_currency', 'price_local_currency*quantity'),
  total('total_quantity', 'quantity'),
];

describe('buildDataLayerModel with the wishlist fixture', () => {
  const model = buildDataLayerModel(WISHLIST);

  it('splits properties by kind', () => {
    expect(model.properties.map((p) => p.name)).toEqual(['local_currency', 'placement', 'store_country', 'store_language']);
    expect(model.item.map((p) => p.name)).toEqual([
      'price', 'price_local_currency', 'product_id', 'product_title', 'sku_id', 'variant_id', 'details_sleeves',
    ]);
    expect(model.computed.map((p) => p.name)).toEqual([
      'product_ids', 'product_list', 'sku_ids', 'sku_list', 'total_price', 'total_price_local_currency', 'total_quantity',
      'variant_ids', 'variant_list',
    ]);
  });

  it('builds one items entry with ids, quantity and summed fields', () => {
    expect(model.itemsEntry.map((f) => f.name)).toEqual([
      'product_id', 'sku_id', 'variant_id', 'quantity', 'price', 'price_local_currency',
    ]);
    expect(model.layer.items).toEqual([
      {
        product_id: '15062099820869',
        sku_id: '30003749000056',
        variant_id: '54723199795525',
        quantity: 1,
        price: 123,
        price_local_currency: 123,
      },
    ]);
  });

  it('produces the Bloomreach payload: item flattened, state lists from items, totals summed', () => {
    expect(model.payload).toMatchObject({
      placement: 'plp',
      local_currency: 'EUR',
      store_country: 'DE',
      product_id: '15062099820869',
      variant_id: '54723199795525',
      price: 123,
      product_ids: ['15062099820869'],
      product_list: [{ product_id: '15062099820869', quantity: 1 }],
      variant_ids: ['54723199795525'],
      variant_list: [{ variant_id: '54723199795525', quantity: 1 }],
      sku_ids: ['30003749000056'],
      sku_list: [{ sku_id: '30003749000056', quantity: 1 }],
      total_price: 123,
      total_price_local_currency: 123,
      total_quantity: 1,
    });
    // Required first (A-Z), then optional.
    const keys = Object.keys(model.payload);
    expect(keys[keys.length - 1]).toBe('details_sleeves');
    expect(model.requiredKeys.has('details_sleeves')).toBe(false);
  });
});

describe('buildDataLayerV2', () => {
  const names = { bloomreach: 'add_to_wishlist', dataLayer: 'add_to_wishlist' };
  const text = buildDataLayerV2(names, buildDataLayerModel(WISHLIST));

  it('starts with the E3 practice comment, the reset push, then the namespaced push', () => {
    const lines = text.split('\n');
    expect(lines[0]).toContain("E3's recommended practice");
    expect(text).toContain('client may structure');
    expect(text).toContain('validation always runs on the Bloomreach event payload');
    expect(text.indexOf('window.dataLayer.push({ bloomreach: null });')).toBeLessThan(
      text.indexOf('window.dataLayer.push({\n')
    );
  });

  it('keeps the site event name and nests event / properties / item / items under bloomreach', () => {
    expect(text).toContain("  event: 'add_to_wishlist', // the site's existing dataLayer event, unchanged");
    expect(text).toContain("  bloomreach: {\n    event: 'add_to_wishlist',\n    properties: {");
    expect(text).toContain("      placement: 'plp',");
    expect(text).toContain("    item: {");
    expect(text).toContain("      product_id: '15062099820869',");
    expect(text).toContain('      // Optional:\n      details_sleeves: \'Langarm\',');
    expect(text).toContain('    // Computed by brPayload from items: product_ids, product_list,');
    expect(text).toContain('    items: [');
    expect(text).toContain("        quantity: 1,");
  });

  it('does not put state lists or item attributes in properties', () => {
    const props = text.slice(text.indexOf('    properties: {'), text.indexOf('    item: {'));
    expect(props).not.toContain('product_ids');
    expect(props).not.toContain('product_id');
    expect(props).not.toContain('total_price');
  });

  it('uses a different site event name when dl_event_name differs', () => {
    const t = buildDataLayerV2({ bloomreach: 'add_to_wishlist', dataLayer: 'wishlist_add' }, buildDataLayerModel(WISHLIST));
    expect(t).toContain("  event: 'wishlist_add',");
    expect(t).toContain("    event: 'add_to_wishlist',");
  });

  it('prints an exact push for a small event without items', () => {
    const t = buildDataLayerV2(
      { bloomreach: 'page_ready', dataLayer: 'page_ready' },
      buildDataLayerModel([prop('page_type', 'event', 'home')])
    );
    expect(t.split('\n').slice(3)).toEqual([
      'window.dataLayer = window.dataLayer || [];',
      'window.dataLayer.push({ bloomreach: null }); // reset, so nothing leaks from the previous event',
      'window.dataLayer.push({',
      "  event: 'page_ready', // the site's existing dataLayer event, unchanged",
      '  bloomreach: {',
      "    event: 'page_ready',",
      '    properties: {',
      "      page_type: 'home',",
      '    },',
      '  },',
      '});',
    ]);
  });
});

describe('items entry samples (W2)', () => {
  it('falls back to a same-named property of any kind before the generic sample', () => {
    const model = buildDataLayerModel([
      prop('product_id', 'event', '15062099820869'),
      list('product_ids', 'product_id', 'ids'),
    ]);
    expect(model.payload.product_ids).toEqual(['15062099820869']);
  });
});

describe('buildGtmTemplate and brPayload', () => {
  const model = buildDataLayerModel(WISHLIST);
  const text = buildGtmTemplate({ bloomreach: 'add_to_wishlist', dataLayer: 'add_to_wishlist' }, model);

  it('ships the transformation source, the event rules and the GTM setup', () => {
    expect(text).toContain('function brPayload(br, rules)');
    expect(text).toContain('var BR_RULES = [');
    expect(text).toContain('{"name":"product_ids","form":"ids","id_field":"product_id"}');
    expect(text).toContain('{"name":"total_price","sum":"price*quantity"}');
    expect(text).toContain('Custom Event "add_to_wishlist"');
    expect(text).toContain("bloomreach.track('add_to_wishlist', brPayload(dataLayer.bloomreach, BR_RULES))");
  });

  const runSource = (br: unknown, rules: unknown) =>
    new Function(`${BR_PAYLOAD_SOURCE}\nreturn brPayload(arguments[0], arguments[1]);`)(br, rules);

  it('shipped source and TypeScript implementation produce the same payload', () => {
    const multi = {
      properties: { placement: 'plp', total_quantity: 99 },
      item: { product_id: 'a', title: 't' },
      items: [
        { product_id: 'a', variant_id: 'v1', quantity: 2, price: 10 },
        { product_id: 'b', variant_id: 'v2', quantity: 1, price: 5.5 },
        { variant_id: 'v3', quantity: 4, price: 1 },
      ],
    };
    const rules = model.rules;
    expect(runSource(multi, rules)).toEqual(computeBrPayload(multi, rules));
    expect(runSource(null, rules)).toEqual({});
    expect(runSource({}, rules)).toEqual(computeBrPayload({}, rules));
    // A stored 'price*' (empty term) must not zero the total in either implementation.
    const trailing = [{ name: 'total_price', sum: 'price*' }];
    expect(runSource(multi, trailing)).toEqual(computeBrPayload(multi, trailing));
    expect((runSource(multi, trailing) as Record<string, unknown>).total_price).toBe(16.5);
    // quantity_field names the source field; the output key is always quantity.
    const qty = [{ name: 'product_list', form: 'id_quantity', id_field: 'product_id', quantity_field: 'qty' }];
    const qtyBr = { items: [{ product_id: 'a', qty: 3 }] };
    expect(runSource(qtyBr, qty)).toEqual({ product_list: [{ product_id: 'a', quantity: 3 }] });
    expect(computeBrPayload(qtyBr, qty as never)).toEqual({ product_list: [{ product_id: 'a', quantity: 3 }] });
  });

  it('computes lists from items, sums totals, and lets a supplied value win', () => {
    const br = {
      properties: { placement: 'cart', total_quantity: 99 },
      item: { product_id: 'a' },
      items: [
        { product_id: 'a', variant_id: 'v1', sku_id: 's1', quantity: 2, price: 10, price_local_currency: 10 },
        { product_id: 'b', variant_id: 'v2', sku_id: 's2', quantity: 1, price: 5.5, price_local_currency: 5.5 },
      ],
    };
    const out = runSource(br, model.rules) as Record<string, unknown>;
    expect(out.placement).toBe('cart');
    expect(out.product_id).toBe('a');
    expect(out.product_ids).toEqual(['a', 'b']);
    expect(out.product_list).toEqual([
      { product_id: 'a', quantity: 2 },
      { product_id: 'b', quantity: 1 },
    ]);
    expect(out.variant_ids).toEqual(['v1', 'v2']);
    expect(out.sku_list).toEqual([
      { sku_id: 's1', quantity: 2 },
      { sku_id: 's2', quantity: 1 },
    ]);
    expect(out.total_price).toBe(25.5);
    expect(out.total_quantity).toBe(99); // supplied, not summed
    expect(out).toEqual(computeBrPayload(br, model.rules));
  });
});

describe('Web SDK snippets', () => {
  const model = buildDataLayerModel(WISHLIST);

  it('new SDK uses bloomreach.track with the final payload', () => {
    const t = buildWebSdkV2('add_to_wishlist', model);
    expect(t).toContain("bloomreach.track('add_to_wishlist', {");
    expect(t).toContain("  product_ids: ['15062099820869'],");
    expect(t).toContain('  total_price: 123,');
    expect(t).toContain('  // Optional:\n  details_sleeves:');
    expect(t).not.toContain('exponea');
  });

  it('legacy SDK uses exponea.track with the same payload', () => {
    const t = buildWebSdkLegacy('add_to_wishlist', model);
    expect(t).toContain("exponea.track('add_to_wishlist', {");
    expect(t).toContain("  product_ids: ['15062099820869'],");
    expect(t).not.toContain('bloomreach.track');
  });
});

describe('sdk_auto helpers', () => {
  it('names the SDK lifecycle that emits a known event', () => {
    expect(describeSdkEmits('session_start', 'sdk')).toMatch(/Web SDK/);
    expect(describeSdkEmits('campaign', 'platform')).toMatch(/platform/);
  });

  it('builds the default properties snippet from context properties', () => {
    const t = buildSdkDefaultProperties([
      { name: 'store_language', sample: 'de' },
      { name: 'store_country', sample: 'DE' },
    ]);
    expect(t).toContain("track: {\n  default_properties: {\n    store_country: 'DE',\n    store_language: 'de',");
    expect(buildSdkDefaultProperties([])).toBe('');
  });
});

describe('derivation helpers', () => {
  it('validates list and sum derivations', () => {
    expect(validateDerivation(null)).toBeNull();
    expect(validateDerivation({ source: 'items', id_field: 'product_id', form: 'ids' })).toBeNull();
    expect(validateDerivation({ source: 'items', sum: 'price*quantity' })).toBeNull();
    expect(validateDerivation({ source: 'cart', sum: 'price' })).toMatch(/source/);
    expect(validateDerivation({ source: 'items', id_field: 'product_id', form: 'set' })).toMatch(/form/);
    expect(validateDerivation({ source: 'items', sum: 'price*' })).toMatch(/sum/); // empty term rejected
    expect(validateDerivation({ source: 'items', sum: '*price' })).toMatch(/sum/);
    expect(validateDerivation({ source: 'items', sum: 'price*1x' })).toMatch(/sum/);
    expect(validateDerivation('x')).toMatch(/object/);
  });

  it('describes and locates properties', () => {
    expect(describeDerivation({ source: 'items', id_field: 'product_id', form: 'ids' })).toBe('product_id of each item');
    expect(describeDerivation({ source: 'items', sum: 'price*quantity' })).toBe('sum of price*quantity over items');
    expect(parseDerivation({ source: 'items', sum: 'quantity' })).toEqual({ source: 'items', sum: 'quantity' });
    expect(parseDerivation({ nope: 1 })).toBeNull();
    expect(dataLayerPath('item', 'sku', null)).toBe('bloomreach.item.sku');
    expect(dataLayerPath('event', 'placement', null)).toBe('bloomreach.properties.placement');
    expect(dataLayerPath('state_list', 'product_ids', { source: 'items', id_field: 'product_id', form: 'ids' })).toBe(
      'computed from items'
    );
  });

  it('defaults the implementation method like the migration backfill', () => {
    expect(defaultImplementationMethod('purchase', 'custom')).toBe('server_api');
    expect(defaultImplementationMethod('order_refund', 'custom')).toBe('server_api');
    expect(defaultImplementationMethod('consent', 'platform')).toBe('server_api');
    expect(defaultImplementationMethod('session_start', 'sdk')).toBe('sdk_auto');
    expect(defaultImplementationMethod('campaign', 'platform')).toBe('sdk_auto');
    expect(defaultImplementationMethod('add_to_wishlist', 'custom')).toBe('client_web');
  });
});
