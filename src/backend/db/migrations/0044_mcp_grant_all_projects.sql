ALTER TABLE mcp_oauth_grants ADD COLUMN all_projects INTEGER NOT NULL DEFAULT 0 CHECK (all_projects IN (0,1));
