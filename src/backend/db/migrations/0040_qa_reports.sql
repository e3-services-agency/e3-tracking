CREATE TABLE findings_new (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 comparison TEXT NOT NULL,kind TEXT NOT NULL,severity TEXT NOT NULL,
 event_id TEXT REFERENCES events(id) ON DELETE SET NULL,variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
 property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,observation_id TEXT REFERENCES observations(id) ON DELETE SET NULL,
 qa_run_id TEXT REFERENCES qa_runs(id) ON DELETE SET NULL,expected_json TEXT,actual_json TEXT,message TEXT,fingerprint TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,resolved_at TEXT,resolved_by TEXT,
 finding_sequence INTEGER NOT NULL CHECK(typeof(finding_sequence)='integer' AND finding_sequence > 0),UNIQUE(project_id,fingerprint),UNIQUE(project_id,finding_sequence)
);
INSERT INTO findings_new SELECT id,project_id,comparison,kind,severity,event_id,variant_id,property_id,observation_id,qa_run_id,
 expected_json,actual_json,message,fingerprint,status,first_seen_at,last_seen_at,resolved_at,resolved_by,
 ROW_NUMBER() OVER(PARTITION BY project_id ORDER BY first_seen_at,id) FROM findings;
DROP TABLE findings;
ALTER TABLE findings_new RENAME TO findings;
CREATE INDEX idx_findings_project_id ON findings(project_id);
CREATE INDEX idx_findings_event_id ON findings(event_id);
CREATE INDEX idx_findings_status ON findings(status);
CREATE TABLE qa_sequence_counters(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 finding_next INTEGER NOT NULL DEFAULT 1 CHECK(typeof(finding_next)='integer' AND finding_next > 0),report_next INTEGER NOT NULL DEFAULT 1 CHECK(typeof(report_next)='integer' AND report_next > 0));
INSERT INTO qa_sequence_counters(project_id,finding_next) SELECT p.id,COALESCE(MAX(f.finding_sequence),0)+1 FROM projects p LEFT JOIN findings f ON f.project_id=p.id GROUP BY p.id;
CREATE TABLE qa_reports(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 report_sequence INTEGER NOT NULL CHECK(typeof(report_sequence)='integer' AND report_sequence > 0),completed_at TEXT NOT NULL,snapshot_version INTEGER NOT NULL DEFAULT 1,
 scope_json TEXT NOT NULL,summary_json TEXT NOT NULL,UNIQUE(project_id,report_sequence));
CREATE TABLE qa_report_findings(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 report_id TEXT NOT NULL REFERENCES qa_reports(id) ON DELETE CASCADE,finding_id TEXT NOT NULL,
 finding_sequence INTEGER NOT NULL CHECK(typeof(finding_sequence)='integer' AND finding_sequence>0),disposition TEXT NOT NULL CHECK(disposition IN ('produced','resolved')),
 public_visible INTEGER NOT NULL DEFAULT 1 CHECK(public_visible IN (0,1)),snapshot_json TEXT NOT NULL,UNIQUE(report_id,finding_id));
CREATE INDEX idx_qa_report_findings_finding ON qa_report_findings(project_id,finding_id);
