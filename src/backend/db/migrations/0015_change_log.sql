-- T-3-01 (D-44, capability 12): change_log records every definition-mutating write across the
-- app so a History panel can show "what changed, when, by whom" per entity. Written at DAL level
-- inside the same transaction as the mutation itself (src/backend/dal/change-log.dal.ts's
-- recordChange), so a write and its history row commit or roll back together; actor/source/batch
-- come from src/backend/context/actor.ts (AsyncLocalStorage), set by the Express middleware
-- (this task), the MCP wrapper and import services (both T-3-02).
--
-- Wired in T-3-01: event, event_property, property, variant. Every other entity_type in the CHECK
-- below is wired in T-3-02. Not logged (own lifecycle already covers "what changed"): qa_runs,
-- observations, findings, clients, use_case_templates.
CREATE TABLE change_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'project', 'source', 'property', 'event', 'event_property', 'variant',
    'standard_event_mapping', 'identity_rule', 'consent_category', 'catalog', 'catalog_field',
    'use_case', 'requirement', 'rule', 'property_bundle'
  )),
  -- For entity_type = 'event_property': "<event_id>:<property_id>" (composite key, D-44).
  entity_id TEXT NOT NULL,
  -- Human label at write time (e.g. "cart_update", "cart_update.total_price") so history of a
  -- since-deleted entity stays readable.
  entity_label TEXT,
  -- Groups children under their parent panel: event for event_property/variant/rule, use_case for
  -- requirement, catalog for catalog_field. NULL for a top-level entity.
  parent_entity_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  actor TEXT NOT NULL,
  -- 'ui' | 'mcp' | 'import:<format>' | 'restore' | 'system' (validated by the actor context, not
  -- a CHECK constraint, since the import-format suffix is open-ended).
  source TEXT NOT NULL,
  -- One id per import apply or restore, so the History page can group a batch's rows together.
  batch_id TEXT,
  changed_at TEXT NOT NULL,
  -- [{field, before, after}]; top-level entity fields only, created_at/updated_at/deleted_at
  -- excluded (deleted_at is already expressed by action); `create` has every field's `before:
  -- null`, `delete` has every field's `after: null`.
  diff_json TEXT
);

CREATE INDEX idx_change_log_entity ON change_log (project_id, entity_type, entity_id, changed_at DESC);
CREATE INDEX idx_change_log_parent ON change_log (project_id, parent_entity_id, changed_at DESC);
CREATE INDEX idx_change_log_project ON change_log (project_id, changed_at DESC);
