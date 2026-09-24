/**
 * Pure Variant helpers (D-03, T-1-05): no DB access, so these are unit-testable without a server
 * and reusable by the QA comparison engine (T-1-09) to resolve an Observation's `variant_id` by
 * evaluating conditions against the observation's raw properties.
 */

export type VariantOperator = 'equals' | 'in';

export interface VariantCondition {
  /**
   * Key used to look up the discriminator's value in the `properties` map passed to
   * `evaluateVariant`/callers of `generateVariantName`. In the DAL this is the linked
   * `Property.id`; a caller resolving conditions against a raw observation payload must first
   * key that payload by the same identifier (e.g. the property's `payload_key`/name) before
   * calling `evaluateVariant` — this module has no knowledge of that mapping.
   */
  property_id: string;
  operator: VariantOperator;
  values: string[];
}

/**
 * True when every condition matches `properties` (AND across conditions, D-03). A condition with
 * `operator: 'equals'` matches when the (string-coerced) value at `properties[property_id]`
 * equals `values[0]`; `operator: 'in'` matches when it is included in `values`. A missing/null
 * property value never matches (a variant can only be observed when its discriminators are
 * actually present in the payload). Conditions.length === 0 never matches — a variant is defined
 * by having at least one condition (DAL-enforced); an empty list here is treated as "no variant".
 */
export function evaluateVariant(
  conditions: VariantCondition[],
  properties: Record<string, unknown>
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return false;
  return conditions.every((condition) => {
    const raw = properties[condition.property_id];
    if (raw === null || raw === undefined) return false;
    const value = String(raw);
    if (condition.operator === 'equals') {
      return condition.values.length > 0 && value === condition.values[0];
    }
    return condition.values.includes(value);
  });
}

/**
 * Generates the display/unique name for a variant: `event[prop=value]`,
 * `event[prop in (a|b)]`, or `event[p1=a,p2=b]` for two discriminators (plan "Target data model"
 * section Variant). `propertyNameById` resolves each condition's `property_id` to the property's
 * display name; an unresolved id falls back to the raw id so the function never throws.
 */
export function generateVariantName(
  eventName: string,
  conditions: VariantCondition[],
  propertyNameById: Record<string, string>
): string {
  const parts = conditions.map((condition) => {
    const propName = propertyNameById[condition.property_id] ?? condition.property_id;
    if (condition.operator === 'equals') {
      return `${propName}=${condition.values[0] ?? ''}`;
    }
    return `${propName} in (${condition.values.join('|')})`;
  });
  return `${eventName}[${parts.join(',')}]`;
}
