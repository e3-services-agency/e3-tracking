/**
 * The tracking document's TypeScript contract (D-34, T-2-08, plan "Event card and tracking
 * document"): a machine-readable, per-project export of definitions, rules, use cases, identity
 * codegen and a findings summary -- no raw observations (open question 9 leaves them out; an agent
 * gets the summary here and full rows from MCP `list_findings`, T-2-10).
 *
 * Types only, no DB or Express import (domain-model skill); `src/backend/services/document.service.ts`
 * builds the value, `GET /export/tracking-document.json` (`routes/export.ts`) serves it.
 *
 * Versioning (D-34): `version` is a plain integer, bumped only by a breaking change (a field rename
 * or removal); a purely additive change (a new optional field) does not bump it. `?version=`
 * requests an older version; the previous version is kept servable for one phase behind current
 * (see `docs/TRACKING-DOCUMENT.md`).
 */
import type { EventClass, FindingSeverity } from '../enums';

export const TRACKING_DOCUMENT_FORMAT = 'e3-tracking-document' as const;
export const TRACKING_DOCUMENT_VERSION = 1;

export interface FindingSeverityCounts {
  error: number;
  warning: number;
  info: number;
}

export interface EventCardCertification {
  applicable: boolean;
  certified: boolean;
  reasons: string[];
}

export interface EventCardExpiration {
  effective: { enabled: boolean; count: number | null; units: 'days' | 'weeks' | 'months' | 'years' | null } | null;
  source: 'variant' | 'event' | 'project' | null;
}

export interface EventCardAllowedValue {
  value: string;
  label: string | null;
  standard_event: string | null;
}

export interface EventCardItemSchemaField {
  field: string;
  data_type: string;
  data_formats?: string[];
  required?: boolean;
}

export interface EventCardProperty {
  property_id: string;
  name: string;
  payload_key: string;
  data_type: string;
  data_formats: string[];
  required: boolean;
  role: 'normal' | 'discriminator' | 'context';
  allowed_values: EventCardAllowedValue[] | null;
  item_schema: EventCardItemSchemaField[] | null;
  example: unknown;
  description: string | null;
  pii: boolean;
}

export interface EventCardVariantCondition {
  property_id: string;
  property_name: string;
  operator: 'equals' | 'in';
  values: string[];
}

export interface EventCardVariant {
  id: string;
  name: string;
  conditions: EventCardVariantCondition[];
  standard_event: string | null;
  expected_payload: Record<string, unknown>;
}

export interface EventCardStandardEventMapping {
  standard_event: string;
  variant_id: string | null;
  variant_name: string | null;
  field_map: Record<string, string | null>;
}

export interface EventCardContext {
  property_id: string;
  property: string;
  values: string[];
}

export interface EventCardCoverageColumn {
  property_id: string;
  name: string;
  values: string[];
}

export interface EventCardCoverageRow {
  variant_id: string | null;
  name: string;
}

export interface EventCardCoverage {
  rows: EventCardCoverageRow[];
  columns: EventCardCoverageColumn[];
  observed_count: number;
  unobserved_count: number;
}

export interface EventCardRule {
  id: string;
  name: string;
  kind: string;
  message: string;
  expression_text: string;
  tolerance: { mode: string; value: number | null };
  enabled: boolean;
}

export interface EventCardUseCase {
  code: string | null;
  name: string;
  level: string;
}

export interface EventCardFreshness {
  last_observation_at: number | null;
  observation_count: number;
}

export interface EventCardQuality {
  open: FindingSeverityCounts;
  by_comparison: Record<string, FindingSeverityCounts>;
}

export interface EventCardCodegen {
  gtm: string;
  web_sdk: string;
  tracking_api: string;
}

export interface EventCard {
  id: string;
  name: string;
  business_name: string | null;
  class: EventClass;
  description: string | null;
  purpose: string | null;
  page: string | null;
  trigger: string | null;
  grain: string | null;
  identity_note: string | null;
  owners: { business: string | null; technical: string | null };
  priority: string | null;
  status: string;
  certification: EventCardCertification;
  expiration: EventCardExpiration;
  properties: EventCardProperty[];
  variants: EventCardVariant[];
  standard_event_mappings: EventCardStandardEventMapping[];
  contexts: EventCardContext[];
  coverage: EventCardCoverage;
  rules: EventCardRule[];
  derived_metrics: unknown;
  not_suitable_for: string | null;
  use_cases: EventCardUseCase[];
  freshness: EventCardFreshness;
  quality: EventCardQuality;
  agent_instructions: string | null;
  codegen: EventCardCodegen;
  sdk_default_properties: string[];
}

export interface TrackingDocumentProject {
  key: string;
  name: string;
  client: string | null;
  bloomreach_project_url: string | null;
  money_tolerance: { percent: number; floor: number };
}

export interface TrackingDocumentCustomerProperty {
  property_id: string;
  name: string;
  data_type: string;
  data_formats: string[];
  bloomreach_customer_property: string | null;
  pii: boolean;
  description: string | null;
}

export interface TrackingDocumentIdentityRule {
  identifier_name: string;
  identity_type: string;
  name: string;
  transformations: string[];
  sdk_call: string | null;
  trigger_text: string | null;
}

export interface TrackingDocumentConsentCategory {
  name: string;
  standard_key: string | null;
  status: string | null;
}

export interface TrackingDocumentCatalog {
  name: string;
  mapping_role: string | null;
  status: string | null;
}

export interface TrackingDocumentRequirement {
  target_label: string;
  level: string;
  status: string | null;
}

export interface TrackingDocumentUseCase {
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  narrative: string | null;
  requirements: TrackingDocumentRequirement[];
}

export interface TrackingDocumentStandardEventMapping {
  standard_event: string;
  event_name: string;
  variant_name: string | null;
  field_map: Record<string, string | null>;
}

export interface TrackingDocumentLimits {
  event_types: { count: number; limit: number };
  max_properties_per_event: { event_id: string; event_name: string; count: number; limit: number }[];
}

export interface TrackingDocument {
  format: typeof TRACKING_DOCUMENT_FORMAT;
  version: number;
  generated_at: string;
  project: TrackingDocumentProject;
  events: EventCard[];
  properties: TrackingDocumentCustomerProperty[];
  identity_rules: TrackingDocumentIdentityRule[];
  consent_categories: TrackingDocumentConsentCategory[];
  catalogs: TrackingDocumentCatalog[];
  use_cases: TrackingDocumentUseCase[];
  standard_event_mappings: TrackingDocumentStandardEventMapping[];
  findings_summary: { open: FindingSeverityCounts; by_comparison: Record<string, FindingSeverityCounts> };
  limits: TrackingDocumentLimits;
}

export type { EventClass, FindingSeverity };
