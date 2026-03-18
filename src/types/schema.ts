/**
 * Phase 1 Core Data Foundation — strict schema types for DB/API.
 * Aligns with docs/DATA_SCHEMA_AND_ARCHITECTURE_PLAN.md.
 * Use for API DTOs, DB row types, and validation. No UI coupling.
 */

// ----- Enums (match DB) -----

export type PropertyContext = 'event_property' | 'user_property' | 'system_property';

export type PiiStatus = 'none' | 'sensitive' | 'highly_sensitive';

export type PropertyDataType = 'string' | 'integer' | 'float' | 'boolean' | 'object' | 'list';

export type EventPropertyPresence = 'always_sent' | 'sometimes_sent' | 'never_sent';

export type QARunStatus = 'pass' | 'fail';

/** How a property relates to a catalog field: lookup key (event value joins to catalog) or mapped value (event value is the catalog field value). */
export type PropertyMappingType = 'lookup_key' | 'mapped_value';

// ----- Catalogs & Data Governance -----

/** Catalog classification: Product, Variant (e.g. SKU), or General lookup table. */
export type CatalogType = 'Product' | 'Variant' | 'General';

export const CATALOG_TYPES: CatalogType[] = ['Product', 'Variant', 'General'];

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
  type: string; // 'string' | 'number' | 'boolean'
  is_lookup_key: boolean;
  created_at?: string;
  updated_at?: string;
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
  /** Short public key used in URLs (e.g. "a1B9z"). */
  workspace_key?: string | null;
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
  pii_status: PiiStatus;
  data_type: PropertyDataType;
  data_format: string | null;
  is_list: boolean;
  /** JSON array of strings */
  example_values_json: string | null;
  /** JSON array of { context: string, mapped_name: string } */
  name_mappings_json: string | null;
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
  | 'pii_status'
  | 'data_type'
  | 'data_format'
  | 'is_list'
  | 'example_values_json'
  | 'name_mappings_json'
  | 'mapped_catalog_id'
  | 'mapped_catalog_field_id'
  | 'mapping_type'
>;

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
  triggers_markdown: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Payload for creating an event (DAL/API). id, workspace_id, timestamps set by DB or DAL. */
export type CreateEventInput = Pick<
  EventRow,
  'name' | 'description' | 'triggers_markdown'
>;

export interface EventSourceRow {
  event_id: string;
  source_id: string;
  created_at: string;
}

export interface EventPropertyRow {
  event_id: string;
  property_id: string;
  presence: EventPropertyPresence;
  created_at: string;
  updated_at: string;
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
  /** Global testing instructions for AI/human testers. */
  testing_instructions_markdown: string | null;
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

// ----- Name mapping (parsed from name_mappings_json) -----

export interface PropertyNameMapping {
  context: string;
  mapped_name: string;
}
