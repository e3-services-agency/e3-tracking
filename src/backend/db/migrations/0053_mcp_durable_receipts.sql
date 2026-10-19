-- Operational records stay on this installation and are never part of a portable project backup.
-- Keys are retained for the lifetime of their project; expiry never silently re-executes a write.
CREATE TABLE mcp_write_requests (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 principal TEXT NOT NULL, client_id TEXT NOT NULL, tool TEXT NOT NULL, key_hash TEXT NOT NULL,
 args_hash TEXT NOT NULL, batch_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('running','complete','failed')),
 lease_owner TEXT NOT NULL, lease_until INTEGER NOT NULL,
 response_json TEXT, error_json TEXT, created_at TEXT NOT NULL,
 UNIQUE(project_id,principal,client_id,tool,key_hash)
);
CREATE TABLE mcp_write_steps (
 request_id TEXT NOT NULL REFERENCES mcp_write_requests(id) ON DELETE CASCADE,
 step TEXT NOT NULL, result_json TEXT NOT NULL,
 PRIMARY KEY(request_id,step)
);
