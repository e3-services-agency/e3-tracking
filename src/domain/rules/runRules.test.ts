/**
 * `runRules`/`runItemSchemaChecks` tests (T-2-07): the `EngineFinding[]` layer above `evaluate.ts`
 * that `comparison.service.ts` merges into `definition_vs_observations`. Covers: one finding per
 * kind (`rule_violation`, `bound_violation`, `rounding_drift` via the `purchase_items_total`
 * template reproducing 28 vs 28.4, `item_schema_violation`), fingerprint stability/version-bump
 * behaviour, cross_event producing one finding per distinct join key, and variant scoping.
 */
import { describe, expect, it } from 'vitest';
import { runRules, runItemSchemaChecks, type ItemSchemaCheck, type RulesEngineRule } from './runRules';
import { getRuleTemplate } from './templates';
import type { EngineObservation } from '../comparison/definitionVsObservations';
import { refKey } from './types';
import type { RuleSnapshot } from './types';

function snapshot(overrides?: Partial<RuleSnapshot>): RuleSnapshot {
  return { propertiesById: {}, money_tolerance_percent: 1, money_tolerance_floor: 0.01, ...overrides };
}

function obs(id: string, event_id: string | null, variant_id: string | null, properties: Record<string, unknown>): EngineObservation {
  return { id, event_type: 'x', event_id, variant_id, timestamp: 0, properties, run_kind: 'manual' };
}

describe('runRules: membership (rule_violation)', () => {
  const snap = snapshot({
    propertiesById: {
      [refKey('event_cart_update', 'p_product_id')]: { property_id: 'p_product_id', payload_key: 'product_id', data_type: 'string' },
      [refKey('event_cart_update', 'p_product_list')]: { property_id: 'p_product_list', payload_key: 'product_list', data_type: 'array' },
    },
  });
  const rule: RulesEngineRule = {
    id: 'rule_1',
    version: 1,
    event_id: 'event_cart_update',
    variant_id: null,
    name: 'item_in_list',
    message: '"product_id" must be present in "product_list".',
    severity: 'error',
    report_kind: 'rule_violation',
    definition: {
      kind: 'membership',
      expression: {
        kind: 'membership',
        needle: { ref: 'property', property_id: 'p_product_id' },
        haystack: { property_id: 'p_product_list', field: 'product_id' },
      },
      tolerance_mode: 'none',
    },
  };

  it('produces one rule_violation for the first failing observation', () => {
    const observations = [
      obs('o1', 'event_cart_update', null, { product_id: 'p1', product_list: [{ product_id: 'p1' }] }),
      obs('o2', 'event_cart_update', null, { product_id: 'p3', product_list: [{ product_id: 'p1' }] }),
    ];
    const findings = runRules([rule], observations, snap);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('rule_violation');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].observation_id).toBe('o2');
    expect(findings[0].message).toBe(rule.message);
    expect(findings[0].fingerprint).toContain(`rule:${rule.id}:v1:any`);
  });

  it('produces nothing when every observation passes', () => {
    const observations = [obs('o1', 'event_cart_update', null, { product_id: 'p1', product_list: [{ product_id: 'p1' }] })];
    expect(runRules([rule], observations, snap)).toHaveLength(0);
  });

  it('version bump changes the fingerprint (old resolves, new is produced) — same rule id, version 2', () => {
    const observations = [obs('o2', 'event_cart_update', null, { product_id: 'p3', product_list: [{ product_id: 'p1' }] })];
    const v1 = runRules([rule], observations, snap)[0].fingerprint;
    const v2 = runRules([{ ...rule, version: 2 }], observations, snap)[0].fingerprint;
    expect(v1).not.toBe(v2);
    expect(v2).toContain(`rule:${rule.id}:v2:any`);
  });

  it('a disabled rule is simply excluded by the caller (comparison.service.ts filters enabled rules before calling runRules)', () => {
    // runRules itself has no notion of "enabled" — filtering happens one layer up. Passing an
    // empty rule list is the equivalent of "this rule is disabled", and produces no finding.
    const observations = [obs('o2', 'event_cart_update', null, { product_id: 'p3', product_list: [{ product_id: 'p1' }] })];
    expect(runRules([], observations, snap)).toHaveLength(0);
  });

  it('does not evaluate observations of a different event', () => {
    const observations = [obs('o1', 'event_other', null, { product_id: 'p3', product_list: [{ product_id: 'p1' }] })];
    expect(runRules([rule], observations, snap)).toHaveLength(0);
  });
});

describe('runRules: variant scoping', () => {
  const snap = snapshot({
    propertiesById: {
      [refKey('event_purchase', 'p_total_price')]: { property_id: 'p_total_price', payload_key: 'total_price', data_type: 'number' },
    },
  });
  const rule: RulesEngineRule = {
    id: 'rule_refund',
    version: 1,
    event_id: 'event_purchase',
    variant_id: 'variant_refunded',
    name: 'refund_negative',
    message: 'total_price must be negative on a refund.',
    severity: 'error',
    report_kind: 'bound_violation',
    definition: {
      kind: 'bound',
      expression: { kind: 'bound', subject: { ref: 'property', property_id: 'p_total_price' }, check: 'lt', bound: { ref: 'constant', value: 0 } },
      tolerance_mode: 'none',
    },
  };

  it('only evaluates observations resolved to the rule\'s own variant', () => {
    const observations = [
      obs('o1', 'event_purchase', 'variant_refunded', { total_price: 5 }), // violates
      obs('o2', 'event_purchase', 'variant_success', { total_price: 5 }), // different variant, not scoped
      obs('o3', 'event_purchase', null, { total_price: 5 }), // no variant at all, not scoped
    ];
    const findings = runRules([rule], observations, snap);
    expect(findings).toHaveLength(1);
    expect(findings[0].observation_id).toBe('o1');
    expect(findings[0].kind).toBe('bound_violation');
  });
});

describe('runRules: cross_event (purchase_items_total template, reproduces 28 vs 28.4, one finding per join key)', () => {
  const snap = snapshot({
    propertiesById: {
      [refKey('event_purchase', 'p_total_price')]: { property_id: 'p_total_price', payload_key: 'total_price', data_type: 'number' },
      [refKey('event_purchase', 'p_purchase_id')]: { property_id: 'p_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
      [refKey('event_purchase_item', 'p_price')]: { property_id: 'p_price', payload_key: 'price', data_type: 'number' },
      [refKey('event_purchase_item', 'p_quantity')]: { property_id: 'p_quantity', payload_key: 'quantity', data_type: 'number' },
      [refKey('event_purchase_item', 'p_item_purchase_id')]: { property_id: 'p_item_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
    },
    money_tolerance_percent: 1,
    money_tolerance_floor: 0.01,
  });

  function instantiatedRule(): RulesEngineRule {
    const template = getRuleTemplate('purchase_items_total')!;
    const [instance] = template.instantiate(
      {
        event_id: 'event_purchase',
        event_name: 'purchase',
        properties: [
          // T-2-05 fix round ruling (D-25 Q12): money format, so the template's own `applicable`
          // would also accept this snapshot (not exercised by `instantiate` directly, but kept
          // realistic).
          { property_id: 'p_total_price', name: 'total_price', role: 'normal', data_type: 'number', data_formats: ['money'], item_schema: null },
          { property_id: 'p_purchase_id', name: 'purchase_id', role: 'normal', data_type: 'string', data_formats: [], item_schema: null },
        ],
        standard_field_map: {},
        variants: [],
      },
      {
        childEvent: {
          event_id: 'event_purchase_item',
          event_name: 'purchase_item',
          properties: [
            { property_id: 'p_price', name: 'price', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
            { property_id: 'p_quantity', name: 'quantity', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
            { property_id: 'p_item_purchase_id', name: 'purchase_id', role: 'normal', data_type: 'string', data_formats: [], item_schema: null },
          ],
          standard_field_map: {},
          variants: [],
        },
      }
    );
    return {
      id: 'rule_rounding',
      version: 1,
      event_id: 'event_purchase',
      variant_id: null,
      name: instance.name,
      message: instance.message,
      severity: instance.severity,
      report_kind: instance.report_kind as RulesEngineRule['report_kind'],
      definition: {
        kind: instance.kind,
        expression: instance.expression,
        tolerance_mode: instance.tolerance_mode,
        tolerance_value: instance.tolerance_value,
      },
    };
  }

  it('yields rounding_drift for 28 (purchase.total_price) vs 28.4 (sum of purchase_item price*quantity)', () => {
    const rule = instantiatedRule();
    const observations: EngineObservation[] = [
      obs('obs_purchase', 'event_purchase', null, { purchase_id: 'pu_1', total_price: 28 }),
      obs('obs_item_1', 'event_purchase_item', null, { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
      obs('obs_item_2', 'event_purchase_item', null, { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
    ];
    const findings = runRules([rule], observations, snap);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('rounding_drift');
    expect(findings[0].severity).toBe('warning');
    expect((findings[0].expected_json as { expected: unknown }).expected).toBe(28);
    expect((findings[0].actual_json as { values: unknown }).values).toBeCloseTo(28.4 as number);
    expect(findings[0].fingerprint).toContain('pu_1');
  });

  it('produces one finding per distinct purchase_id that drifts, not just the first', () => {
    const rule = instantiatedRule();
    const observations: EngineObservation[] = [
      obs('obs_purchase_1', 'event_purchase', null, { purchase_id: 'pu_1', total_price: 28 }),
      obs('obs_item_1', 'event_purchase_item', null, { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
      obs('obs_item_2', 'event_purchase_item', null, { purchase_id: 'pu_1', price: 14.2, quantity: 1 }),
      obs('obs_purchase_2', 'event_purchase', null, { purchase_id: 'pu_2', total_price: 10 }),
      obs('obs_item_3', 'event_purchase_item', null, { purchase_id: 'pu_2', price: 20, quantity: 1 }),
    ];
    const findings = runRules([rule], observations, snap);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.fingerprint).some((fp) => fp.includes('pu_1'))).toBe(true);
    expect(findings.map((f) => f.fingerprint).some((fp) => fp.includes('pu_2'))).toBe(true);
  });

  it('a purchase with no joined items is skipped, not flagged (phase 1 parity)', () => {
    const rule = instantiatedRule();
    const observations: EngineObservation[] = [obs('obs_purchase', 'event_purchase', null, { purchase_id: 'pu_1', total_price: 28 })];
    expect(runRules([rule], observations, snap)).toHaveLength(0);
  });
});

describe('runItemSchemaChecks', () => {
  const checks: ItemSchemaCheck[] = [
    {
      event_id: 'event_cart_update',
      property_id: 'p_product_list',
      property_name: 'product_list',
      payload_key: 'product_list',
      item_schema: [
        { field: 'product_id', data_type: 'string', required: true },
        { field: 'quantity', data_type: 'number', required: true },
      ],
    },
  ];

  it('flags a missing required field on one item', () => {
    const observations: EngineObservation[] = [
      obs('o1', 'event_cart_update', null, { product_list: [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2' }] }),
    ];
    const findings = runItemSchemaChecks(checks, observations);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('item_schema_violation');
    expect(findings[0].severity).toBe('error');
    expect((findings[0].expected_json as { field: string; reason: string }).field).toBe('quantity');
    expect((findings[0].expected_json as { field: string; reason: string }).reason).toBe('missing_required');
  });

  it('produces nothing when every item satisfies the schema', () => {
    const observations: EngineObservation[] = [
      obs('o1', 'event_cart_update', null, { product_list: [{ product_id: 'p1', quantity: 2 }] }),
    ];
    expect(runItemSchemaChecks(checks, observations)).toHaveLength(0);
  });

  it('skips an observation whose payload key is not an array (a shape problem elsewhere, not this check\'s job)', () => {
    const observations: EngineObservation[] = [obs('o1', 'event_cart_update', null, { product_list: 'not-an-array' })];
    expect(runItemSchemaChecks(checks, observations)).toHaveLength(0);
  });
});
