/**
 * Findings catalogue (T-4-21): a human label, a one-sentence explanation and a "what to do next"
 * sentence for every comparison id and every finding kind, plus the kind families the findings
 * summary groups by. Pure data over `enums.ts` (the single source of the allowed values); a test
 * fails when an enum value has no entry. Raw ids stay in the JSON/CSV exports.
 */
import type { ComparisonId, FindingKind } from './enums';

export interface ComparisonInfo {
  id: ComparisonId;
  label: string;
  explanation: string;
}

export const COMPARISON_INFO: Record<ComparisonId, ComparisonInfo> = {
  definition_vs_mapping: {
    id: 'definition_vs_mapping',
    label: 'Tracking plan vs Bloomreach mapping',
    explanation:
      'Checks that the events, properties, catalogs and consents in the tracking plan appear in the Bloomreach data mapping (data-mapping.json) under the expected names.',
  },
  mapping_vs_observations: {
    id: 'mapping_vs_observations',
    label: 'Bloomreach mapping vs observed data',
    explanation:
      'Checks that the events actually seen in the data can be resolved through the Bloomreach data mapping (standard events, renames, required fields).',
  },
  definition_vs_observations: {
    id: 'definition_vs_observations',
    label: 'Tracking plan vs observed data',
    explanation:
      'Checks the events actually sent (customer events export or agent submissions) against the tracking plan: required properties, types, formats, allowed values, rules and coverage.',
  },
  data_manager: {
    id: 'data_manager',
    label: 'Tracking plan vs Data Manager',
    explanation:
      'Checks the tracking plan against the live Bloomreach Data Manager schema (event and property types) imported from Bloomreach.',
  },
};

export const FINDING_FAMILIES = ['schema', 'values', 'arithmetic', 'consistency', 'coverage', 'data_manager'] as const;
export type FindingFamily = (typeof FINDING_FAMILIES)[number];

export interface FamilyInfo {
  id: FindingFamily;
  label: string;
  explanation: string;
  next: string;
}

export const FAMILY_INFO: Record<FindingFamily, FamilyInfo> = {
  schema: {
    id: 'schema',
    label: 'Schema',
    explanation: 'The shape of the data differs from the definition: a property is missing, has the wrong type or is not defined.',
    next: 'Fix the tracking implementation, or update the definition if the data is right.',
  },
  values: {
    id: 'values',
    label: 'Values',
    explanation: 'A property is present with the right type, but its value is outside the allowed values or the expected format.',
    next: 'Fix the value that is sent, or extend the allowed values or formats in the definition.',
  },
  arithmetic: {
    id: 'arithmetic',
    label: 'Arithmetic',
    explanation: 'Numbers do not add up: totals differ from the sum of their parts, a value is out of bounds, or a rule failed.',
    next: 'Check how the totals are computed in the data layer, or adjust the rule or its tolerance.',
  },
  consistency: {
    id: 'consistency',
    label: 'Consistency',
    explanation: 'Different parts of the data or the setup contradict each other (state lists, types across events, names, expiration).',
    next: 'Align the conflicting sources so they describe the same thing.',
  },
  coverage: {
    id: 'coverage',
    label: 'Coverage',
    explanation: 'Something defined is not covered elsewhere: an event is never observed, or is not mapped.',
    next: 'Send or import the missing data, add the missing mapping, or mark the item as ignored.',
  },
  data_manager: {
    id: 'data_manager',
    label: 'Data Manager',
    explanation: 'The live Bloomreach Data Manager schema differs from the tracking plan.',
    next: 'Change the schema in Bloomreach, or update the tracking plan to match it.',
  },
};

export interface KindInfo {
  kind: FindingKind;
  family: FindingFamily;
  label: string;
  explanation: string;
  next: string;
}

const k = (kind: FindingKind, family: FindingFamily, label: string, explanation: string, next: string): KindInfo => ({
  kind,
  family,
  label,
  explanation,
  next,
});

export const KIND_INFO: Record<FindingKind, KindInfo> = {
  missing_required: k(
    'missing_required',
    'schema',
    'Missing required property',
    'An observed event does not carry a property the definition marks as required.',
    'Add the property to the tracking code, or relax the requirement in the definition.'
  ),
  type_mismatch: k(
    'type_mismatch',
    'schema',
    'Type mismatch',
    'A property arrives with a different data type than the definition (for example text instead of a number).',
    'Send the value in the defined type, or correct the type in the definition.'
  ),
  unexpected_property: k(
    'unexpected_property',
    'schema',
    'Unexpected property',
    'A property is sent (or exists in Bloomreach) that the definition does not list for this event.',
    'Remove it from the tracking code, or add it to the definition.'
  ),
  unmapped_property: k(
    'unmapped_property',
    'schema',
    'Unmapped property',
    'A property in the definition has no counterpart in the Bloomreach mapping or Data Manager.',
    'Map the property in Bloomreach, or remove it from the definition.'
  ),
  unknown_variant: k(
    'unknown_variant',
    'schema',
    'Unknown variant',
    'An observed event matches no defined variant (its discriminator values are not covered by the definition).',
    'Define the variant, or fix the discriminator value that is sent.'
  ),
  item_schema_violation: k(
    'item_schema_violation',
    'schema',
    'Item list schema violation',
    'An entry in an item list (for example a product in product_list) misses a field or has the wrong type.',
    'Fix the item fields in the tracking code, or update the item schema.'
  ),
  format_violation: k(
    'format_violation',
    'values',
    'Format violation',
    'A value does not match its defined format (for example a date, URL or currency code).',
    'Send the value in the defined format, or correct the format in the definition.'
  ),
  enum_violation: k(
    'enum_violation',
    'values',
    'Value not allowed',
    "A value is outside the property's list of allowed values.",
    'Send one of the allowed values, or add the new value to the definition.'
  ),
  rounding_drift: k(
    'rounding_drift',
    'arithmetic',
    'Rounding drift',
    'A total differs from the sum of its parts by a small rounding amount.',
    "Round consistently in the data layer, or widen the rule's tolerance if the drift is acceptable."
  ),
  bound_violation: k(
    'bound_violation',
    'arithmetic',
    'Bound violation',
    'A numeric value is outside its allowed minimum or maximum.',
    'Check the source of the value, or adjust the bounds in the rule.'
  ),
  rule_violation: k(
    'rule_violation',
    'arithmetic',
    'Rule violation',
    'A declared rule failed for an observed event (for example price times quantity does not equal the total).',
    'Fix the data if the rule is right, or adjust the rule.'
  ),
  state_list_mismatch: k(
    'state_list_mismatch',
    'consistency',
    'State list mismatch',
    'Lists that describe the same state (ids, quantities, totals) disagree in length or type, or the interacted item is missing or still present after add or remove.',
    'Rebuild the lists from one source in the data layer so they always stay in step.'
  ),
  shape_inconsistent: k(
    'shape_inconsistent',
    'consistency',
    'Inconsistent type across events',
    'The same property is sent with different types in different observed events.',
    'Send the property with one type everywhere.'
  ),
  rename_mismatch: k(
    'rename_mismatch',
    'consistency',
    'Name mismatch',
    'A name in the Bloomreach mapping differs from the name in the tracking plan (or a consent is not tagged).',
    'Make the names identical in the mapping and the tracking plan.'
  ),
  expiration_mismatch: k(
    'expiration_mismatch',
    'consistency',
    'Expiration mismatch',
    'Data was observed outside the expiration window configured for the event.',
    'Check the expiration setting, or the age of the data that is sent.'
  ),
  missing_event: k(
    'missing_event',
    'coverage',
    'Event not seen',
    'A defined event has no observations in scope (or is absent from the Data Manager).',
    'Send or import events of this type, or set the event to ignored if it is retired.'
  ),
  unexpected_event: k(
    'unexpected_event',
    'coverage',
    'Undefined event',
    'The data contains an event type that is not in the tracking plan.',
    'Add the event to the tracking plan, or stop sending it.'
  ),
  unmapped_standard_event: k(
    'unmapped_standard_event',
    'coverage',
    'Standard event not mapped',
    'A Bloomreach standard event the definition implies has no mapping (or maps without a filter).',
    'Add the standard event mapping, with a filter on the discriminator if needed.'
  ),
  unmapped_catalog: k(
    'unmapped_catalog',
    'coverage',
    'Catalog not mapped',
    "A catalog exists in the definition, but the Bloomreach mapping's catalog block is empty.",
    'Map the catalog in the data mapping.'
  ),
};

/** The family a finding belongs to: every Data Manager finding is in the Data Manager family
 * (whatever its kind), otherwise the kind decides. */
export function findingFamily(comparison: string, kind: string): FindingFamily {
  if (comparison === 'data_manager') return 'data_manager';
  return (KIND_INFO as Record<string, KindInfo | undefined>)[kind]?.family ?? 'consistency';
}

export function comparisonLabel(id: string): string {
  return (COMPARISON_INFO as Record<string, ComparisonInfo | undefined>)[id]?.label ?? id;
}

export function comparisonTooltip(id: string): string {
  return (COMPARISON_INFO as Record<string, ComparisonInfo | undefined>)[id]?.explanation ?? id;
}

export function kindLabel(kind: string): string {
  return (KIND_INFO as Record<string, KindInfo | undefined>)[kind]?.label ?? kind;
}

/** Explanation plus next step as one tooltip text; the raw id when unknown. */
export function kindTooltip(kind: string): string {
  const info = (KIND_INFO as Record<string, KindInfo | undefined>)[kind];
  return info ? `${info.explanation} Next: ${info.next}` : kind;
}
