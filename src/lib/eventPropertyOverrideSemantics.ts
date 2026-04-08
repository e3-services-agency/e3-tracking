/**
 * Pure helpers for event_property_definitions rows vs UI (badge, Remove override).
 * Keep in sync with backend normalization in event-property-definition.dal.ts.
 */
import type { EventPropertyDefinitionRow } from '../types/schema';

/** Empty arrays / empty objects are treated as "no override" for examples (matches DB cleanup). */
export function normalizeExampleValuesForStorage(ev: unknown): unknown | null {
  if (ev === null || ev === undefined) return null;
  if (Array.isArray(ev) && ev.length === 0) return null;
  if (typeof ev === 'object' && !Array.isArray(ev) && Object.keys(ev as object).length === 0) {
    return null;
  }
  return ev;
}

export function hasNonEmptyExampleValuesJson(ev: unknown): boolean {
  if (ev === null || ev === undefined) return false;
  if (Array.isArray(ev)) return ev.length > 0;
  if (typeof ev === 'object') return Object.keys(ev as object).length > 0;
  return true;
}

/**
 * True when the row has description / enum / example / name overrides worth the "Overridden" badge
 * (does not treat `required` alone as badge-worthy — see EventPropertyOverridesSection copy).
 */
export function eventPropertyDefinitionHasSemanticOverrideBadge(
  override: EventPropertyDefinitionRow | null | undefined
): boolean {
  if (!override) return false;
  const no = override.name_override;
  if (typeof no === 'string' && no.trim() !== '') return true;
  const d = override.description_override;
  if (typeof d === 'string' && d.trim() !== '') return true;
  if (override.enum_values != null && override.enum_values.length > 0) return true;
  return hasNonEmptyExampleValuesJson(override.example_values);
}

/**
 * True when there is anything persisted that "Remove override" should clear.
 * `required: false` alone is legacy noise (matches "inherit" for effective required) and does not count;
 * only an explicit `required: true` override does, plus semantic fields (description, enum, examples, name).
 */
export function eventPropertyDefinitionRowHasRemovableContent(
  override: EventPropertyDefinitionRow | null | undefined
): boolean {
  if (!override) return false;
  if (override.required === true) return true;
  return eventPropertyDefinitionHasSemanticOverrideBadge(override);
}
