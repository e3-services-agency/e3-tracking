-- Preserve attribution, threads and child foreign keys while expanding collaboration anchors.
CREATE TABLE comments_new (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('event','property','use_case','requirement','identity_rule','catalog','property_definition','finding','qa_report')),
 entity_id TEXT NOT NULL, author_name TEXT NOT NULL, via_share INTEGER NOT NULL DEFAULT 0,
 body TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT,
 internal_only INTEGER NOT NULL DEFAULT 0 CHECK(internal_only IN (0,1)),
 parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','on_it','done','wont_do')),
 status_changed_by TEXT, status_changed_at TEXT, participant_id TEXT,
 author_kind TEXT NOT NULL DEFAULT 'legacy', avatar_url TEXT
);
INSERT INTO comments_new (id,project_id,entity_type,entity_id,author_name,via_share,body,created_at,resolved_at,resolved_by,internal_only,parent_id,status,status_changed_by,status_changed_at,participant_id,author_kind,avatar_url)
 SELECT id,project_id,entity_type,entity_id,author_name,via_share,body,created_at,resolved_at,resolved_by,internal_only,parent_id,status,status_changed_by,status_changed_at,participant_id,author_kind,avatar_url FROM comments;
DROP TABLE comments;
ALTER TABLE comments_new RENAME TO comments;
CREATE INDEX idx_comments_entity ON comments(project_id,entity_type,entity_id,created_at);
CREATE INDEX idx_comments_parent ON comments(parent_id);
