-- T-1-07 fix round WARNING 4: `use_cases.UNIQUE(project_id, code)` in 0001_core.sql was a plain
-- inline table constraint, so it applied to *every* row including soft-deleted ones — the same
-- class of bug 0003_unique_soft_delete.sql fixed for projects/events/properties/property_bundles.
-- `use-case.dal.ts`'s own pre-check (`nextUseCaseCode`) already skips deleted codes when picking
-- the next free `UC-<n>`, but a human-chosen code (or an agent re-creating the same `UC-<n>` on
-- purpose) hit the real constraint after a delete-then-recreate and surfaced as a raw 409 with no
-- visible use case holding the code. Same rebuild pattern as 0003 (SQLite has no
-- `ALTER TABLE ... DROP CONSTRAINT`): create the table without the inline UNIQUE, copy the data,
-- drop the old table, rename the new one back, then add a partial `UNIQUE INDEX ...
-- WHERE deleted_at IS NULL`. `db/index.ts` disables `foreign_keys` for the whole migration run and
-- runs `PRAGMA foreign_key_check` right after committing (`ALTER TABLE ... RENAME TO` updates
-- `requirements.use_case_id`'s FK definition automatically), so this file does not need to (and
-- must not) touch the pragma itself.

CREATE TABLE use_cases_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES use_case_templates(id),
  code TEXT,
  name TEXT NOT NULL,
  type TEXT,
  description TEXT,
  priority TEXT,
  status TEXT,
  owner TEXT,
  notes TEXT,
  narrative TEXT,
  narrative_generated_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO use_cases_new (
  id, project_id, template_id, code, name, type, description, priority, status, owner, notes,
  narrative, narrative_generated_at, sort_order, created_at, updated_at, deleted_at
)
SELECT
  id, project_id, template_id, code, name, type, description, priority, status, owner, notes,
  narrative, narrative_generated_at, sort_order, created_at, updated_at, deleted_at
FROM use_cases;

DROP TABLE use_cases;
ALTER TABLE use_cases_new RENAME TO use_cases;

CREATE INDEX idx_use_cases_project_id ON use_cases(project_id);
CREATE UNIQUE INDEX uq_use_cases_project_code ON use_cases(project_id, code) WHERE deleted_at IS NULL AND code IS NOT NULL;
