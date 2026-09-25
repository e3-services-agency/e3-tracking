/**
 * Evaluator tests (D-30, D-31, T-2-06): membership, arithmetic with money tolerance (percent and
 * floor), bound (`lt`, `non_empty`, `not_future`), cross_event reproducing the phase 1 fixture
 * numbers (28 vs 28.4, T-1-09/`definitionVsObservations.test.ts`), plus the extension acceptance
 * source-scan test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRule, resolveTolerance } from './evaluate';
import type { RuleDefinition, RuleObservation, RuleSnapshot } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function snapshot(overrides?: Partial<RuleSnapshot>): RuleSnapshot {
  return {
    propertiesById: {},
    money_tolerance_percent: 1,
    money_tolerance_floor: 0.01,
    ...overrides,
  };
}

function obs(id: string, event_id: string | null, properties: Record<string, unknown>): RuleObservation {
  return { id, event_id, variant_id: null, properties };
}

// ---------------------------------------------------------------------------
// Membership: cart_update_item_in_list shape (product_id must be present in product_list[].product_id)
// ---------------------------------------------------------------------------
describe('evaluateRule: membership', () => {
  const snap = snapshot({
    propertiesById: {
      prop_product_id: { property_id: 'prop_product_id', payload_key: 'product_id', data_type: 'string' },
      prop_product_list: { property_id: 'prop_product_list', payload_key: 'product_list', data_type: 'array' },
    },
  });
  const rule: RuleDefinition = {
    kind: 'membership',
    expression: {
      kind: 'membership',
      needle: { ref: 'property', property_id: 'prop_product_id' },
      haystack: { property_id: 'prop_product_list', field: 'product_id' },
    },
    tolerance_mode: 'none',
  };

  it('passes when the item is present in the list', () => {
    const observation = obs('o1', 'e1', {
      product_id: 'p1',
      product_list: [{ product_id: 'p1' }, { product_id: 'p2' }],
    });
    const outcome = evaluateRule(rule, observation, [], snap);
    expect(outcome.passed).toBe(true);
  });

  it('fails when the item is missing from the list', () => {
    const observation = obs('o1', 'e1', {
      product_id: 'p3',
      product_list: [{ product_id: 'p1' }, { product_id: 'p2' }],
    });
    const outcome = evaluateRule(rule, observation, [], snap);
    expect(outcome.passed).toBe(false);
    expect(outcome.actual).toEqual({ value: 'p3' });
  });
});

// ---------------------------------------------------------------------------
// Arithmetic with money tolerance: sum(product_list[].price * quantity) eq total_price
// ---------------------------------------------------------------------------
describe('evaluateRule: arithmetic with money tolerance', () => {
  const snap = snapshot({
    propertiesById: {
      prop_total_price: { property_id: 'prop_total_price', payload_key: 'total_price', data_type: 'number' },
      prop_product_list: { property_id: 'prop_product_list', payload_key: 'product_list', data_type: 'array' },
    },
    money_tolerance_percent: 1,
    money_tolerance_floor: 0.01,
  });
  const rule: RuleDefinition = {
    kind: 'arithmetic',
    expression: {
      kind: 'arithmetic',
      left: {
        ref: 'aggregate',
        fn: 'sum',
        of: {
          ref: 'product',
          left: { ref: 'list_field', property_id: 'prop_product_list', field: 'price' },
          right: { ref: 'list_field', property_id: 'prop_product_list', field: 'quantity' },
        },
      },
      comparator: 'eq',
      right: { ref: 'property', property_id: 'prop_total_price' },
    },
    tolerance_mode: 'money',
  };

  it('passes when within the 1% tolerance', () => {
    // target 100, 1% tolerance = 1; sum 100.5 is within.
    const observation = obs('o1', 'e1', {
      total_price: 100,
      product_list: [{ price: 50.25, quantity: 2 }],
    });
    const outcome = evaluateRule(rule, observation, [], snap);
    expect(outcome.passed).toBe(true);
  });

  it('fails when beyond the 1% tolerance', () => {
    // target 100, sum 103 -> diff 3 > tolerance 1.
    const observation = obs('o1', 'e1', {
      total_price: 100,
      product_list: [{ price: 51.5, quantity: 2 }],
    });
    const outcome = evaluateRule(rule, observation, [], snap);
    expect(outcome.passed).toBe(false);
    expect(outcome.expected).toBe(100);
    expect(outcome.actual).toBe(103);
  });

  it('the absolute floor wins when 1% of the target is smaller than the floor', () => {
    // target 0.5: 1% = 0.005, floor 0.01 > that, so tolerance is 0.01.
    const passing = obs('o1', 'e1', { total_price: 0.5, product_list: [{ price: 0.505, quantity: 1 }] });
    expect(evaluateRule(rule, passing, [], snap).passed).toBe(true);
    const failing = obs('o2', 'e1', { total_price: 0.5, product_list: [{ price: 0.52, quantity: 1 }] });
    expect(evaluateRule(rule, failing, [], snap).passed).toBe(false);
  });

  it('resolveTolerance: money mode is max(floor, percent/100 * |target|)', () => {
    expect(resolveTolerance('money', null, 100, snap)).toBe(1);
    expect(resolveTolerance('money', null, 0.5, snap)).toBe(0.01);
    expect(resolveTolerance('none', null, 100, snap)).toBe(0);
    expect(resolveTolerance('absolute', 5, 100, snap)).toBe(5);
    expect(resolveTolerance('percent', 10, 100, snap)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Bound: lt 0 (refund amounts), non_empty, not_future
// ---------------------------------------------------------------------------
describe('evaluateRule: bound', () => {
  const snap = snapshot({
    propertiesById: {
      prop_total_price: { property_id: 'prop_total_price', payload_key: 'total_price', data_type: 'number' },
      prop_purchase_id: { property_id: 'prop_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
      prop_purchase_ts: { property_id: 'prop_purchase_ts', payload_key: 'purchased_at', data_type: 'timestamp' },
    },
  });

  it('lt 0: refund amounts must be negative', () => {
    const rule: RuleDefinition = {
      kind: 'bound',
      expression: {
        kind: 'bound',
        subject: { ref: 'property', property_id: 'prop_total_price' },
        check: 'lt',
        bound: { ref: 'constant', value: 0 },
      },
      tolerance_mode: 'none',
    };
    expect(evaluateRule(rule, obs('o1', 'e1', { total_price: -5 }), [], snap).passed).toBe(true);
    expect(evaluateRule(rule, obs('o2', 'e1', { total_price: 5 }), [], snap).passed).toBe(false);
  });

  it('non_empty', () => {
    const rule: RuleDefinition = {
      kind: 'bound',
      expression: { kind: 'bound', subject: { ref: 'property', property_id: 'prop_purchase_id' }, check: 'non_empty' },
      tolerance_mode: 'none',
    };
    expect(evaluateRule(rule, obs('o1', 'e1', { purchase_id: 'pu_1' }), [], snap).passed).toBe(true);
    expect(evaluateRule(rule, obs('o2', 'e1', { purchase_id: '' }), [], snap).passed).toBe(false);
  });

  it('not_future', () => {
    const rule: RuleDefinition = {
      kind: 'bound',
      expression: { kind: 'bound', subject: { ref: 'property', property_id: 'prop_purchase_ts' }, check: 'not_future' },
      tolerance_mode: 'none',
    };
    const now = Date.parse('2026-06-01T00:00:00Z') / 1000;
    expect(
      evaluateRule(rule, obs('o1', 'e1', { purchased_at: '2026-01-01T00:00:00Z' }), [], snap, { now }).passed
    ).toBe(true);
    expect(
      evaluateRule(rule, obs('o2', 'e1', { purchased_at: '2026-12-01T00:00:00Z' }), [], snap, { now }).passed
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-event: purchase_items_total, reproducing the phase 1 fixture (28 vs 28.4, D-31)
// ---------------------------------------------------------------------------
describe('evaluateRule: cross_event (purchase_items_total, reproduces 28 vs 28.4)', () => {
  const snap = snapshot({
    propertiesById: {
      prop_total_price: { property_id: 'prop_total_price', payload_key: 'total_price', data_type: 'number' },
      prop_purchase_id: { property_id: 'prop_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
      prop_item_price: { property_id: 'prop_item_price', payload_key: 'price', data_type: 'number' },
      prop_item_quantity: { property_id: 'prop_item_quantity', payload_key: 'quantity', data_type: 'number' },
      prop_item_purchase_id: { property_id: 'prop_item_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
    },
    money_tolerance_percent: 1,
    money_tolerance_floor: 0.01,
  });
  const rule: RuleDefinition = {
    kind: 'cross_event',
    expression: {
      kind: 'cross_event',
      child_event_id: 'event_purchase_item',
      join: { parent_property_id: 'prop_purchase_id', child_property_id: 'prop_item_purchase_id' },
      child: {
        ref: 'aggregate',
        fn: 'sum',
        of: {
          ref: 'product',
          left: { ref: 'property', property_id: 'prop_item_price' },
          right: { ref: 'property', property_id: 'prop_item_quantity' },
        },
      },
      comparator: 'eq',
      target: { ref: 'property', property_id: 'prop_total_price' },
    },
    tolerance_mode: 'money',
  };

  it('flags 28 (purchase.total_price) vs 28.4 (sum of purchase_item price*quantity), tolerance-aware', () => {
    const parent = obs('purchase_1', 'event_purchase', { purchase_id: 'pu_1', total_price: 28 });
    const items = [
      obs('item_1', 'event_purchase_item', { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
      obs('item_2', 'event_purchase_item', { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
    ];
    const outcome = evaluateRule(rule, parent, items, snap);
    expect(outcome.passed).toBe(false);
    expect(outcome.expected).toBeCloseTo(28.4);
    expect(outcome.actual).toBe(28);
    expect(outcome.detail).toBe('pu_1');
  });

  it('passes when the sum matches within the money tolerance', () => {
    const parent = obs('purchase_1', 'event_purchase', { purchase_id: 'pu_1', total_price: 28 });
    const items = [obs('item_1', 'event_purchase_item', { purchase_id: 'pu_1', price: 14, quantity: 2 })];
    expect(evaluateRule(rule, parent, items, snap).passed).toBe(true);
  });

  it('only sums children joined on the same purchase_id', () => {
    const parent = obs('purchase_1', 'event_purchase', { purchase_id: 'pu_1', total_price: 28 });
    const items = [
      obs('item_1', 'event_purchase_item', { purchase_id: 'pu_1', price: 14, quantity: 2 }),
      obs('item_2', 'event_purchase_item', { purchase_id: 'pu_OTHER', price: 999, quantity: 1 }),
    ];
    expect(evaluateRule(rule, parent, items, snap).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extension acceptance (D-30): evaluate.ts never hardcodes an operator name literal; it only
// indexes into operators.ts's registries by the enum value the expression carries.
// ---------------------------------------------------------------------------
describe('extension acceptance: evaluate.ts names no aggregate/comparator/bound-check literal', () => {
  it('the source has no quoted RULE_AGGREGATES/RULE_COMPARATORS member (the task\'s extension acceptance test)', () => {
    const source = readFileSync(path.join(__dirname, 'evaluate.ts'), 'utf-8');
    // Every aggregate/comparator call in evaluate.ts must be a dynamic lookup
    // (`AGGREGATES[operand.fn]`, `COMPARATORS[expression.comparator]`), never a quoted operator
    // name compared or switched on directly (that would be the hardcoding D-30 forbids).
    const forbiddenLiterals = ['sum', 'count', 'min', 'max', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte'];
    for (const literal of forbiddenLiterals) {
      const quoted = new RegExp(`['"]${literal}['"]`);
      expect(source, `evaluate.ts must not hardcode the operator literal "${literal}"`).not.toMatch(quoted);
    }
    // And it does call through the registries by dynamic key, not a fixed property access.
    expect(source).toContain('AGGREGATES[');
    expect(source).toContain('COMPARATORS[');
    expect(source).toContain('BOUND_CHECKS[');
  });
});
