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
  | 'target_kind';

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
};
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
};

/** Display label of an enum value; falls back to the value with underscores replaced. */
export function enumLabel(kind: EnumKind, value: string): string {
  return ENUM_LABELS[kind][value] ?? value.replace(/_/g, ' ');
}
