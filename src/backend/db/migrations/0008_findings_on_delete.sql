-- T-1-09: `0001_core.sql` created `findings.observation_id` and `findings.qa_run_id` with no
-- explicit ON DELETE action (SQLite default: NO ACTION, which blocks the delete once
-- `foreign_keys = ON`, per `db/index.ts`). Findings are recomputed by `runComparison` over all
-- non-archived runs and observations (D-21), so:
--   * `observation_id` (first evidence, informational) -> SET NULL: a finding must survive its
--     evidence observation being removed (e.g. a stale run's observations dropped later), it just
--     loses the pointer to which observation first showed it.
--   * `qa_run_id` -> CASCADE: this column exists on Finding only for filtering/attribution
--     (comparison 3's findings are project-wide, not run-scoped); when the run that produced a
--     finding is gone there is nothing left to recompute it from, so it goes with the run rather
--     than being left dangling with a `NO ACTION` block on every future run delete.
-- SQLite cannot ALTER a foreign key in place, so the table is rebuilt (same pattern as
-- 0003_unique_soft_delete.sql).

CREATE TABLE findings_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comparison TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  observation_id TEXT REFERENCES observations(id) ON DELETE SET NULL,
  qa_run_id TEXT REFERENCES qa_runs(id) ON DELETE CASCADE,
  expected_json TEXT,
  actual_json TEXT,
  message TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (project_id, fingerprint)
);

INSERT INTO findings_new SELECT * FROM findings;

DROP TABLE findings;
ALTER TABLE findings_new RENAME TO findings;

CREATE INDEX idx_findings_project_id ON findings(project_id);
CREATE INDEX idx_findings_event_id ON findings(event_id);
CREATE INDEX idx_findings_status ON findings(status);
