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
 * Canonicalizes a raw (already shape-validated) condition list so semantically identical inputs
 * always normalize to the same value (fix round ERROR 1, reopened and fixed again in the second fix
 * round): within each condition, values are de-duplicated and sorted, and an `in` operator left
 * with exactly one value collapses to `equals`; across conditions, the list is sorted by
 * `property_id` (immutable) rather than by the resolved property display name, so the canonical
 * identity — and everything derived from it (`conditions_key`, and `conditions_json`'s stored
 * order) — never depends on a name that can change later via a property rename. A rename only ever
 * changes what a condition displays as, never which conditions are "the same" one; sorting by id
 * keeps those two concerns fully decoupled (see `generateVariantName`, which sorts its own copy by
 * name for display). The `propertyNameById` parameter is accepted for call-site symmetry with
 * `generateVariantName` but is unused here. The caller (`variant.dal.ts`) is responsible for
 * rejecting a `property_id` used by more than one condition before calling this (a duplicate would
 * silently collapse here, which is not the same thing as "same value, different order").
 */
export function normalizeConditions(
  conditions: VariantCondition[],
  propertyNameById: Record<string, string>
): VariantCondition[] {
  void propertyNameById;
  return conditions
    .map((condition) => {
      const values = Array.from(new Set(condition.values)).sort();
      const operator: VariantOperator = condition.operator === 'in' && values.length === 1 ? 'equals' : condition.operator;
      return { property_id: condition.property_id, operator, values };
    })
    .sort((a, b) => a.property_id.localeCompare(b.property_id));
}

/**
 * Deterministic string for a *normalized* condition list (call `normalizeConditions` first),
 * stored in `variants.conditions_key` and enforced unique per event at the database
 * (`0006_variants_conditions_key.sql`) so equivalent conditions submitted in a different order or
 * shape can never coexist as two rows, independent of whatever separators `generateVariantName`
 * happens to use for display.
 */
export function buildConditionsKey(conditions: VariantCondition[]): string {
  return JSON.stringify(
    conditions.map((c) => ({ property_id: c.property_id, operator: c.operator, values: c.values }))
  );
}

/**
 * Generates the display/unique name for a variant: `event[prop=value]`,
 * `event[prop in (a|b)]`, or `event[p1=a,p2=b]` for two discriminators (plan "Target data model"
 * section Variant). `propertyNameById` resolves each condition's `property_id` to the property's
 * display name; an unresolved id falls back to the raw id so the function never throws. The input
 * `conditions` order (canonically `property_id` order from `normalizeConditions`) is not mutated;
 * this function sorts its own copy by the resolved display name so the name reads naturally (e.g.
 * `action` before `channel`) independent of the storage/key order, which is intentionally id-based
 * so it survives a rename (see `normalizeConditions`).
 */
export function generateVariantName(
  eventName: string,
  conditions: VariantCondition[],
  propertyNameById: Record<string, string>
): string {
  const displayOrder = [...conditions].sort((a, b) => {
    const nameA = propertyNameById[a.property_id] ?? a.property_id;
    const nameB = propertyNameById[b.property_id] ?? b.property_id;
    return nameA.localeCompare(nameB);
  });
  const parts = displayOrder.map((condition) => {
    const propName = propertyNameById[condition.property_id] ?? condition.property_id;
    if (condition.operator === 'equals') {
      return `${propName}=${condition.values[0] ?? ''}`;
    }
    return `${propName} in (${condition.values.join('|')})`;
  });
  return `${eventName}[${parts.join(',')}]`;
}
