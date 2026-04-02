/**
 * Phase 1 Core Data Foundation — strict schema types for DB/API.
 * Aligns with docs/DATA_SCHEMA_AND_ARCHITECTURE_PLAN.md.
 * Use for API DTOs, DB row types, and validation. No UI coupling.
 */

// ----- Enums (match DB) -----

export type PropertyContext = 'event_property' | 'user_property' | 'system_property';

export const PROPERTY_CONTEXTS: PropertyContext[] = [
  'event_property',
  'user_property',
  'system_property',
];

export type PropertyDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'object'
  | 'array';

export const PROPERTY_DATA_TYPES: PropertyDataType[] = [
  'string',
  'number',
  'boolean',
  'timestamp',
  'object',
  'array',
];

export type PropertyDataFormat =
  | 'uuid'
  | 'iso8601_datetime'
  | 'iso8601_date'
  | 'unix_seconds'
  | 'unix_milliseconds'
  | 'email'
  | 'uri'
  | 'currency_code'
  | 'country_code'
  | 'language_code';

export const PROPERTY_DATA_FORMATS: PropertyDataFormat[] = [
  'uuid',
  'iso8601_datetime',
  'iso8601_date',
  'unix_seconds',
  'unix_milliseconds',
  'email',
  'uri',
  'currency_code',
  'country_code',
  'language_code',
];

export type EventPropertyPresence = 'always_sent' | 'sometimes_sent' | 'never_sent';

export type EventType = 'track' | 'page' | 'identify';

export const EVENT_TYPES: EventType[] = ['track', 'page', 'identify'];

/** Codegen output-only event name overrides per method (canonical `events.name` unchanged). */
export type CodegenEventNameOverrides = {
  dataLayer?: string | null;
  bloomreachSdk?: string | null;
  bloomreachApi?: string | null;
};

export type MetricAggregationType = 'count' | 'sum' | 'avg';

export const METRIC_AGGREGATION_TYPES: MetricAggregationType[] = [
  'count',
  'sum',
  'avg',
];

export type QARunStatus = 'pass' | 'fail';

/** How a property relates to a catalog field: lookup key (event value joins to catalog) or mapped value (event value is the catalog field value). */
export type PropertyMappingType = 'lookup_key' | 'mapped_value';

// ----- Catalogs & Data Governance -----

/** Catalog classification: Product, Variant (e.g. SKU), or General lookup table. */
export type CatalogType = 'Product' | 'Variant' | 'General';

export const CATALOG_TYPES: CatalogType[] = ['Product', 'Variant', 'General'];

export type CatalogFieldDataType = 'string' | 'number' | 'boolean';

export const CATALOG_FIELD_DATA_TYPES: CatalogFieldDataType[] = [
  'string',
  'number',
  'boolean',
];

export type CatalogFieldFamily = 'system' | 'custom';

export const CATALOG_FIELD_FAMILIES: CatalogFieldFamily[] = ['system', 'custom'];

export type CatalogFieldItemLevel = 'parent' | 'variant' | 'general';

export const CATALOG_FIELD_ITEM_LEVELS: CatalogFieldItemLevel[] = [
  'parent',
  'variant',
  'general',
];

export type CatalogFieldSourceMappingType = 'json_field' | 'json_path' | 'alias';

export const CATALOG_FIELD_SOURCE_MAPPING_TYPES: CatalogFieldSourceMappingType[] = [
  'json_field',
  'json_path',
  'alias',
];

export interface CatalogFieldSourceMapping {
  mapping_type: CatalogFieldSourceMappingType;
  source_value: string;
}

export interface CatalogRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  owner: string;
  source_system: string;
  sync_method: string;
  update_frequency: string;
  catalog_type: CatalogType;
  created_at: string;
  updated_at: string;
}

export interface CatalogFieldRow {
  id: string;
  catalog_id: string;
  name: string;
  description: string | null;
  data_type: CatalogFieldDataType;
  is_lookup_key: boolean;
  field_family: CatalogFieldFamily;
  item_level: CatalogFieldItemLevel;
  source_mapping_json: CatalogFieldSourceMapping | null;
  created_at: string;
  updated_at: string;
}

// ----- Workspace audit rules (stored in workspace_settings.audit_rules_json) -----

export type NamingConvention =
  | 'snake_case'
  | 'camelCase'
  | 'PascalCase'
  | 'Title Case'
  | 'Sentence case';

export interface WorkspaceAuditRules {
  eventNaming: NamingConvention;
  propertyNaming: NamingConvention;
  forbiddenWords?: string[];
  requireEventDescription?: boolean;
  requirePropertyDescription?: boolean;
  requireAuditPassForMerge?: boolean;
}

// ----- Core entities (all workspace-scoped; soft delete where noted) -----

export type WorkspaceMemberRole = 'admin' | 'member' | 'viewer';

export interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  /** URL-safe public key used in /w/<workspace_key>/... paths. */
  workspace_key: string;
  created_at: string; // ISO
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkspaceSettingsRow {
  workspace_id: string;
  audit_rules_json: string; // JSON string of WorkspaceAuditRules
  client_primary_color: string | null;
  client_name: string | null;
  client_logo_url: string | null;
  /** Bloomreach Tracking API customer_ids key (default: "registered"). */
  bloomreach_api_customer_id_key: string | null;
  /** Public hub token; null = stakeholder hub link disabled. */
  journeys_share_hub_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PropertyRow {
  id: string;
  workspace_id: string;
  context: PropertyContext;
  name: string;
  description: string | null;
  category: string | null;
  pii: boolean;
  data_type: PropertyDataType;
  data_formats: PropertyDataFormat[] | null;
  value_schema_json: PropertyValueSchema | null;
  /**
   * When `data_type` is `object`: maps keys in `value_schema_json.properties` to existing
   * workspace property ids (canonical registry). Used only for nested docs/export/codegen.
   */
  object_child_property_refs_json: Record<string, string> | null;
  example_values_json: PropertyExampleValue[] | null;
  name_mappings_json: PropertyNameMapping[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Optional catalog mapping: which catalog/field this property maps to. */
  mapped_catalog_id: string | null;
  mapped_catalog_field_id: string | null;
  mapping_type: PropertyMappingType | null;
}

/** Payload for creating a property (DAL/API). id, workspace_id, timestamps set by DB or DAL. */
export type CreatePropertyInput = Pick<
  PropertyRow,
  | 'context'
  | 'name'
  | 'description'
  | 'category'
  | 'pii'
  | 'data_type'
  | 'data_formats'
  | 'value_schema_json'
  | 'object_child_property_refs_json'
  | 'example_values_json'
  | 'name_mappings_json'
  | 'mapped_catalog_id'
  | 'mapped_catalog_field_id'
  | 'mapping_type'
> & {
  /**
   * Optional workspace source ids to link via property_sources after the property row exists.
   * On create: omit or null or [] → no links. On PATCH: include `source_ids` to replace links; [] clears all.
   * Not for event-scoped variants—only workspace sources validated against `sources.workspace_id`.
   */
  source_ids?: string[] | null;
};

export interface PropertySourceRow {
  property_id: string;
  source_id: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  event_type: EventType | null;
  owner_team_id: string | null;
  categories: string[] | null;
  tags: string[] | null;
  /**
   * Computed (not stored on events): how many non-deleted journeys in this workspace reference this event.
   * Present in list/detail API responses to support safe delete UX.
   */
  used_in_journeys_count?: number;
  /**
   * Canonical structured trigger entries for the event.
   * Stored durably in the backend.
   */
  triggers: EventTriggerEntry[] | null;
  /** Codegen snippet output names per method; does not change canonical `name`. */
  codegen_event_name_overrides: CodegenEventNameOverrides | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EventTriggerEntry {
  title: string;
  description: string;
  image?: string | null;
  source?: string | null;
  order: number;
}

/** Payload for creating/updating an event (DAL/API). */
export interface CreateEventInput {
  name: string;
  description?: string | null;
  purpose?: string | null;
  event_type?: EventType | null;
  owner_team_id?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  triggers?: EventTriggerEntry[] | null;
  source_ids?: string[] | null;
  codegen_event_name_overrides?: CodegenEventNameOverrides | null;
}

export interface EventSourceRow {
  event_id: string;
  source_id: string;
  created_at: string;
}

export interface MetricRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  owner_team_id: string | null;
  aggregation_type: MetricAggregationType;
  primary_event_id: string;
  measurement_property_id: string | null;
  filter_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateMetricInput {
  name: string;
  description?: string | null;
  owner_team_id?: string | null;
  aggregation_type: MetricAggregationType;
  primary_event_id: string;
  measurement_property_id?: string | null;
  filter_json?: Record<string, unknown> | null;
}

export interface EventPropertyRow {
  event_id: string;
  property_id: string;
  presence: EventPropertyPresence;
  created_at: string;
  updated_at: string;
}

/**
 * Event variant v1 — child of a base event; overrides_json is delta vs base event_properties + definitions.
 */
export type EventVariantOverridesV1 = {
  properties?: Record<
    string,
    {
      presence?: EventPropertyPresence | null;
      required?: boolean | null;
      /** When true, property is omitted from effective trigger schema for this variant. */
      excluded?: boolean;
      description?: string | null;
      example_values?: unknown | null;
      enum_values?: string[] | null;
    }
  >;
};

export interface EventVariantRow {
  id: string;
  workspace_id: string;
  base_event_id: string;
  name: string;
  description: string | null;
  overrides_json: EventVariantOverridesV1;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Lightweight variant row for event lists and trigger picker. */
export interface EventVariantSummary {
  id: string;
  base_event_id: string;
  name: string;
  description: string | null;
}

/**
 * Per-event overrides for a workspace property (same `property_id` on many events, different semantics).
 *
 * Why not `PropertyContext` or extra `properties` rows? Context classifies event vs user vs system definitions
 * globally; it must not be misused as a per-event “variant” axis. Duplicating `properties` would split identity
 * and break reuse. This table is the correct join: (event_id, property_id) → scoped meaning only.
 *
 * Canonical name/type/global rules remain on `properties`; this layer is optional metadata.
 */
export interface EventPropertyDefinitionRow {
  id: string;
  workspace_id: string;
  event_id: string;
  property_id: string;
  description_override: string | null;
  enum_values: string[] | null;
  required: boolean | null;
  example_values: unknown | null;
  created_at: string;
  updated_at: string;
}

/** Payload for upserting one event–property definition (batch PUT). Omitted keys preserve existing values on update. */
export type EventPropertyDefinitionUpsertPayload = {
  property_id: string;
  description_override?: string | null;
  enum_values?: string[] | null;
  required?: boolean | null;
  example_values?: unknown | null;
};

/**
 * Read model: global `PropertyRow` + optional `event_property_definitions` override merged in memory only.
 *
 * Precedence: for each overridable field, a non-null value on the override row wins; null on the override means
 * “inherit from global” for description and example_values. `enum_values` and `required` exist only on the override
 * table—when the override row is missing or the field is null, effective_enum_values / effective_required stay null
 * (there is no global enum list on `properties`).
 */
export interface EffectiveEventPropertyDefinition {
  property_id: string;
  event_id: string;
  /** Canonical workspace property (not mutated). */
  property: Pick<
    PropertyRow,
    | 'id'
    | 'name'
    | 'context'
    | 'description'
    | 'category'
    | 'data_type'
    | 'data_formats'
    | 'pii'
    | 'value_schema_json'
    | 'object_child_property_refs_json'
    | 'example_values_json'
  >;
  /** Stored override row, if any. */
  override: EventPropertyDefinitionRow | null;
  /** Merged view for consumers (not persisted). */
  effective: {
    description: string | null;
    enum_values: string[] | null;
    required: boolean | null;
    example_values: unknown | null;
  };
  /** From event_properties when the property is attached to this event. */
  presence: EventPropertyPresence | null;
  /** Non-blocking hints (e.g. override without event_properties link). */
  warnings: string[];
}

export interface JourneyRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  developer_instructions_markdown: string | null;
  /** React Flow nodes (JSON). Persisted on Save Layout. Null until first save. */
  canvas_nodes_json: unknown | null;
  /** React Flow edges (JSON). Persisted on Save Layout. Null until first save. */
  canvas_edges_json: unknown | null;
  /**
   * Explicit order for journeyStepNode ids (docs/export source of truth).
   * When null/empty, consumers should fall back to the current canvas_nodes_json step-node order.
   */
  step_order_json?: string[] | null;
  /** Global testing instructions for AI/human testers. */
  testing_instructions_markdown: string | null;
  /** Preferred existing codegen method in trigger/docs context. */
  codegen_preferred_style: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
  /** Public UUID for read-only share link. Null until generated. */
  share_token: string | null;
  /** Counts of step implementation types: new, enrichment, fix. Updated on canvas save. */
  type_counts: { new?: number; enrichment?: number; fix?: number } | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JourneyEventRow {
  journey_id: string;
  event_id: string;
  sort_order: number;
  created_at: string;
}

export interface QARunRow {
  id: string;
  journey_id: string;
  status: QARunStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface QARunEvidenceRow {
  id: string;
  qa_run_id: string;
  image_url: string; // Supabase Storage public URL
  sort_order: number;
  created_at: string;
}

export interface QARunPayloadRow {
  id: string;
  qa_run_id: string;
  node_id: string;
  expected_json: string; // valid JSON
  actual_json: string;   // valid JSON
  created_at: string;
}

export interface PropertyValueSchemaNode {
  type: PropertyDataType;
  data_formats?: PropertyDataFormat[];
  required?: boolean;
  /** Contextual presence hint for nested object field attachments (not a canonical event attachment). */
  presence?: EventPropertyPresence;
  properties?: Record<string, PropertyValueSchemaNode>;
  items?: PropertyValueSchemaNode;
  allow_additional_properties?: boolean;
}

export interface PropertyValueSchema {
  type: 'object' | 'array';
  properties?: Record<string, PropertyValueSchemaNode>;
  items?: PropertyValueSchemaNode;
  allow_additional_properties?: boolean;
}

/**
 * Resolved nested field for a parent object property (docs/export/codegen). Children remain
 * canonical `PropertyRow` entities; this is a read-only snapshot for rendering.
 */
export interface ObjectChildFieldSnapshot {
  property_id: string;
  property_name: string;
  property_description?: string | null;
  property_data_type?: PropertyDataType | null;
  property_data_formats?: PropertyDataFormat[] | null;
  property_example_values_json?: PropertyExampleValue[] | null;
  property_value_schema_json?: PropertyValueSchema | null;
  property_object_child_property_refs_json?: Record<string, string> | null;
  object_child_snapshots_by_field?: Record<string, ObjectChildFieldSnapshot> | null;
  /** Referenced property row was deleted or not in workspace. */
  missing?: boolean;
  /** Stopped recursion to avoid a cycle in object ref graph. */
  cycle_break?: boolean;
}

export interface PropertyExampleValue {
  value: unknown;
  label?: string;
  notes?: string;
}

export type PropertyNameMappingRole =
  | 'payload_key'
  | 'source_field'
  | 'lookup_key'
  | 'mapped_value'
  | 'alias';

export const PROPERTY_NAME_MAPPING_ROLES: PropertyNameMappingRole[] = [
  'payload_key',
  'source_field',
  'lookup_key',
  'mapped_value',
  'alias',
];

export interface PropertyNameMapping {
  system: string;
  name: string;
  role: PropertyNameMappingRole;
  notes?: string;
}
