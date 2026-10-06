/**
 * CSV export contract (D-46, T-3-03, capability 9, qa-roundtrip scenario 6). One row of header
 * names per entity, declared once here so the export service, the route and the Settings page
 * export block can never drift from each other or from the plan's CSV header table
 * (`.claude/team/reports/PLAN-PHASE3-4-2026-09-27.md` "CSV export per entity").
 *
 * Conventions (D-46): ids sit alongside names so files join in a spreadsheet; JSON columns are
 * exported as compact JSON strings (never re-shaped into extra CSV columns); booleans render as
 * `true`/`false`; timestamps stay ISO strings. Export only -- there is no CSV import (D-01).
 *
 * `use_cases` carries `activation`/`assets_json` ahead of the columns actually existing (D-56 adds
 * them in phase 4): the header list is the stable contract from this task on, and the export
 * service emits empty values for both until then.
 *
 * `change_log`/`comments` are declared here too (T-3-01/T-4-02 add their tables): the CSV route
 * list is complete from this task on. Both tables exist from their own task onward, so both exports
 * carry real rows (`csvExport.service.ts#buildChangeLogRows`/`buildCommentsRows`).
 */

export interface CsvEntityDefinition {
  headers: readonly string[];
}

export const CSV_ENTITIES = {
  events: {
    headers: [
      'id',
      'name',
      'business_name',
      'class',
      'implementation_method',
      'dl_event_name',
      'identifiers_json',
      'category',
      'status',
      'certified',
      'priority',
      'description',
      'purpose',
      'page',
      'trigger_text',
      'grain',
      'identity_note',
      'owner_business',
      'owner_technical',
      'expiration_json',
      'not_suitable_for',
      'agent_instructions',
      'derived_metrics_json',
      'tags_json',
      'property_count',
      'variant_count',
      'created_at',
      'updated_at',
    ],
  },
  properties: {
    headers: [
      'id',
      'scope',
      'name',
      'category',
      'property_category',
      'category_override',
      'description',
      'data_type',
      'data_formats_json',
      'pii',
      'property_type',
      'allowed_values_json',
      'example_values_json',
      'item_schema_json',
      'kind',
      'derivation_json',
      'bloomreach_customer_property',
      'priority',
      'status',
      'notes',
      'created_at',
      'updated_at',
    ],
  },
  event_properties: {
    headers: [
      'event_id',
      'event_name',
      'property_id',
      'property_name',
      'role',
      'required',
      'payload_key',
      'priority',
      'status',
      'source_id',
      'source_name',
      'definition_id',
      'definition_name',
      'sort_order',
    ],
  },
  // D-58 (0021_property_definitions.sql): one or more named meanings per property.
  property_definitions: {
    headers: [
      'id',
      'property_id',
      'property_name',
      'name',
      'description',
      'allowed_values_json',
      'formats_json',
      'example_values_json',
      'using_events',
    ],
  },
  variants: {
    headers: [
      'id',
      'event_id',
      'event_name',
      'name',
      'description',
      'conditions_json',
      'conditions_text',
      'expiration_json',
      'standard_event',
    ],
  },
  standard_event_mappings: {
    headers: ['id', 'standard_event', 'event_id', 'event_name', 'variant_id', 'variant_name', 'field_map_json'],
  },
  identity_rules: {
    headers: [
      'id',
      'identifier_name',
      'identity_type',
      'name',
      'description',
      'sdk_call',
      'transformations_json',
      'trigger_event_id',
      'trigger_event_name',
      'trigger_text',
      'value_rule',
      'example',
      'owner',
      'source_name',
      'tracker',
      'priority',
      'status',
      'sort_order',
    ],
  },
  catalogs: {
    headers: [
      'id',
      'name',
      'description',
      'mapping_role',
      'client_name',
      'purpose',
      'catalog_type',
      'owner',
      'source_system',
      'sync_method',
      'update_frequency',
      'priority',
      'status',
      // D-61 (T-4-11B)
      'kind',
      'market',
      'language',
      'version',
      'live_at',
    ],
  },
  // D-62 (T-4-11B): the project's sources; `is_default` marks the project default source.
  sources: {
    headers: ['id', 'name', 'system', 'method', 'color', 'is_default'],
  },
  catalog_fields: {
    headers: [
      'id',
      'catalog_id',
      'catalog_name',
      'name',
      'description',
      'data_type',
      'is_lookup_key',
      'is_searchable',
      'is_required',
      'client_field_name',
      'bloomreach_column',
      'purpose',
      'field_family',
      'item_level',
      'priority',
      'status',
    ],
  },
  consent_categories: {
    headers: ['id', 'name', 'description', 'standard_key', 'status', 'sort_order'],
  },
  use_cases: {
    headers: [
      'id',
      'code',
      'name',
      'type',
      'description',
      'priority',
      'status',
      'owner',
      'notes',
      'template_id',
      'template_code',
      'requirement_count',
      'narrative',
      // D-56: use_cases gains activation/assets_json in phase 4 (T-4-06). The header stays stable
      // from this task on; the export service emits '' / '[]' until the columns exist.
      'activation',
      'assets_json',
      // D-59 amendment 2: internal-only notes/link, never in the tracking document or HTML export.
      'internal_notes',
      'internal_url',
    ],
  },
  requirements: {
    headers: [
      'id',
      'use_case_id',
      'use_case_code',
      'use_case_name',
      'sort_order',
      'target_kind',
      'target_label',
      'event_name',
      'variant_name',
      'property_name',
      'level',
      'status',
      'note',
    ],
  },
  rules: {
    headers: [
      'id',
      'event_id',
      'event_name',
      'variant_name',
      'kind',
      'name',
      'message',
      'expression_text',
      'tolerance_mode',
      'tolerance_value',
      'report_kind',
      'severity',
      'enabled',
      'version',
    ],
  },
  qa_runs: {
    headers: [
      'id',
      'kind',
      'actor',
      'environment',
      'started_at',
      'finished_at',
      'archived',
      'customer_id',
      'observation_count',
      'notes',
    ],
  },
  observations: {
    headers: [
      'id',
      'qa_run_id',
      'source',
      'event_type',
      'event_name',
      'variant_name',
      'timestamp',
      // Pre-QA fix (LOW 3, reviewer 23:22): `timestamp` stays the raw epoch-seconds value so it
      // still joins with the Bloomreach customer-events export; `timestamp_iso` adds the
      // human-readable form right next to it (empty when `timestamp` is null).
      'timestamp_iso',
      'page_url',
      'properties_json',
      'context_values_json',
      'captured_at',
    ],
  },
  findings: {
    headers: [
      'id',
      'comparison',
      'kind',
      'severity',
      'status',
      'event_name',
      'variant_name',
      'property_name',
      'message',
      'expected_json',
      'actual_json',
      'first_seen_at',
      'last_seen_at',
      'resolved_at',
      'resolved_by',
    ],
  },
  // T-3-01 (0015_change_log.sql) adds the table this reads from; until then the export is
  // headers-only (see `csvExport.service.ts`).
  change_log: {
    headers: ['id', 'changed_at', 'actor', 'source', 'batch_id', 'entity_type', 'entity_id', 'entity_label', 'action', 'diff_json'],
  },
  // T-4-02 (0019_comments.sql) adds the table this reads from (`csvExport.service.ts#buildCommentRows`).
  comments: {
    headers: ['id', 'entity_type', 'entity_id', 'entity_label', 'author_name', 'via_share', 'internal_only', 'body', 'created_at', 'resolved_at', 'resolved_by'],
  },
} as const satisfies Record<string, CsvEntityDefinition>;

export type CsvEntity = keyof typeof CSV_ENTITIES;

export const CSV_ENTITY_NAMES = Object.keys(CSV_ENTITIES) as CsvEntity[];

export function isCsvEntity(value: string): value is CsvEntity {
  return Object.prototype.hasOwnProperty.call(CSV_ENTITIES, value);
}

export function csvHeadersFor(entity: CsvEntity): readonly string[] {
  return CSV_ENTITIES[entity].headers;
}
