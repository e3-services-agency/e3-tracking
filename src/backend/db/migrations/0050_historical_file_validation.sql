-- Private raw source artifacts and immutable historical evidence. No observations or runtime findings.
CREATE TABLE historical_file_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_captured_at TEXT,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 33554432),
  file_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  UNIQUE(project_id, sha256, source_ref)
);
CREATE UNIQUE INDEX historical_report_project_id ON qa_reports(project_id,id);
CREATE TABLE historical_validation_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL UNIQUE REFERENCES qa_reports(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  preview_hash TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  engine_hash TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  oauth_grant_id TEXT,
  restored_from_id TEXT,
  UNIQUE(project_id, identity_hash),
  FOREIGN KEY(project_id,report_id) REFERENCES qa_reports(project_id,id) ON DELETE CASCADE
);
CREATE INDEX historical_file_sources_project ON historical_file_sources(project_id, uploaded_at);
CREATE INDEX historical_validation_reports_project ON historical_validation_reports(project_id, created_at);
-- Evidence is append-only. Cascading deletion of its parent project/report remains supported.
CREATE TRIGGER historical_file_sources_no_update BEFORE UPDATE ON historical_file_sources
BEGIN SELECT RAISE(ABORT, 'Historical source metadata is immutable'); END;
CREATE TRIGGER historical_validation_reports_no_update BEFORE UPDATE ON historical_validation_reports
BEGIN SELECT RAISE(ABORT, 'Historical validation evidence is immutable'); END;
