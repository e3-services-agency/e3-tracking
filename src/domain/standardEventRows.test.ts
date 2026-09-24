/**
 * Unit tests for `buildStandardEventRows` (fix round FAIL-1): the pure join between the merged
 * standard event seed list and this project's mappings/events/variants, extracted out of
 * `StandardEvents.tsx` so the key/id matching can be tested without mounting the page or a browser.
 */
import { describe, expect, it } from 'vitest';
import { buildStandardEventRows } from './standardEventRows';
import { STANDARD_EVENTS } from './bloomreach';

describe('buildStandardEventRows', () => {
  const events = [
    { id: 'evt-cart', name: 'cart_update' },
    { id: 'evt-purchase', name: 'purchase' },
  ];
  const variants = [{ id: 'var-cart-add', name: 'cart_update[action=add]' }];

  it('resolves the mapped event and variant name by id for a mapped standard event', () => {
    const mappings = [
      { standard_event: 'add_to_cart', event_id: 'evt-cart', variant_id: 'var-cart-add', field_map_json: {} },
    ];
    const rows = buildStandardEventRows(STANDARD_EVENTS as any, mappings, events, variants);
    const row = rows.find((r) => r.key === 'add_to_cart')!;
    expect(row.mappedEventName).toBe('cart_update');
    expect(row.mappedVariantName).toBe('cart_update[action=add]');
  });

  it('leaves mappedEventName/mappedVariantName null when a standard event has no mapping', () => {
    const rows = buildStandardEventRows(STANDARD_EVENTS as any, [], events, variants);
    for (const row of rows) {
      expect(row.mapping).toBeNull();
      expect(row.mappedEventName).toBeNull();
      expect(row.mappedVariantName).toBeNull();
    }
  });

  it('leaves mappedVariantName null when the mapping has no variant_id (whole-event mapping)', () => {
    const mappings = [
      { standard_event: 'checkout', event_id: 'evt-purchase', variant_id: null, field_map_json: {} },
    ];
    const rows = buildStandardEventRows(STANDARD_EVENTS as any, mappings, events, variants);
    const row = rows.find((r) => r.key === 'checkout')!;
    expect(row.mappedEventName).toBe('purchase');
    expect(row.mappedVariantName).toBeNull();
  });

  it('falls back to the raw id (never a dash) when a mapping names an event/variant missing from the loaded lists', () => {
    // Regression for FAIL-1: a stale/partial `events` or `variants` array (fetch race) must never
    // make a real mapping look unmapped; it must show the id, which is visibly "wrong but present"
    // rather than "silently missing".
    const mappings = [
      { standard_event: 'purchase', event_id: 'evt-not-loaded', variant_id: 'var-not-loaded', field_map_json: {} },
    ];
    const rows = buildStandardEventRows(STANDARD_EVENTS as any, mappings, [], []);
    const row = rows.find((r) => r.key === 'purchase')!;
    expect(row.mappedEventName).toBe('evt-not-loaded');
    expect(row.mappedVariantName).toBe('var-not-loaded');
  });

  it('carries the field count from the merged seed/addition list', () => {
    const additions = [{ key: 'loyalty_scan', fields: ['card_id', 'points'] }];
    const merged = [...STANDARD_EVENTS, ...additions];
    const rows = buildStandardEventRows(merged as any, [], [], []);
    const row = rows.find((r) => r.key === 'loyalty_scan')!;
    expect(row.fieldCount).toBe(2);
  });
});
