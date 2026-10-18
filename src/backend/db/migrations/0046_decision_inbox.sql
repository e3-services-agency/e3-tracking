CREATE TABLE decision_revisions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 decision_key TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'proposed'
 CHECK(state IN ('proposed','deferred','rejected','superseded','documented')),
 restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1)), created_at TEXT NOT NULL,
 UNIQUE(project_id,decision_key,revision), UNIQUE(project_id,id)
);
CREATE TABLE decision_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, decision_id TEXT NOT NULL,
 action TEXT NOT NULL, actor TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,decision_id) REFERENCES decision_revisions(project_id,id) ON DELETE CASCADE
);
CREATE INDEX decision_events_scope ON decision_events(project_id,decision_id,created_at);
