ALTER TABLE change_log ADD COLUMN agent TEXT;
ALTER TABLE qa_runs ADD COLUMN agent TEXT;
ALTER TABLE qa_reports ADD COLUMN actor TEXT;
ALTER TABLE qa_reports ADD COLUMN agent TEXT;
ALTER TABLE historical_validation_reports ADD COLUMN agent TEXT;
CREATE TABLE mcp_agent_qa_runs (
 grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 agent TEXT NOT NULL,
 qa_run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
 PRIMARY KEY(grant_id,project_id,agent)
);
