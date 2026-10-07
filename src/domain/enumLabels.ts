/**
 * Human labels for the enums edited through `EnumSelect` (T-4-31): the single source for option
 * text and for the badge vocabulary, so a select and the badge beside it never disagree. Stored
 * values are unchanged. Pure data, no UI imports.
 */
import { PROPERTY_KIND_LABELS } from './propertyCategory';

export type EnumKind =
  | 'priority'
  | 'status'
  | 'class'
  | 'property_kind'
  | 'catalog_kind'
  | 'implementation'
  | 'level'
  | 'severity'
  | 'target_kind'
  | 'scope'
  | 'data_type'
  | 'origin_type'
  | 'mapping_role'
  | 'identity_type'
  | 'sdk_call'
  | 'use_case_type';

export const PRIORITY_LABELS: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_review: 'In review',
  implemented: 'Implemented',
  ignored: 'Ignored',
  proposed: 'Proposed',
  approved: 'Approved',
  in_progress: 'In progress',
  live: 'Live',
  dropped: 'Dropped',
  open: 'Open',
  resolved: 'Resolved',
  gap: 'Gap',
  // D-70 comment statuses (open and done reuse the shared keys above where they overlap).
  on_it: 'On it',
  done: 'Done',
  wont_do: "Won't do",
};
/** D-70 item 3 (T-5-03): comment reaction labels, keyed by `COMMENT_REACTION_KINDS`. */
export const REACTION_LABELS: Record<string, string> = { seen: 'Seen', like: 'Like', on_it: 'On it' };
export const CLASS_LABELS: Record<string, string> = { custom: 'Custom', sdk: 'SDK', platform: 'Platform' };
export const CATALOG_KIND_LABELS: Record<string, string> = { product: 'Product', variant: 'Variant', other: 'Other' };
export const IMPLEMENTATION_LABELS: Record<string, string> = {
  client_web: 'Client web (dataLayer)',
  server_api: 'Server API',
  sdk_auto: 'SDK automatic',
};
export const LEVEL_LABELS: Record<string, string> = { R: 'Required', O: 'Optional' };
export const SEVERITY_LABELS: Record<string, string> = { error: 'Error', warning: 'Warning', info: 'Info' };
export const TARGET_KIND_LABELS: Record<string, string> = {
  customer_property: 'Customer property',
  event: 'Event',
  variant: 'Variant',
  event_property: 'Event property',
  variant_property: 'Variant property',
  catalog_attribute: 'Catalog attribute',
  consent: 'Consent',
};

export const SCOPE_LABELS: Record<string, string> = { event: 'Event', customer: 'Customer' };
export const DATA_TYPE_LABELS: Record<string, string> = {
  string: 'String', number: 'Number', boolean: 'Boolean', timestamp: 'Timestamp', object: 'Object', array: 'Array',
};
export const ORIGIN_TYPE_LABELS: Record<string, string> = { custom: 'Custom', system: 'System' };
export const MAPPING_ROLE_LABELS: Record<string, string> = { main: 'Main catalog', variant: 'Variant catalog' };
export const IDENTITY_TYPE_LABELS: Record<string, string> = { hard: 'Hard (known customer)', soft: 'Soft (cookie or device)' };
export const SDK_CALL_LABELS: Record<string, string> = { identify: 'Identify', update: 'Update', anonymize: 'Anonymize' };
export const USE_CASE_TYPE_LABELS: Record<string, string> = { marketing: 'Marketing', transactional: 'Transactional' };

export const ENUM_LABELS: Record<EnumKind, Record<string, string>> = {
  priority: PRIORITY_LABELS,
  status: STATUS_LABELS,
  class: CLASS_LABELS,
  property_kind: PROPERTY_KIND_LABELS,
  catalog_kind: CATALOG_KIND_LABELS,
  implementation: IMPLEMENTATION_LABELS,
  level: LEVEL_LABELS,
  severity: SEVERITY_LABELS,
  target_kind: TARGET_KIND_LABELS,
  scope: SCOPE_LABELS,
  data_type: DATA_TYPE_LABELS,
  origin_type: ORIGIN_TYPE_LABELS,
  mapping_role: MAPPING_ROLE_LABELS,
  identity_type: IDENTITY_TYPE_LABELS,
  sdk_call: SDK_CALL_LABELS,
  use_case_type: USE_CASE_TYPE_LABELS,
};

/** Display label of an enum value; falls back to the value with underscores replaced. */
export function enumLabel(kind: EnumKind, value: string): string {
  return ENUM_LABELS[kind][value] ?? value.replace(/_/g, ' ');
}

/** Like `enumLabel` but passes empty values through as an empty string (exports, markdown). */
export function enumLabelOr(kind: EnumKind, value: string | null | undefined): string {
  return value ? enumLabel(kind, value) : '';
}
