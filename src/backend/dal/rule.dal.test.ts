/**
 * Rule DAL tests (D-30, D-31, T-2-06): CRUD, expression validation (400
 * `RULE_EXPRESSION_INVALID`), variant scoping (400 for a cross-event variant), tolerance/report
 * kind rules (D-31's rounding_drift restriction), version increment on update, and every seed
 * template's `from-template` path against a hand-built cart_update/purchase/purchase_item fixture.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as VariantDAL from './variant.dal';
import * as StandardEventMappingDAL from './standard-event-mapping.dal';
import * as RuleDAL from './rule.dal';
import { BadRequestError, NotFoundError, RuleExpressionInvalidError } from '../errors';

let projectId: string;
let cartUpdateEventId: string;
let productIdPropId: string;
let productListPropId: string;
let totalPricePropId: string;
let totalQuantityPropId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  cartUpdateEventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;

  productIdPropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string' }).id;
  productListPropId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'product_list',
    data_type: 'array',
    item_schema_json: [
      { field: 'product_id', data_type: 'string', required: true },
      { field: 'price', data_type: 'number', required: true },
      { field: 'quantity', data_type: 'number', required: true },
    ],
  }).id;
  totalPricePropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' }).id;
  totalQuantityPropId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'total_quantity',
    data_type: 'number',
  }).id;

  EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: productIdPropId, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: productListPropId, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: totalPricePropId, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: totalQuantityPropId, role: 'normal' });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

function membershipInput(overrides?: Partial<RuleDAL.RuleInput>): RuleDAL.RuleInput {
  return {
    kind: 'membership',
    name: 'item_in_list',
    expression_json: {
      kind: 'membership',
      needle: { ref: 'property', property_id: productIdPropId },
      haystack: { property_id: productListPropId, field: 'product_id' },
    },
    ...overrides,
  };
}

describe('rule.dal: create/list/get', () => {
  it('creates a rule with defaults (report_kind, severity, tolerance_mode, message)', () => {
    const rule = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(rule.report_kind).toBe('rule_violation');
    expect(rule.severity).toBe('error');
    expect(rule.tolerance_mode).toBe('none');
    expect(rule.message).toContain('item_in_list');
    expect(rule.enabled).toBe(true);
    expect(rule.version).toBe(1);
  });

  it('lists rules by event and by project', () => {
    RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(RuleDAL.listRulesByEvent(projectId, cartUpdateEventId)).toHaveLength(1);
    expect(RuleDAL.listRulesByProject(projectId)).toHaveLength(1);
  });

  it('404s for an unknown event', () => {
    expect(() => RuleDAL.listRulesByEvent(projectId, 'nope')).toThrow(NotFoundError);
  });

  it('404s for an unknown rule id', () => {
    expect(() => RuleDAL.getRuleOrThrow(projectId, 'nope')).toThrow(NotFoundError);
  });
});

describe('rule.dal: expression validation (400 RULE_EXPRESSION_INVALID)', () => {
  it('rejects a needle property not linked to the event', () => {
    expect(() =>
      RuleDAL.createRule(
        projectId,
        cartUpdateEventId,
        membershipInput({ expression_json: { kind: 'membership', needle: { ref: 'property', property_id: 'nope' }, haystack: { property_id: productListPropId, field: 'product_id' } } })
      )
    ).toThrow(RuleExpressionInvalidError);
  });

  it('rejects an unknown comparator', () => {
    expect(() =>
      RuleDAL.createRule(projectId, cartUpdateEventId, {
        kind: 'arithmetic',
        name: 'bad',
        expression_json: {
          kind: 'arithmetic',
          left: { ref: 'property', property_id: totalPricePropId },
          comparator: 'approx',
          right: { ref: 'constant', value: 1 },
        },
      })
    ).toThrow(RuleExpressionInvalidError);
  });

  it('rejects a mismatched kind/expression.kind', () => {
    expect(() =>
      RuleDAL.createRule(projectId, cartUpdateEventId, {
        kind: 'bound',
        name: 'bad',
        expression_json: {
          kind: 'membership',
          needle: { ref: 'property', property_id: productIdPropId },
          haystack: { property_id: productListPropId, field: 'product_id' },
        },
      })
    ).toThrow(RuleExpressionInvalidError);
  });
});

describe('rule.dal: variant scoping', () => {
  it('rejects a variant_id that does not belong to the event', () => {
    const otherEventId = EventDAL.createEvent(projectId, { name: 'other_event' }).id;
    const discPropId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'status',
      data_type: 'string',
      allowed_values_json: [{ value: 'ok' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, otherEventId, { property_id: discPropId, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, otherEventId, {
      conditions: [{ property_id: discPropId, operator: 'equals', values: ['ok'] }],
    });
    expect(() => RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ variant_id: variant.id }))).toThrow(
      BadRequestError
    );
  });

  it('accepts a variant_id that belongs to the event, and two rules of the same name on different variants coexist', () => {
    const discPropId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, cartUpdateEventId, { property_id: discPropId, role: 'discriminator' });
    const variantAdd = VariantDAL.createVariant(projectId, cartUpdateEventId, {
      conditions: [{ property_id: discPropId, operator: 'equals', values: ['add'] }],
    });
    const variantRemove = VariantDAL.createVariant(projectId, cartUpdateEventId, {
      conditions: [{ property_id: discPropId, operator: 'equals', values: ['remove'] }],
    });
    const ruleAdd = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ variant_id: variantAdd.id }));
    const ruleRemove = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ variant_id: variantRemove.id }));
    expect(ruleAdd.id).not.toBe(ruleRemove.id);
  });
});

describe('rule.dal: report_kind / tolerance_mode interaction (D-31)', () => {
  it('rejects report_kind rounding_drift on a non-cross_event rule', () => {
    expect(() => RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ report_kind: 'rounding_drift' }))).toThrow(
      BadRequestError
    );
  });

  it('rejects report_kind rounding_drift with tolerance_mode != money even on cross_event', () => {
    const purchaseEventId = EventDAL.createEvent(projectId, { name: 'purchase' }).id;
    const purchaseIdPropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'purchase_id', data_type: 'string' }).id;
    EventDAL.attachPropertyToEvent(projectId, purchaseEventId, { property_id: purchaseIdPropId, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, purchaseEventId, { property_id: totalPricePropId, role: 'normal' });
    // reuse cart_update's product_id/product_list as stand-ins for the child event's price/quantity for this narrow test
    expect(() =>
      RuleDAL.createRule(projectId, purchaseEventId, {
        kind: 'cross_event',
        name: 'items_total',
        report_kind: 'rounding_drift',
        tolerance_mode: 'none',
        expression_json: {
          kind: 'cross_event',
          child_event_id: cartUpdateEventId,
          join: { parent_property_id: purchaseIdPropId, child_property_id: productIdPropId },
          child: { ref: 'aggregate', fn: 'sum', of: { ref: 'property', property_id: productIdPropId } },
          comparator: 'eq',
          target: { ref: 'property', property_id: totalPricePropId },
        },
      })
    ).toThrow(BadRequestError);
  });
});

describe('rule.dal: update increments version', () => {
  it('bumps version on every update', () => {
    const rule = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(rule.version).toBe(1);
    const updated = RuleDAL.updateRule(projectId, rule.id, { message: 'new message' });
    expect(updated.version).toBe(2);
    expect(updated.message).toBe('new message');
    const updatedAgain = RuleDAL.updateRule(projectId, rule.id, { enabled: false });
    expect(updatedAgain.version).toBe(3);
    expect(updatedAgain.enabled).toBe(false);
  });
});

describe('rule.dal: delete', () => {
  it('deletes a rule', () => {
    const rule = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    RuleDAL.deleteRule(projectId, rule.id);
    expect(RuleDAL.getRuleById(projectId, rule.id)).toBeNull();
  });
});

describe('rule.dal: uniqueness (event, variant, name)', () => {
  it('rejects two event-scoped rules with the same name (409)', () => {
    RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(() => RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput())).toThrow();
  });
});

describe('rule.dal: tolerance_value must not be negative (fix round LOW)', () => {
  it('rejects a negative tolerance_value on tolerance_mode absolute', () => {
    expect(() =>
      RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ tolerance_mode: 'absolute', tolerance_value: -5 }))
    ).toThrow(BadRequestError);
  });

  it('rejects a negative tolerance_value even alongside tolerance_mode none', () => {
    expect(() =>
      RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ tolerance_mode: 'none', tolerance_value: -1 }))
    ).toThrow(BadRequestError);
  });

  it('accepts a zero or positive tolerance_value', () => {
    const rule = RuleDAL.createRule(
      projectId,
      cartUpdateEventId,
      membershipInput({ tolerance_mode: 'absolute', tolerance_value: 0 })
    );
    expect(rule.tolerance_value).toBe(0);
  });
});

describe('rule.dal: message must be a string, tolerance_value a finite number (T-2-07 fix round from T-2-06 review)', () => {
  it('400s (not a 500) when message is not a string', () => {
    expect(() =>
      RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ message: 5 as unknown as string }))
    ).toThrow(BadRequestError);
  });

  it('accepts an absent message (falls back to the generated default)', () => {
    const rule = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(rule.message).toContain('item_in_list');
  });

  it('400s when tolerance_value is not a finite number (string, NaN, Infinity)', () => {
    expect(() =>
      RuleDAL.createRule(
        projectId,
        cartUpdateEventId,
        membershipInput({ tolerance_mode: 'absolute', tolerance_value: 'five' as unknown as number })
      )
    ).toThrow(BadRequestError);
    expect(() =>
      RuleDAL.createRule(
        projectId,
        cartUpdateEventId,
        membershipInput({ tolerance_mode: 'absolute', tolerance_value: Number.NaN })
      )
    ).toThrow(BadRequestError);
    expect(() =>
      RuleDAL.createRule(
        projectId,
        cartUpdateEventId,
        membershipInput({ tolerance_mode: 'absolute', tolerance_value: Number.POSITIVE_INFINITY })
      )
    ).toThrow(BadRequestError);
  });
});

describe('rule.dal: listRulesByEvent/listRulesByProject report status "broken" for a detached property (fix round LOW)', () => {
  it('status is "ok" while the referenced properties stay linked, "broken" once one is detached', () => {
    const rule = RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput());
    expect(RuleDAL.listRulesByEvent(projectId, cartUpdateEventId)[0].status).toBe('ok');
    expect(RuleDAL.listRulesByProject(projectId).find((r) => r.id === rule.id)?.status).toBe('ok');

    EventDAL.detachPropertyFromEvent(projectId, cartUpdateEventId, productIdPropId);

    expect(RuleDAL.listRulesByEvent(projectId, cartUpdateEventId)[0].status).toBe('broken');
    expect(RuleDAL.listRulesByProject(projectId).find((r) => r.id === rule.id)?.status).toBe('broken');
    // The rule itself is untouched (still readable, still evaluable as a no-match) - only the
    // list views flag it, they don't delete or disable it.
    expect(RuleDAL.getRuleOrThrow(projectId, rule.id).enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Templates: cart_update_item_in_list, cart_update_totals directly on the beforeEach fixture;
// purchase_refund_negative and purchase_items_total on a purpose-built purchase/purchase_item
// fixture with a standard event mapping (so property resolution goes through the field map).
// ---------------------------------------------------------------------------
describe('rule.dal: listRuleTemplates', () => {
  it('marks cart_update_item_in_list and cart_update_totals applicable for the fixture event', () => {
    const summaries = RuleDAL.listRuleTemplates(projectId, cartUpdateEventId);
    const byKey = Object.fromEntries(summaries.map((s) => [s.key, s.applicable]));
    expect(byKey.cart_update_item_in_list).toBe(true);
    expect(byKey.cart_update_totals).toBe(true);
    expect(byKey.purchase_refund_negative).toBe(false);
    expect(byKey.purchase_items_total).toBe(false);
  });

  it('returns every template with applicable false when no event_id is given', () => {
    const summaries = RuleDAL.listRuleTemplates(projectId);
    expect(summaries).toHaveLength(4);
    expect(summaries.every((s) => s.applicable === false)).toBe(true);
  });
});

describe('rule.dal: createRulesFromTemplate', () => {
  it('cart_update_item_in_list creates one membership rule', () => {
    const rules = RuleDAL.createRulesFromTemplate(projectId, cartUpdateEventId, 'cart_update_item_in_list');
    expect(rules).toHaveLength(1);
    expect(rules[0].kind).toBe('membership');
    expect(rules[0].template_key).toBe('cart_update_item_in_list');
  });

  it('cart_update_totals creates two arithmetic rules', () => {
    const rules = RuleDAL.createRulesFromTemplate(projectId, cartUpdateEventId, 'cart_update_totals');
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.kind === 'arithmetic')).toBe(true);
    expect(rules.find((r) => r.tolerance_mode === 'money')).toBeDefined();
  });

  it('404s for an unknown template key', () => {
    expect(() => RuleDAL.createRulesFromTemplate(projectId, cartUpdateEventId, 'nope')).toThrow(NotFoundError);
  });

  it('400s when the template is not applicable (missing item schema)', () => {
    const barePropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'bare_id', data_type: 'string' }).id;
    const bareEventId = EventDAL.createEvent(projectId, { name: 'bare_event' }).id;
    EventDAL.attachPropertyToEvent(projectId, bareEventId, { property_id: barePropId, role: 'normal' });
    expect(() => RuleDAL.createRulesFromTemplate(projectId, bareEventId, 'cart_update_item_in_list')).toThrow(BadRequestError);
  });

  it('is transactional: a 409 name clash on the second instantiated rule leaves neither behind (fix round LOW)', () => {
    // Pre-seed a rule whose name collides with cart_update_totals's second instantiated rule, so
    // the template's own transaction fails partway through on the second createRule() call.
    const summaries = RuleDAL.listRuleTemplates(projectId, cartUpdateEventId);
    expect(summaries.find((s) => s.key === 'cart_update_totals')?.applicable).toBe(true);

    // Discover the two rule names the template would create, then pre-create the second one under
    // a different template_key so the template's own second createRule() call 409s.
    const before = RuleDAL.createRulesFromTemplate(projectId, cartUpdateEventId, 'cart_update_totals');
    expect(before).toHaveLength(2);
    for (const r of before) RuleDAL.deleteRule(projectId, r.id);
    RuleDAL.createRule(projectId, cartUpdateEventId, membershipInput({ name: before[1].name }));

    const countBefore = RuleDAL.listRulesByEvent(projectId, cartUpdateEventId).length;
    expect(() => RuleDAL.createRulesFromTemplate(projectId, cartUpdateEventId, 'cart_update_totals')).toThrow();
    // Only the pre-seeded rule remains; the template's first rule was rolled back, not left behind.
    expect(RuleDAL.listRulesByEvent(projectId, cartUpdateEventId)).toHaveLength(countBefore);
  });

  describe('purchase_refund_negative and purchase_items_total (standard event mapping fixture)', () => {
    let purchaseEventId: string;
    let purchaseItemEventId: string;
    let purchaseTotalPriceId: string;
    let purchaseIdPropId: string;
    let purchaseStatusPropId: string;
    let itemPriceId: string;
    let itemQuantityId: string;
    let itemPurchaseIdId: string;

    beforeEach(() => {
      purchaseEventId = EventDAL.createEvent(projectId, { name: 'purchase' }).id;
      purchaseItemEventId = EventDAL.createEvent(projectId, { name: 'purchase_item' }).id;

      purchaseTotalPriceId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'purchase_total_price', data_type: 'number' }).id;
      purchaseIdPropId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'purchase_purchase_id', data_type: 'string' }).id;
      purchaseStatusPropId = PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'purchase_status',
        data_type: 'string',
        allowed_values_json: [{ value: 'success' }, { value: 'refunded' }],
      }).id;
      itemPriceId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'item_price', data_type: 'number' }).id;
      itemQuantityId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'item_quantity', data_type: 'number' }).id;
      itemPurchaseIdId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'item_purchase_id', data_type: 'string' }).id;

      EventDAL.attachPropertyToEvent(projectId, purchaseEventId, { property_id: purchaseTotalPriceId, role: 'normal' });
      EventDAL.attachPropertyToEvent(projectId, purchaseEventId, { property_id: purchaseIdPropId, role: 'normal' });
      EventDAL.attachPropertyToEvent(projectId, purchaseEventId, { property_id: purchaseStatusPropId, role: 'discriminator' });
      EventDAL.attachPropertyToEvent(projectId, purchaseItemEventId, { property_id: itemPriceId, role: 'normal' });
      EventDAL.attachPropertyToEvent(projectId, purchaseItemEventId, { property_id: itemQuantityId, role: 'normal' });
      EventDAL.attachPropertyToEvent(projectId, purchaseItemEventId, { property_id: itemPurchaseIdId, role: 'normal' });

      // Field-renamed properties, resolved only through the standard event mapping (not by name).
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'purchase', {
        event_id: purchaseEventId,
        field_map_json: { total_price: purchaseTotalPriceId, purchase_id: purchaseIdPropId },
      });
      StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'purchase_item', {
        event_id: purchaseItemEventId,
        field_map_json: { total_price: itemPriceId, total_quantity: itemQuantityId, purchase_id: itemPurchaseIdId },
      });
    });

    it('purchase_refund_negative is applicable once a refunded variant exists, and scopes the bound rule to it', () => {
      const variant = VariantDAL.createVariant(projectId, purchaseEventId, {
        conditions: [{ property_id: purchaseStatusPropId, operator: 'equals', values: ['refunded'] }],
      });
      const summaries = RuleDAL.listRuleTemplates(projectId, purchaseEventId);
      expect(summaries.find((s) => s.key === 'purchase_refund_negative')?.applicable).toBe(true);

      const [rule] = RuleDAL.createRulesFromTemplate(projectId, purchaseEventId, 'purchase_refund_negative');
      expect(rule.kind).toBe('bound');
      expect(rule.report_kind).toBe('bound_violation');
      expect(rule.variant_id).toBe(variant.id);
    });

    it('purchase_items_total is applicable via the standard_event_mappings field maps and creates a cross_event rounding_drift rule', () => {
      const summaries = RuleDAL.listRuleTemplates(projectId, purchaseEventId);
      expect(summaries.find((s) => s.key === 'purchase_items_total')?.applicable).toBe(true);

      const [rule] = RuleDAL.createRulesFromTemplate(projectId, purchaseEventId, 'purchase_items_total');
      expect(rule.kind).toBe('cross_event');
      expect(rule.report_kind).toBe('rounding_drift');
      expect(rule.severity).toBe('warning');
      expect(rule.tolerance_mode).toBe('money');
      expect((rule.expression_json as { child_event_id: string }).child_event_id).toBe(purchaseItemEventId);
    });
  });
});
