/**
 * Applies merged effective definitions (including event variant overlays) onto
 * `getEventWithProperties` rows for codegen and documentation export.
 */
import type { EventPropertyWithDetails } from '../dal/event.dal';
import type { EffectiveEventPropertyDefinition, PropertyExampleValue } from '../../types/schema';

/**
 * Normalizes `effective.example_values` (unknown JSON) into `PropertyExampleValue[]`
 * for consumers that expect catalog-shaped examples.
 */
export function effectiveExampleValuesToPropertyJson(
  ev: unknown
): PropertyExampleValue[] | null | undefined {
  if (ev === null || ev === undefined) return undefined;
  if (Array.isArray(ev)) {
    if (ev.length === 0) return [];
    const first = ev[0];
    if (first !== null && typeof first === 'object' && 'value' in (first as object)) {
      return ev as PropertyExampleValue[];
    }
    return (ev as unknown[]).map((v) => ({ value: v })) as PropertyExampleValue[];
  }
  return [{ value: ev }];
}

/**
 * For each attached row, overlays description, examples, required, and presence from
 * the effective list (same property_id). Rows with no matching definition are unchanged.
 */
export function mergeEventPropertyWithDetailsWithEffectiveList(
  rows: EventPropertyWithDetails[],
  effective: EffectiveEventPropertyDefinition[]
): EventPropertyWithDetails[] {
  const byId = new Map<string, EffectiveEventPropertyDefinition>(
    effective.map((d) => [d.property_id, d])
  );
  return rows
    .filter((row) => byId.has(row.property_id))
    .map((row) => {
      const def = byId.get(row.property_id)!;
      const examples = effectiveExampleValuesToPropertyJson(def.effective.example_values);
      return {
        ...row,
        property_description: def.effective.description ?? row.property_description ?? null,
        property_example_values_json:
          examples !== undefined ? examples : row.property_example_values_json,
        property_required_override: def.effective.required ?? row.property_required_override,
        presence: def.presence ?? row.presence,
      };
    });
}
