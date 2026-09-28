/**
 * Legacy schema types still imported by the codegen/document/export services (T-3-08 dead-code
 * sweep reduced this file to exactly the exports with a live importer, grep-proven: everything
 * else in the original Phase 1 schema draft — the pre-D-15 multi-tenant scope row and its member
 * role type, `NamingConvention`, `PropertyContext`/`PROPERTY_CONTEXTS`, `EventType`/`EVENT_TYPES`,
 * `PropertyNameMapping*`, `PropertyRow`/`EventRow`/`SourceRow`/bundle rows, the catalog row/enum
 * types — was replaced by the real DAL row types (`src/backend/dal/*.dal.ts`) and
 * `src/domain/enums.ts` during phase 1 and had no remaining importer). New code should keep
 * importing enums from `src/domain/enums.ts` directly (see the `domain-model` skill).
 */

import type { PropertyDataType, PropertyDataFormat } from '../domain/enums';

/** Codegen output-only event name overrides per method (canonical `events.name` unchanged). */
export type CodegenEventNameOverrides = {
  dataLayer?: string | null;
  bloomreachSdk?: string | null;
  bloomreachApi?: string | null;
};

export interface PropertyValueSchemaNode {
  type: PropertyDataType;
  data_formats?: PropertyDataFormat[];
  required?: boolean;
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
  /** Referenced property row was deleted or not in the project. */
  missing?: boolean;
  /** Stopped recursion to avoid a cycle in object ref graph. */
  cycle_break?: boolean;
}

export interface PropertyExampleValue {
  value: unknown;
  label?: string;
  notes?: string;
}
