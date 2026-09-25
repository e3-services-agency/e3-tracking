/**
 * Seed rule templates (D-30, D-31, T-2-06): `applicable(event, context)` decides whether a
 * template can be offered for an event ("Apply template" buttons show only applicable templates,
 * T-2-07); `instantiate(event, context)` builds one or more ready-to-create rules. Pure — the
 * caller (`rule.dal.ts`) resolves the event's linked properties (and, for `purchase_items_total`,
 * the child event's) into a `TemplateEventSnapshot` first.
 *
 * Property resolution order (plan "Rules evaluator"): each template first tries the event's own
 * standard-event-mapping field map (`snapshot.standard_field_map[fieldName]`), then falls back to
 * a linked property with a matching `name`. This lets a template apply both to a project that
 * mapped `cart_update` to the `add_to_cart` standard event with renamed fields, and to one that
 * never ran a data-mapping import at all and just named its properties conventionally.
 */
import type { RuleKind, RuleReportKind, RuleSeverity, RuleToleranceMode } from '../enums';
import type { ItemSchemaField, Operand, RuleExpression } from './types';
import type { VariantCondition } from '../variants';

export interface TemplateEventProperty {
  property_id: string;
  name: string;
  role: 'normal' | 'discriminator' | 'context';
  data_type: string;
  item_schema: ItemSchemaField[] | null;
}

export interface TemplateVariant {
  id: string;
  name: string;
  conditions: VariantCondition[];
}

export interface TemplateEventSnapshot {
  event_id: string;
  event_name: string;
  properties: TemplateEventProperty[];
  /** Resolved standard-event field map for this event (`{fieldName: property_id}`), if any
   * standard event is mapped to it. Merges every mapped standard event's field map. */
  standard_field_map: Record<string, string | null>;
  variants: TemplateVariant[];
}

export interface TemplateContext {
  /** Required for `purchase_items_total` (cross_event): the resolved snapshot of the event
   * mapped to the `purchase_item` standard event. Templates that don't need it ignore this. */
  childEvent?: TemplateEventSnapshot | null;
}

export interface RuleTemplateInstance {
  name: string;
  message: string;
  kind: RuleKind;
  expression: RuleExpression;
  tolerance_mode: RuleToleranceMode;
  tolerance_value: number | null;
  report_kind: RuleReportKind;
  severity: RuleSeverity;
  /** Set when the instance is scoped to one of `event.variants` (e.g. `purchase_refund_negative`). */
  variant_id?: string | null;
}

export interface RuleTemplate {
  key: string;
  name: string;
  description: string;
  applicable: (event: TemplateEventSnapshot, context: TemplateContext) => boolean;
  instantiate: (event: TemplateEventSnapshot, context: TemplateContext) => RuleTemplateInstance[];
}

function resolveByStandardOrName(
  event: TemplateEventSnapshot,
  standardField: string,
  fallbackName: string
): TemplateEventProperty | undefined {
  const viaStandard = event.standard_field_map[standardField];
  if (viaStandard) {
    const property = event.properties.find((p) => p.property_id === viaStandard);
    if (property) return property;
  }
  return event.properties.find((p) => p.name === fallbackName);
}

function hasItemSchemaField(property: TemplateEventProperty | undefined, field: string): boolean {
  return !!property && property.data_type === 'array' && !!property.item_schema?.some((f) => f.field === field);
}

const propertyOperand = (property: TemplateEventProperty): Operand => ({ ref: 'property', property_id: property.property_id });

// ---------------------------------------------------------------------------
// cart_update_item_in_list: membership — product_id in product_list[].product_id
// ---------------------------------------------------------------------------
const cartUpdateItemInList: RuleTemplate = {
  key: 'cart_update_item_in_list',
  name: 'Item present in product list',
  description: 'The changed product_id must be present in product_list.',
  applicable: (event) => {
    const productId = resolveByStandardOrName(event, 'product_id', 'product_id');
    const productList = resolveByStandardOrName(event, 'product_list', 'product_list');
    return !!productId && hasItemSchemaField(productList, 'product_id');
  },
  instantiate: (event) => {
    const productId = resolveByStandardOrName(event, 'product_id', 'product_id')!;
    const productList = resolveByStandardOrName(event, 'product_list', 'product_list')!;
    return [
      {
        name: `${event.event_name}_item_in_product_list`,
        message: `"product_id" must be present in "${productList.name}".`,
        kind: 'membership',
        expression: {
          kind: 'membership',
          needle: propertyOperand(productId),
          haystack: { property_id: productList.property_id, field: 'product_id' },
        },
        tolerance_mode: 'none',
        tolerance_value: null,
        report_kind: 'rule_violation',
        severity: 'error',
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// cart_update_totals: two arithmetic rules — price*quantity sum eq total_price (money), quantity
// sum eq total_quantity (exact).
// ---------------------------------------------------------------------------
const cartUpdateTotals: RuleTemplate = {
  key: 'cart_update_totals',
  name: 'Cart totals match the product list',
  description: 'total_price and total_quantity must match the sums over product_list.',
  applicable: (event) => {
    const productList = resolveByStandardOrName(event, 'product_list', 'product_list');
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price');
    const totalQuantity = resolveByStandardOrName(event, 'total_quantity', 'total_quantity');
    return (
      hasItemSchemaField(productList, 'price') &&
      hasItemSchemaField(productList, 'quantity') &&
      !!totalPrice &&
      !!totalQuantity
    );
  },
  instantiate: (event) => {
    const productList = resolveByStandardOrName(event, 'product_list', 'product_list')!;
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price')!;
    const totalQuantity = resolveByStandardOrName(event, 'total_quantity', 'total_quantity')!;
    return [
      {
        name: `${event.event_name}_total_price_sum`,
        message: `"${totalPrice.name}" must equal the sum of product_list[].price * quantity.`,
        kind: 'arithmetic',
        expression: {
          kind: 'arithmetic',
          left: {
            ref: 'aggregate',
            fn: 'sum',
            of: {
              ref: 'product',
              left: { ref: 'list_field', property_id: productList.property_id, field: 'price' },
              right: { ref: 'list_field', property_id: productList.property_id, field: 'quantity' },
            },
          },
          comparator: 'eq',
          right: propertyOperand(totalPrice),
        },
        tolerance_mode: 'money',
        tolerance_value: null,
        report_kind: 'rule_violation',
        severity: 'error',
      },
      {
        name: `${event.event_name}_total_quantity_sum`,
        message: `"${totalQuantity.name}" must equal the sum of product_list[].quantity.`,
        kind: 'arithmetic',
        expression: {
          kind: 'arithmetic',
          left: {
            ref: 'aggregate',
            fn: 'sum',
            of: { ref: 'list_field', property_id: productList.property_id, field: 'quantity' },
          },
          comparator: 'eq',
          right: propertyOperand(totalQuantity),
        },
        tolerance_mode: 'none',
        tolerance_value: null,
        report_kind: 'rule_violation',
        severity: 'error',
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// purchase_refund_negative: bound, variant-scoped — total_price < 0 on the refunded variant.
// ---------------------------------------------------------------------------
function findRefundedVariant(event: TemplateEventSnapshot): TemplateVariant | undefined {
  const purchaseStatus = resolveByStandardOrName(event, 'purchase_status', 'purchase_status');
  if (!purchaseStatus) return undefined;
  return event.variants.find((variant) =>
    variant.conditions.some(
      (c) => c.property_id === purchaseStatus.property_id && c.values.some((v) => v.toLowerCase() === 'refunded')
    )
  );
}

const purchaseRefundNegative: RuleTemplate = {
  key: 'purchase_refund_negative',
  name: 'Refund amounts are negative',
  description: 'A refunded purchase must carry a negative total_price, or lifetime value is corrupted.',
  applicable: (event) => {
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price');
    return !!totalPrice && !!findRefundedVariant(event);
  },
  instantiate: (event) => {
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price')!;
    const variant = findRefundedVariant(event)!;
    return [
      {
        name: `${event.event_name}_refund_negative_amount`,
        message: `"${totalPrice.name}" must be negative on a refunded purchase.`,
        kind: 'bound',
        expression: {
          kind: 'bound',
          subject: propertyOperand(totalPrice),
          check: 'lt',
          bound: { ref: 'constant', value: 0 },
        },
        tolerance_mode: 'none',
        tolerance_value: null,
        report_kind: 'bound_violation',
        severity: 'error',
        variant_id: variant.id,
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// purchase_items_total: cross_event — sum(purchase_item.price * quantity) joined on purchase_id
// eq purchase.total_price, money tolerance, report_kind rounding_drift (D-31, replaces the phase
// 1 hard-coded computeRoundingDrift).
// ---------------------------------------------------------------------------
const purchaseItemsTotal: RuleTemplate = {
  key: 'purchase_items_total',
  name: 'Purchase total matches its items',
  description: 'purchase.total_price must match the sum of purchase_item.price * quantity for the same purchase_id.',
  applicable: (event, context) => {
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price');
    const purchaseId = resolveByStandardOrName(event, 'purchase_id', 'purchase_id');
    const child = context.childEvent;
    if (!totalPrice || !purchaseId || !child) return false;
    const childPrice = resolveByStandardOrName(child, 'total_price', 'price');
    const childQuantity = resolveByStandardOrName(child, 'total_quantity', 'quantity');
    const childPurchaseId = resolveByStandardOrName(child, 'purchase_id', 'purchase_id');
    return !!childPrice && !!childQuantity && !!childPurchaseId;
  },
  instantiate: (event, context) => {
    const totalPrice = resolveByStandardOrName(event, 'total_price', 'total_price')!;
    const purchaseId = resolveByStandardOrName(event, 'purchase_id', 'purchase_id')!;
    const child = context.childEvent!;
    const childPrice = resolveByStandardOrName(child, 'total_price', 'price')!;
    const childQuantity = resolveByStandardOrName(child, 'total_quantity', 'quantity')!;
    const childPurchaseId = resolveByStandardOrName(child, 'purchase_id', 'purchase_id')!;
    return [
      {
        name: `${event.event_name}_items_total`,
        message: `"${totalPrice.name}" must match the sum of ${child.event_name}'s price * quantity for the same purchase.`,
        kind: 'cross_event',
        expression: {
          kind: 'cross_event',
          child_event_id: child.event_id,
          join: { parent_property_id: purchaseId.property_id, child_property_id: childPurchaseId.property_id },
          child: {
            ref: 'aggregate',
            fn: 'sum',
            of: {
              ref: 'product',
              left: propertyOperand(childPrice),
              right: propertyOperand(childQuantity),
            },
          },
          comparator: 'eq',
          target: propertyOperand(totalPrice),
        },
        tolerance_mode: 'money',
        tolerance_value: null,
        report_kind: 'rounding_drift',
        severity: 'warning',
      },
    ];
  },
};

export const RULE_TEMPLATES: readonly RuleTemplate[] = [
  cartUpdateItemInList,
  cartUpdateTotals,
  purchaseRefundNegative,
  purchaseItemsTotal,
];

export function getRuleTemplate(key: string): RuleTemplate | undefined {
  return RULE_TEMPLATES.find((t) => t.key === key);
}

export function listApplicableTemplates(event: TemplateEventSnapshot, context: TemplateContext): RuleTemplate[] {
  return RULE_TEMPLATES.filter((t) => t.applicable(event, context));
}
