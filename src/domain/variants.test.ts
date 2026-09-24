/**
 * Pure Variant helper tests (D-03, T-1-05): `evaluateVariant` against the `cart_update` payload
 * from `.claude/team/samples/customer-events-export.json`, and `generateVariantName` format
 * ("Variant" plan section, T-1-05 acceptance).
 */
import { describe, expect, it } from 'vitest';
import { buildConditionsKey, evaluateVariant, generateVariantName, normalizeConditions } from './variants';

// From .claude/team/samples/customer-events-export.json, the first `cart_update` observation.
const cartUpdateAddPayload = {
  action: 'add',
  brand: 'Rang Gali',
  product_id: '102589',
  product_ids: '102589',
  product_list: [{ product_id: '102589', quantity: 1 }],
  size: 'XS',
  title: 'Rang Gali Maroon Solid Asymmetric Hemline Top',
  total_price: '28',
  total_quantity: '1',
};

describe('evaluateVariant', () => {
  it('matches cart_update[action=add] on the add payload', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'equals', values: ['add'] }], cartUpdateAddPayload)
    ).toBe(true);
  });

  it('does not match cart_update[action=remove] on the add payload', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'equals', values: ['remove'] }], cartUpdateAddPayload)
    ).toBe(false);
  });

  it('a string value ("add") matches equals regardless of surrounding type coercion', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'equals', values: ['add'] }], { action: 'add' })
    ).toBe(true);
  });

  it('a missing property never matches', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'equals', values: ['add'] }], { brand: 'Rang Gali' })
    ).toBe(false);
  });

  it('a null property value never matches', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'equals', values: ['add'] }], { action: null })
    ).toBe(false);
  });

  it('operator "in" matches any listed value', () => {
    expect(
      evaluateVariant([{ property_id: 'action', operator: 'in', values: ['add', 'remove'] }], cartUpdateAddPayload)
    ).toBe(true);
    expect(
      evaluateVariant(
        [{ property_id: 'action', operator: 'in', values: ['remove', 'wishlist'] }],
        cartUpdateAddPayload
      )
    ).toBe(false);
  });

  it('requires every condition to match (AND across two discriminators)', () => {
    const conditions = [
      { property_id: 'action', operator: 'equals' as const, values: ['add'] },
      { property_id: 'size', operator: 'equals' as const, values: ['XS'] },
    ];
    expect(evaluateVariant(conditions, cartUpdateAddPayload)).toBe(true);
    expect(evaluateVariant(conditions, { ...cartUpdateAddPayload, size: 'M' })).toBe(false);
  });

  it('an empty conditions list never matches', () => {
    expect(evaluateVariant([], cartUpdateAddPayload)).toBe(false);
  });
});

describe('generateVariantName', () => {
  it('formats a single equals condition', () => {
    expect(
      generateVariantName('cart_update', [{ property_id: 'p1', operator: 'equals', values: ['add'] }], {
        p1: 'action',
      })
    ).toBe('cart_update[action=add]');
  });

  it('formats an "in" condition with a pipe-joined value list', () => {
    expect(
      generateVariantName('cart_update', [{ property_id: 'p1', operator: 'in', values: ['add', 'remove'] }], {
        p1: 'action',
      })
    ).toBe('cart_update[action in (add|remove)]');
  });

  it('formats two conditions comma-separated', () => {
    expect(
      generateVariantName(
        'purchase',
        [
          { property_id: 'p1', operator: 'equals', values: ['success'] },
          { property_id: 'p2', operator: 'equals', values: ['web'] },
        ],
        { p1: 'purchase_status', p2: 'channel' }
      )
    ).toBe('purchase[purchase_status=success,channel=web]');
  });
});

describe('normalizeConditions / buildConditionsKey (fix round ERROR 1)', () => {
  const names = { p1: 'action', p2: 'channel' };

  it('sorts conditions by resolved property name regardless of input order', () => {
    const a = normalizeConditions(
      [
        { property_id: 'p2', operator: 'equals', values: ['web'] },
        { property_id: 'p1', operator: 'equals', values: ['add'] },
      ],
      names
    );
    const b = normalizeConditions(
      [
        { property_id: 'p1', operator: 'equals', values: ['add'] },
        { property_id: 'p2', operator: 'equals', values: ['web'] },
      ],
      names
    );
    expect(a).toEqual(b);
    expect(buildConditionsKey(a)).toBe(buildConditionsKey(b));
  });

  it('de-dupes and sorts "in" values so order/duplicates do not change the key', () => {
    const a = normalizeConditions([{ property_id: 'p1', operator: 'in', values: ['remove', 'add'] }], names);
    const b = normalizeConditions(
      [{ property_id: 'p1', operator: 'in', values: ['add', 'remove', 'add'] }],
      names
    );
    expect(buildConditionsKey(a)).toBe(buildConditionsKey(b));
  });

  it('collapses a one-value "in" to "equals" so it keys the same as the equivalent equals condition', () => {
    const inOne = normalizeConditions([{ property_id: 'p1', operator: 'in', values: ['add'] }], names);
    const equals = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['add'] }], names);
    expect(inOne).toEqual(equals);
    expect(buildConditionsKey(inOne)).toBe(buildConditionsKey(equals));
  });

  it('a different value set produces a different key', () => {
    const a = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['add'] }], names);
    const b = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['remove'] }], names);
    expect(buildConditionsKey(a)).not.toBe(buildConditionsKey(b));
  });
});
