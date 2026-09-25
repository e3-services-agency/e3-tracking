/**
 * Template tests (D-30, D-31, T-2-06): applicability and instantiation for all four seed
 * templates, plus an end-to-end check that `purchase_items_total`'s instantiated rule reproduces
 * the phase 1 fixture's 28 vs 28.4 rounding_drift finding when run through `evaluate.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  RULE_TEMPLATES,
  getRuleTemplate,
  listApplicableTemplates,
  type TemplateEventSnapshot,
} from './templates';
import { evaluateRule } from './evaluate';
import { refKey } from './types';
import type { RuleObservation, RuleSnapshot } from './types';

function cartUpdateEvent(overrides?: Partial<TemplateEventSnapshot>): TemplateEventSnapshot {
  return {
    event_id: 'event_cart_update',
    event_name: 'cart_update',
    properties: [
      { property_id: 'p_product_id', name: 'product_id', role: 'normal', data_type: 'string', data_formats: [], item_schema: null },
      {
        property_id: 'p_product_list',
        name: 'product_list',
        role: 'normal',
        data_type: 'array',
        data_formats: [],
        item_schema: [
          { field: 'product_id', data_type: 'string', required: true },
          { field: 'price', data_type: 'number', required: true },
          { field: 'quantity', data_type: 'number', required: true },
        ],
      },
      { property_id: 'p_total_price', name: 'total_price', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
      { property_id: 'p_total_quantity', name: 'total_quantity', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
    ],
    standard_field_map: {},
    variants: [],
    ...overrides,
  };
}

/** T-2-05 fix round ruling (D-25 Q12): `total_price` carries the `money` format so
 * `purchase_items_total` is applicable by default; tests that need it absent override explicitly. */
function purchaseEvent(overrides?: Partial<TemplateEventSnapshot>): TemplateEventSnapshot {
  return {
    event_id: 'event_purchase',
    event_name: 'purchase',
    properties: [
      { property_id: 'p_total_price', name: 'total_price', role: 'normal', data_type: 'number', data_formats: ['money'], item_schema: null },
      { property_id: 'p_purchase_id', name: 'purchase_id', role: 'normal', data_type: 'string', data_formats: [], item_schema: null },
      { property_id: 'p_purchase_status', name: 'purchase_status', role: 'discriminator', data_type: 'string', data_formats: [], item_schema: null },
    ],
    standard_field_map: {},
    variants: [
      {
        id: 'variant_refunded',
        name: 'purchase[purchase_status=refunded]',
        conditions: [{ property_id: 'p_purchase_status', operator: 'equals', values: ['refunded'] }],
      },
    ],
    ...overrides,
  };
}

function purchaseItemEvent(): TemplateEventSnapshot {
  return {
    event_id: 'event_purchase_item',
    event_name: 'purchase_item',
    properties: [
      { property_id: 'p_price', name: 'price', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
      { property_id: 'p_quantity', name: 'quantity', role: 'normal', data_type: 'number', data_formats: [], item_schema: null },
      { property_id: 'p_item_purchase_id', name: 'purchase_id', role: 'normal', data_type: 'string', data_formats: [], item_schema: null },
    ],
    standard_field_map: {},
    variants: [],
  };
}

describe('RULE_TEMPLATES registry', () => {
  it('has exactly the four seed templates', () => {
    expect(RULE_TEMPLATES.map((t) => t.key).sort()).toEqual(
      ['cart_update_item_in_list', 'cart_update_totals', 'purchase_items_total', 'purchase_refund_negative'].sort()
    );
  });

  it('getRuleTemplate resolves by key', () => {
    expect(getRuleTemplate('cart_update_totals')?.name).toBeTruthy();
    expect(getRuleTemplate('nope')).toBeUndefined();
  });
});

describe('cart_update_item_in_list', () => {
  const template = getRuleTemplate('cart_update_item_in_list')!;

  it('is applicable when product_id and product_list[].product_id are linked', () => {
    expect(template.applicable(cartUpdateEvent(), {})).toBe(true);
  });

  it('is not applicable when product_list has no item schema', () => {
    const event = cartUpdateEvent({
      properties: cartUpdateEvent().properties.map((p) => (p.name === 'product_list' ? { ...p, item_schema: null } : p)),
    });
    expect(template.applicable(event, {})).toBe(false);
  });

  it('instantiates a membership rule', () => {
    const [instance] = template.instantiate(cartUpdateEvent(), {});
    expect(instance.kind).toBe('membership');
    expect(instance.expression).toMatchObject({
      kind: 'membership',
      needle: { ref: 'property', property_id: 'p_product_id' },
      haystack: { property_id: 'p_product_list', field: 'product_id' },
    });
  });
});

describe('cart_update_totals', () => {
  const template = getRuleTemplate('cart_update_totals')!;

  it('is applicable when the item schema has price and quantity and both totals are linked', () => {
    expect(template.applicable(cartUpdateEvent(), {})).toBe(true);
  });

  it('instantiates two arithmetic rules (total_price sum, total_quantity sum)', () => {
    const instances = template.instantiate(cartUpdateEvent(), {});
    expect(instances).toHaveLength(2);
    expect(instances.every((i) => i.kind === 'arithmetic')).toBe(true);
    expect(instances[0].tolerance_mode).toBe('money');
    expect(instances[1].tolerance_mode).toBe('none');
  });
});

describe('purchase_refund_negative', () => {
  const template = getRuleTemplate('purchase_refund_negative')!;

  it('is applicable only when a refunded variant exists', () => {
    expect(template.applicable(purchaseEvent(), {})).toBe(true);
    expect(template.applicable(purchaseEvent({ variants: [] }), {})).toBe(false);
  });

  it('instantiates a bound rule scoped to the refunded variant', () => {
    const [instance] = template.instantiate(purchaseEvent(), {});
    expect(instance.kind).toBe('bound');
    expect(instance.report_kind).toBe('bound_violation');
    expect(instance.variant_id).toBe('variant_refunded');
    expect(instance.expression).toMatchObject({ kind: 'bound', check: 'lt', bound: { ref: 'constant', value: 0 } });
  });
});

describe('purchase_items_total', () => {
  const template = getRuleTemplate('purchase_items_total')!;

  it('is not applicable with no child event in context', () => {
    expect(template.applicable(purchaseEvent(), {})).toBe(false);
  });

  it('is applicable when the child (purchase_item) event is provided', () => {
    expect(template.applicable(purchaseEvent(), { childEvent: purchaseItemEvent() })).toBe(true);
  });

  // T-2-05 fix round ruling (T-2-07 LOW 4, D-25 Q12): requires the money format on total_price.
  it('is not applicable when total_price lacks the money format, with a reason naming it', () => {
    const event = purchaseEvent({
      properties: purchaseEvent().properties.map((p) => (p.name === 'total_price' ? { ...p, data_formats: [] } : p)),
    });
    const context = { childEvent: purchaseItemEvent() };
    expect(template.applicable(event, context)).toBe(false);
    expect(template.reason(event, context)).toContain('money');
  });

  it('instantiates a cross_event rule with report_kind rounding_drift and severity warning', () => {
    const [instance] = template.instantiate(purchaseEvent(), { childEvent: purchaseItemEvent() });
    expect(instance.kind).toBe('cross_event');
    expect(instance.report_kind).toBe('rounding_drift');
    expect(instance.severity).toBe('warning');
    expect(instance.tolerance_mode).toBe('money');
  });

  it('end-to-end: the instantiated rule reproduces the phase 1 fixture (28 vs 28.4, D-31)', () => {
    const [instance] = template.instantiate(purchaseEvent(), { childEvent: purchaseItemEvent() });
    const snapshot: RuleSnapshot = {
      propertiesById: {
        [refKey('event_purchase', 'p_total_price')]: { property_id: 'p_total_price', payload_key: 'total_price', data_type: 'number' },
        [refKey('event_purchase', 'p_purchase_id')]: { property_id: 'p_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
        [refKey('event_purchase_item', 'p_price')]: { property_id: 'p_price', payload_key: 'price', data_type: 'number' },
        [refKey('event_purchase_item', 'p_quantity')]: { property_id: 'p_quantity', payload_key: 'quantity', data_type: 'number' },
        [refKey('event_purchase_item', 'p_item_purchase_id')]: { property_id: 'p_item_purchase_id', payload_key: 'purchase_id', data_type: 'string' },
      },
      money_tolerance_percent: 1,
      money_tolerance_floor: 0.01,
    };
    const parent: RuleObservation = {
      id: 'obs_purchase',
      event_id: 'event_purchase',
      variant_id: null,
      properties: { purchase_id: 'pu_1', total_price: 28 },
    };
    const items: RuleObservation[] = [
      { id: 'obs_item_1', event_id: 'event_purchase_item', variant_id: null, properties: { purchase_id: 'pu_1', price: 14.2, quantity: 1 } },
      { id: 'obs_item_2', event_id: 'event_purchase_item', variant_id: null, properties: { purchase_id: 'pu_1', price: 14.2, quantity: 1 } },
    ];
    const outcome = evaluateRule(
      { kind: instance.kind, expression: instance.expression, tolerance_mode: instance.tolerance_mode, tolerance_value: instance.tolerance_value },
      parent,
      items,
      snapshot
    );
    expect(outcome.passed).toBe(false);
    // expected = target (parent total_price), actual = computed child aggregate (fix round LOW:
    // unified expected/actual orientation across rule kinds, see RuleOutcome in types.ts).
    expect(outcome.expected).toBe(28);
    expect(outcome.actual).toBeCloseTo(28.4);
  });
});

describe('listApplicableTemplates', () => {
  it('returns only the templates applicable to the event (cart_update: item-in-list + totals)', () => {
    const applicable = listApplicableTemplates(cartUpdateEvent(), {});
    expect(applicable.map((t) => t.key).sort()).toEqual(['cart_update_item_in_list', 'cart_update_totals']);
  });
});
