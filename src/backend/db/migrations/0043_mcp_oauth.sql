-- Operational connector credentials are intentionally outside portable project backups.
CREATE TABLE mcp_oauth_clients (id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE mcp_oauth_pending (cookie_hash TEXT PRIMARY KEY, csrf_hash TEXT NOT NULL, owner TEXT NOT NULL, client_id TEXT REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE, request_json TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mcp_oauth_grants (id TEXT PRIMARY KEY, owner TEXT NOT NULL, client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(id), resource TEXT NOT NULL, scopes_json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
CREATE TABLE mcp_oauth_projects (grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, PRIMARY KEY(grant_id,project_id));
CREATE TABLE mcp_oauth_codes (code_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
CREATE TABLE mcp_oauth_tokens (token_hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('access','refresh')), scopes_json TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
CREATE TABLE mcp_oauth_qa_runs (grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, qa_run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE, PRIMARY KEY(grant_id,project_id));
CREATE TABLE mcp_oauth_audit (id TEXT PRIMARY KEY, grant_id TEXT, owner TEXT NOT NULL, action TEXT NOT NULL, tool TEXT, created_at INTEGER NOT NULL);
CREATE INDEX idx_mcp_tokens_grant ON mcp_oauth_tokens(grant_id);
CREATE INDEX idx_mcp_grants_owner ON mcp_oauth_grants(owner);
CREATE INDEX idx_mcp_pending_expiry ON mcp_oauth_pending(expires_at);
