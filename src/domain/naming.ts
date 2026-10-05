/**
 * Naming convention (D-65, T-4-22): pure checks for the project's `naming_convention`. No server
 * or database imports (domain-model skill). Applies to custom events, their properties and customer
 * properties; system items are exempt (`isNamingExempt`). Relative imports only so the module loads
 * from a plain-Node vitest test.
 */
import type { NamingConvention } from './enums';
import { classifyProperty } from './propertyCategory';

export const NAMING_CONVENTION_LABELS: Record<NamingConvention, string> = {
  snake_case: 'snake_case',
  kebab_case: 'kebab-case',
  camel_case: 'camelCase',
};

export const NAMING_CONVENTION_EXAMPLES: Record<NamingConvention, string> = {
  snake_case: 'order_total',
  kebab_case: 'order-total',
  camel_case: 'orderTotal',
};

const PATTERNS: Record<NamingConvention, RegExp> = {
  snake_case: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
  kebab_case: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  camel_case: /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)*$/,
};

/** True when `name` follows `convention`. A single lower-case word follows all three. */
export function matchesConvention(name: string, convention: NamingConvention): boolean {
  return PATTERNS[convention].test(name);
}

export type NamingEntity =
  | { kind: 'event'; class: string }
  | { kind: 'property'; scope: string; name: string; category_override?: string | null }
  | { kind: 'standard_event_key' };

/** Items the convention never applies to: sdk and platform class events, SDK default properties,
 * reserved system customer properties (both through the D-64 `classifyProperty`, so a manual
 * override to another category lifts the exemption) and standard event keys. */
export function isNamingExempt(entity: NamingEntity): boolean {
  switch (entity.kind) {
    case 'event':
      return entity.class !== 'custom';
    case 'standard_event_key':
      return true;
    case 'property': {
      const category = classifyProperty(entity);
      return category === 'system_customer' || category === 'sdk_default';
    }
  }
}

/** Plain-words requirement, shown in Settings, the editors and the finding message. */
export function conventionRule(convention: NamingConvention): string {
  return `${NAMING_CONVENTION_LABELS[convention]} (for example ${NAMING_CONVENTION_EXAMPLES[convention]})`;
}

/** The one-line note under the shared page's Events and Properties headers. */
export function namingNote(convention: NamingConvention): string {
  return `Naming convention: ${NAMING_CONVENTION_LABELS[convention]} (system items exempt)`;
}

/** Inline editor warning, or `null` when the name is empty, conforms or is exempt. Never blocks saving. */
export function namingWarning(entity: NamingEntity, name: string, convention: NamingConvention): string | null {
  const trimmed = name.trim();
  if (!trimmed || isNamingExempt(entity) || matchesConvention(trimmed, convention)) return null;
  return `"${trimmed}" does not follow the project naming convention: ${conventionRule(convention)}. You can still save it.`;
}
