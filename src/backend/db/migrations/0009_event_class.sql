-- T-2-01 (D-29, D-36): replaces `events.event_type custom|system` with `events.class
-- custom|sdk|platform` (`src/domain/enums.ts`'s `EVENT_CLASSES`). `system` rows created by the
-- expiration import become `sdk` when their `name` is one of `SDK_EVENT_TYPES`
-- (`src/domain/bloomreach.ts`), else `platform`; `custom` rows stay `custom`. D-02 forbids a
-- compatibility shim, so `event_type` is dropped outright rather than kept alongside `class`.
-- SQLite has no `ALTER TABLE ... DROP COLUMN` with a NOT NULL/inline default in older versions
-- and this repo already uses the table-rebuild pattern for column-shape changes
-- (`0003_unique_soft_delete.sql`), so the same rebuild is used here: create `events_new` with
-- `class` instead of `event_type`, backfill `class` from `event_type` and `name` while copying,
-- drop `events`, rename back. `ALTER TABLE ... RENAME TO` updates every other table's FK
-- definitions automatically (see `0003_unique_soft_delete.sql`'s header comment), so
-- `event_properties`, `event_sources`, `variants`, `standard_event_mappings`, `findings`,
-- `observations`, `requirements`, etc. keep working unchanged. `db/index.ts` disables
-- `foreign_keys` for the whole migration run and runs `PRAGMA foreign_key_check` right after
-- committing, so this file does not need to (and must not) touch the pragma itself.

CREATE TABLE events_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  description TEXT,
  purpose TEXT,
  page TEXT,
  trigger_text TEXT,
  grain TEXT,
  identity_note TEXT,
  triggers_json TEXT,
  class TEXT NOT NULL DEFAULT 'custom',
  owner_business TEXT,
  owner_technical TEXT,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  expiration_json TEXT,
  not_suitable_for TEXT,
  agent_instructions TEXT,
  derived_metrics_json TEXT,
  tags_json TEXT,
  codegen_event_name_overrides_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO events_new (
  id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
  identity_note, triggers_json, class, owner_business, owner_technical, priority,
  status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
  tags_json, codegen_event_name_overrides_json, created_at, updated_at, deleted_at
)
SELECT
  id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
  identity_note, triggers_json,
  CASE
    WHEN event_type != 'system' THEN 'custom'
    WHEN name IN ('session_start', 'session_end', 'first_session', 'page_visit', 'web_exit') THEN 'sdk'
    ELSE 'platform'
  END,
  owner_business, owner_technical, priority,
  status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
  tags_json, codegen_event_name_overrides_json, created_at, updated_at, deleted_at
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_project_id ON events(project_id);
CREATE UNIQUE INDEX uq_events_project_name ON events(project_id, name) WHERE deleted_at IS NULL;
