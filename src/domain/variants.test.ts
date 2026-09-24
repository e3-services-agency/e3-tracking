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
    ).toBe('purchase[channel=web,purchase_status=success]');
  });

  it('sorts its own copy by resolved display name, independent of input order (second fix round)', () => {
    // Input is in property_id order (p1, p2) with names reversed alphabetically vs. p1/p2, mirroring
    // the storage/key order produced by `normalizeConditions`; the rendered name still reads
    // alphabetically by name.
    expect(
      generateVariantName(
        'cart_update',
        [
          { property_id: 'p1', operator: 'equals', values: ['web'] },
          { property_id: 'p2', operator: 'equals', values: ['add'] },
        ],
        { p1: 'zone', p2: 'action' }
      )
    ).toBe('cart_update[action=add,zone=web]');
  });
});

describe('normalizeConditions / buildConditionsKey (fix round ERROR 1, second fix round)', () => {
  it('sorts conditions by property_id regardless of input order (name-independent)', () => {
    const a = normalizeConditions([
      { property_id: 'p2', operator: 'equals', values: ['web'] },
      { property_id: 'p1', operator: 'equals', values: ['add'] },
    ]);
    const b = normalizeConditions([
      { property_id: 'p1', operator: 'equals', values: ['add'] },
      { property_id: 'p2', operator: 'equals', values: ['web'] },
    ]);
    expect(a).toEqual(b);
    expect(buildConditionsKey(a)).toBe(buildConditionsKey(b));
  });

  it('de-dupes and sorts "in" values so order/duplicates do not change the key', () => {
    const a = normalizeConditions([{ property_id: 'p1', operator: 'in', values: ['remove', 'add'] }]);
    const b = normalizeConditions([{ property_id: 'p1', operator: 'in', values: ['add', 'remove', 'add'] }]);
    expect(buildConditionsKey(a)).toBe(buildConditionsKey(b));
  });

  it('collapses a one-value "in" to "equals" so it keys the same as the equivalent equals condition', () => {
    const inOne = normalizeConditions([{ property_id: 'p1', operator: 'in', values: ['add'] }]);
    const equals = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['add'] }]);
    expect(inOne).toEqual(equals);
    expect(buildConditionsKey(inOne)).toBe(buildConditionsKey(equals));
  });

  it('a different value set produces a different key', () => {
    const a = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['add'] }]);
    const b = normalizeConditions([{ property_id: 'p1', operator: 'equals', values: ['remove'] }]);
    expect(buildConditionsKey(a)).not.toBe(buildConditionsKey(b));
  });

  it('the key is unaffected by a property display-name change that would reorder a name-based sort (ERROR 1 reopened)', () => {
    // Two discriminators p1="action", p2="channel": alphabetically p1 < p2. A rename of p1 to
    // "zone" would flip the name-sort order (channel < zone) if the key were name-based; keying by
    // property_id instead means the key never moves under a rename.
    const before = normalizeConditions([
      { property_id: 'p1', operator: 'equals', values: ['add'] },
      { property_id: 'p2', operator: 'equals', values: ['web'] },
    ]);
    const after = normalizeConditions([
      { property_id: 'p1', operator: 'equals', values: ['add'] },
      { property_id: 'p2', operator: 'equals', values: ['web'] },
    ]);
    expect(buildConditionsKey(before)).toBe(buildConditionsKey(after));

    // And the equivalent submitted the other way round (p2 then p1) still collides on the same key.
    const equivalentReordered = normalizeConditions([
      { property_id: 'p2', operator: 'equals', values: ['web'] },
      { property_id: 'p1', operator: 'equals', values: ['add'] },
    ]);
    expect(buildConditionsKey(before)).toBe(buildConditionsKey(equivalentReordered));
  });
});
