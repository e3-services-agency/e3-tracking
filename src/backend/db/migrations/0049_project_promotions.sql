CREATE TABLE project_promotions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
 source_project_id TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 source_content_hash TEXT NOT NULL,
 destination_baseline_hash TEXT NOT NULL,
 plan_hash TEXT NOT NULL,
 source_backup_json TEXT NOT NULL,
 id_map_json TEXT NOT NULL,
 counts_json TEXT NOT NULL,
 decision_bindings_json TEXT NOT NULL,
 result_hash TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER project_promotions_immutable BEFORE UPDATE ON project_promotions
BEGIN SELECT RAISE(ABORT, 'Promotion receipts are immutable'); END;
