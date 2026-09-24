/**
 * Single source of truth for every closed enum used across the domain model, the SQLite
 * schema, the API and the UI. Nothing above this module may hardcode an allowed-value list;
 * import from here instead (see the `domain-model` skill).
 *
 * Pattern: `as const` array is the source; the union type is derived from it
 * (`(typeof X)[number]`). This mirrors the type+array pattern already used in
 * `src/types/schema.ts` but derives the type from the array so the two can never drift.
 *
 * Bloomreach-specific vocabularies (standard events, consents, system event types) are
 * extensible per project and live in `src/domain/bloomreach.ts`, not here (D-26).
 */

// ----- Priority (D-25 Q1) -----
// Used by Property, Event, IdentityRule, Requirement, UseCase.
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

// ----- Event manual status (D-25 Q2) -----
// `certified` is a derived, computed value (D-05) and is never stored here.
export const EVENT_STATUSES = ['planned', 'in_review', 'implemented', 'ignored'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// ----- Generic entity status -----
// Used by Property, EventProperty, IdentityRule, Catalog, CatalogField, ConsentCategory:
// simpler lifecycle than Event (no in_review step).
export const ENTITY_STATUSES = ['planned', 'implemented', 'ignored'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

// ----- Property scope (D-24) -----
// Replaces the old PropertyContext; CustomerProperty is scope `customer`.
export const PROPERTY_SCOPES = ['event', 'customer'] as const;
export type PropertyScope = (typeof PROPERTY_SCOPES)[number];

// ----- Origin type -----
// Shared by Event.event_type and Property.property_type: whether the entity was
// custom-defined by the client or is a known Bloomreach system entity.
export const ORIGIN_TYPES = ['custom', 'system'] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];

// ----- EventProperty role (D-03, D-16) -----
export const EVENT_PROPERTY_ROLES = ['normal', 'discriminator', 'context'] as const;
export type EventPropertyRole = (typeof EVENT_PROPERTY_ROLES)[number];

// ----- Requirement level and target kind -----
export const REQUIREMENT_LEVELS = ['R', 'O'] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export const REQUIREMENT_TARGET_KINDS = [
  'customer_property',
  'event',
  'variant',
  'event_property',
  'variant_property',
] as const;
export type RequirementTargetKind = (typeof REQUIREMENT_TARGET_KINDS)[number];

// ----- Variant condition operator (D-03) -----
export const VARIANT_OPERATORS = ['equals', 'in'] as const;
export type VariantOperator = (typeof VARIANT_OPERATORS)[number];

// ----- Expiration units -----
export const EXPIRATION_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type ExpirationUnit = (typeof EXPIRATION_UNITS)[number];

// ----- QaRun kind -----
export const QA_RUN_KINDS = ['export_paste', 'agent_session', 'manual'] as const;
export type QaRunKind = (typeof QA_RUN_KINDS)[number];

// ----- Comparison id -----
export const COMPARISON_IDS = [
  'definition_vs_mapping',
  'mapping_vs_observations',
  'definition_vs_observations',
] as const;
export type ComparisonId = (typeof COMPARISON_IDS)[number];

// ----- Finding kind (D-21) -----
// The twelve kinds from the qa-roundtrip skill plus three additions from D-21.
export const FINDING_KINDS = [
  'missing_required',
  'type_mismatch',
  'format_violation',
  'enum_violation',
  'unknown_variant',
  'shape_inconsistent',
  'rename_mismatch',
  'unmapped_standard_event',
  'unmapped_property',
  'expiration_mismatch',
  'rounding_drift',
  'unexpected_property',
  'missing_event',
  'unexpected_event',
  'unmapped_catalog',
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

// ----- Finding severity -----
export const FINDING_SEVERITIES = ['error', 'warning', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

// ----- Finding status -----
// No manual "mute": resolved only by `runComparison` no longer producing the fingerprint (D-21).
export const FINDING_STATUSES = ['open', 'resolved'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
