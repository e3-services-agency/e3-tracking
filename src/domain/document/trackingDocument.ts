/**
 * The tracking document's TypeScript contract (D-34, T-2-08, plan "Event card and tracking
 * document"): a machine-readable, per-project export of definitions, rules, use cases, identity
 * codegen and findings -- D-40 Q9 (fix round, superseding the earlier "summary only" open question
 * 9 answer): every `EventCard` carries its own open findings uncapped (`findings[]`, every
 * severity), plus the project-wide `findings_summary` counts; there is no separate raw-observation
 * dump (an agent still gets full observation rows from MCP `list_findings`/`get_event_card`,
 * T-2-10, but the findings themselves are inline here so no second round-trip is needed to see
 * *why* an event is not certified).
 *
 * Types only, no DB or Express import (domain-model skill); `src/backend/services/document.service.ts`
 * builds the value, `GET /export/tracking-document.json` (`routes/export.ts`) serves it.
 *
 * Versioning (D-34): `version` is a plain integer, bumped only by a breaking change (a field rename
 * or removal); a purely additive change (a new optional field) does not bump it. `?version=`
 * requests an older version; the previous version is kept servable for one phase behind current
 * (see `docs/TRACKING-DOCUMENT.md`).
 */
import type { ComparisonId, EventClass, FindingKind, FindingSeverity, ImplementationMethod, PropertyKind } from '../enums';
import type { PropertyDerivation } from '../codegen/derivation';

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

/** One open `Finding` row, per D-40 Q9 (fix round): every field an agent needs to act on the
 * finding without a second `list_findings` round-trip. `property`/`variant`/`rule` are display
 * names resolved from their ids (`rule` is the originating rule's name, from `Rule.name` via the
 * finding's `expected_json.rule_name`, T-2-07; `null` for a finding that did not come from a rule). */
export interface EventCardFinding {
  id: string;
  comparison: ComparisonId;
  kind: FindingKind;
  severity: FindingSeverity;
  property_id: string | null;
  property: string | null;
  variant_id: string | null;
  variant: string | null;
  rule: string | null;
  message: string | null;
  expected: unknown;
  actual: unknown;
  qa_run_id: string | null;
  first_seen: string;
  last_seen: string;
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
  /** D-58: the named definition this link uses (`property-definition.dal.ts`); `null` only for a
   * defensive fallback, every link is resolved to a real definition by the DAL. */
  definition_id: string | null;
  definition_name: string | null;
  /** D-63 (T-4-17), additive: `event` | `item` | `state_list` | `context`. */
  kind: PropertyKind;
  /** D-63: for a `state_list`, the rule computing it from the items; else `null`. */
  derivation: PropertyDerivation | null;
  /** D-63: where the value lives in the dataLayer (`bloomreach.properties.x`, `bloomreach.item.x`, `computed from items`); `null` when the event is not `client_web` (server_api and sdk_auto events have no dataLayer). */
  datalayer_path: string | null;
  /** D-63: names of the property bundle(s) this property belongs to, comma-joined; `null` when in none. */
  bundle: string | null;
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
  /** Payload keys of `expected_payload` that are required (WARNING 6 fix round): without this an
   * agent cannot tell required from optional keys in the sample without cross-referencing
   * `EventCard.properties[]` by `payload_key`. */
  required_keys: string[];
  /** This variant's own `expiration_json` override, when set (WARNING 4 fix round); `null` means
   * no override -- this variant follows the event/project-level `EventCard.expiration` above. */
  expiration: EventCardExpiration | null;
}

export interface EventCardStandardEventMapping {
  standard_event: string;
  variant_id: string | null;
  variant_name: string | null;
  field_map: Record<string, string | null>;
}

/** D-50 (T-4-03): one screenshot/trigger entry from `Event.triggers_json`, additive on `EventCard`
 * so the shared documentation view (and any other `EventCard` consumer) can render the same
 * trigger screenshots the internal event card shows, through a `fileUrl(image_path)` resolver of
 * its own (internal: `/api/projects/:id/files/*`, shared: `/api/shared/:token/files/*`). `page_url`
 * is `triggers_json`'s `source` field (the page the screenshot was captured on). */
export interface EventCardTrigger {
  title: string | null;
  description: string | null;
  image_path: string | null;
  page_url: string | null;
}

export interface EventCardContext {
  property_id: string;
  property: string;
  /** The key `context_values_json`/the raw observation payload actually carries (ERROR 2 fix
   * round); may differ from `property` (the display name) when the property's `payload_key` is
   * set. Coverage columns below are keyed by this same value. */
  payload_key: string;
  values: string[];
}

export interface EventCardCoverageColumn {
  property_id: string;
  name: string;
  /** ERROR 2 fix round: the column is a `payload_key`, matching `GET /events/:id/coverage`'s
   * `computeEventCoverageGrid` and `context_values_json`/observation lookups (`coverage.ts`) --
   * previously this used the property's display name, which silently diverged from the full grid
   * whenever a context property's `payload_key` differed from its `name`. */
  payload_key: string;
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
  /** ERROR 3 fix round: `null` for an unconditional (event-wide) rule; non-null scopes the rule to
   * one variant's observations only (`RuleRow.variant_id`, D-30 "matched variant"). Dropping this
   * used to make a variant-scoped guardrail read as if it applied to every observation of the
   * event. */
  variant_id: string | null;
  variant_name: string | null;
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
  /** D-42 (T-2-09 fix round): error-severity findings a person resolved by hand
   * (`resolved_by = 'user'`) whose fingerprint still reproduced as of the last recompute --
   * excluded from `open`/`EventCard.findings[]`, but still block certification
   * (`acknowledged_errors: n` in `EventCard.certification.reasons`). */
  acknowledged: FindingSeverityCounts;
  by_comparison: Record<string, FindingSeverityCounts>;
}

export interface EventCardCodegen {
  /** `datalayer` + `gtm_template` (D-63: was the flat dataLayer push before T-4-17). */
  gtm: string;
  /** New Web SDK, `bloomreach.track(event, payload)` (D-63). */
  web_sdk: string;
  tracking_api: string;
  /** D-63 (T-4-17), additive; empty string when not applicable for the event's implementation method. */
  datalayer?: string;
  gtm_template?: string;
  web_sdk_legacy?: string;
  sdk_emits?: string;
  sdk_default_properties?: string;
  /** One line on why some tabs are absent (`server_api`, `sdk_auto`). */
  note?: string;
}

export interface EventCard {
  id: string;
  name: string;
  business_name: string | null;
  class: EventClass;
  /** D-63 (T-4-17), additive (optional in the type so older documents and fixtures stay valid; the
   * builder always sets it): how the event reaches Bloomreach. Absent means `client_web`. */
  implementation_method?: ImplementationMethod;
  /** D-63: the site's dataLayer event carrying this Bloomreach event, `null` when not recorded. */
  dl_event_name?: string | null;
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
  /** D-50 (T-4-03): trigger screenshots/descriptions, ordered as stored (`Event.triggers_json`).
   * Additive, no version bump; kept in the public projection (`toPublicTrackingDocument`) so the
   * shared view can render them. */
  triggers: EventCardTrigger[];
  coverage: EventCardCoverage;
  rules: EventCardRule[];
  derived_metrics: unknown;
  not_suitable_for: string | null;
  use_cases: EventCardUseCase[];
  freshness: EventCardFreshness;
  quality: EventCardQuality;
  /** ERROR 1 fix round (D-40 Q9): every currently-open finding for this event, across every
   * comparison and every severity, uncapped -- not just the `quality` counts. */
  findings: EventCardFinding[];
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

/** D-58: one named meaning of a property (`property_definitions`). */
export interface TrackingDocumentPropertyDefinition {
  id: string;
  name: string;
  description: string | null;
  allowed_values: EventCardAllowedValue[] | null;
  formats: string[];
  example_values: unknown;
}

export interface TrackingDocumentCustomerProperty {
  property_id: string;
  name: string;
  data_type: string;
  data_formats: string[];
  bloomreach_customer_property: string | null;
  pii: boolean;
  description: string | null;
  /** D-58: every definition this property carries (additive; a property with one definition looks
   * as today -- one row named `general`). */
  definitions: TrackingDocumentPropertyDefinition[];
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
  /** D-49, T-4-04: additive -- the requirement's own id, so the shared view's `CommentsPanel` (and
   * any other consumer) can anchor a comment to this row without a second lookup. */
  id: string;
  target_label: string;
  level: string;
  status: string | null;
}

export interface TrackingDocumentUseCase {
  /** D-49, T-4-04: additive -- the use case's own id, same reason as `TrackingDocumentRequirement.id`. */
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  status: string | null;
  narrative: string | null;
  requirements: TrackingDocumentRequirement[];
  /** D-59 amendment 1: additive -- external documentation link. `internal_notes`/`internal_url` are deliberately never included here (D-59 amendment 2). */
  documentation_url: string | null;
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
  /** Every currently-open finding whose `event_id` is `null` or does not resolve to an event in
   * `events[]` above (fix round 2, D-40 Q9 follow-up): a cross-event finding (e.g.
   * `shape_inconsistent`, computed across every event observing a property) or a project/consent-
   * level finding (e.g. a `mapping_vs_observations` rename with no single owning event) has nowhere
   * else to live in this document -- without this array it was silently absent from `events[]`
   * while still counted in `findings_summary`, so `sum(events[].findings.length)` could not be
   * reconciled against `findings_summary.open`. Same row shape and same sort as
   * `EventCard.findings`. Invariant: `sum(events[].findings.length) + unattached_findings.length ===
   * findings_summary.open`, and no finding id appears in both places. */
  unattached_findings: EventCardFinding[];
  limits: TrackingDocumentLimits;
}

export type { EventClass, FindingSeverity };
