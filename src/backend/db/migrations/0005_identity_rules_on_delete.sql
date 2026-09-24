-- T-1-06 delta: decide and set ON DELETE for identity_rules.source_id and
-- identity_rules.trigger_event_id. 0001_core.sql declared both FKs with no ON DELETE clause,
-- which is SQLite's implicit NO ACTION: deleting a referenced source or event would fail with a
-- raw SQLITE_CONSTRAINT_FOREIGNKEY error (foreign_keys is ON, see db/index.ts) instead of a clean
-- 4xx, and an identity rule is a record of an identity decision that should survive the source or
-- trigger event it named being deleted later (same reasoning as `requirements`/`findings`'
-- SET NULL columns in 0001_core.sql). SQLite has no `ALTER TABLE ... ALTER COLUMN`, so changing an
-- inline FK's ON DELETE action requires the same rebuild pattern as 0003_unique_soft_delete.sql:
-- create the table with the new FK clauses, copy the data, drop the old table, rename the new one
-- back. `db/index.ts` disables `foreign_keys` for the whole migration run and runs
-- `PRAGMA foreign_key_check` right after committing, so this file does not need to (and must not)
-- touch the pragma itself.

CREATE TABLE identity_rules_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bloomreach_field TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  trigger_text TEXT,
  value_rule TEXT,
  example TEXT,
  owner TEXT,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  tracker TEXT,
  priority TEXT,
  status TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO identity_rules_new (
  id, project_id, bloomreach_field, identity_type, name, description, trigger_event_id,
  trigger_text, value_rule, example, owner, source_id, tracker, priority, status, sort_order,
  created_at, updated_at
)
SELECT
  id, project_id, bloomreach_field, identity_type, name, description, trigger_event_id,
  trigger_text, value_rule, example, owner, source_id, tracker, priority, status, sort_order,
  created_at, updated_at
FROM identity_rules;

DROP TABLE identity_rules;
ALTER TABLE identity_rules_new RENAME TO identity_rules;

CREATE INDEX idx_identity_rules_project_id ON identity_rules(project_id);
