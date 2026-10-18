CREATE TABLE decision_source_captures (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, decision_id TEXT NOT NULL,
 source_key TEXT NOT NULL, capture_hash TEXT NOT NULL, preview_hash TEXT NOT NULL,
 source_package_hash TEXT NOT NULL, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
 baseline_id TEXT, complete INTEGER NOT NULL CHECK(complete IN (0,1)),
 inherited INTEGER NOT NULL DEFAULT 0 CHECK(inherited IN (0,1)),
 changed INTEGER NOT NULL CHECK(changed IN (0,1)), followup_decision_id TEXT, created_at TEXT NOT NULL,
 UNIQUE(project_id,decision_id,source_key,capture_hash), UNIQUE(project_id,decision_id,id),
 FOREIGN KEY(project_id,decision_id) REFERENCES decision_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,decision_id,baseline_id) REFERENCES decision_source_captures(project_id,decision_id,id)
);
CREATE INDEX decision_source_captures_scope ON decision_source_captures(project_id,decision_id,source_key);
