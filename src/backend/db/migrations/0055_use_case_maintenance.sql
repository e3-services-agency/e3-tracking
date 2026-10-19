ALTER TABLE use_cases ADD COLUMN owner_business TEXT;
ALTER TABLE use_cases ADD COLUMN owner_technical TEXT;
ALTER TABLE use_cases ADD COLUMN status_note TEXT;
ALTER TABLE use_cases ADD COLUMN status_changed_by TEXT;
ALTER TABLE use_cases ADD COLUMN status_changed_at TEXT;
ALTER TABLE external_references ADD COLUMN verified_at TEXT;
-- Pointers do not acquire the evidence/confirmation authority of reviewed asset mappings.
CREATE TABLE use_case_asset_pointers (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 use_case_id TEXT NOT NULL, system TEXT NOT NULL CHECK(system='bloomreach'),
 asset_type TEXT NOT NULL, asset_id TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
 label TEXT, role TEXT NOT NULL CHECK(role IN ('primary','variant','qa')),
 actor TEXT NOT NULL, agent TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,use_case_id) REFERENCES use_cases(project_id,id) ON DELETE CASCADE,
 UNIQUE(project_id,use_case_id,system,asset_type,asset_id,environment)
);
CREATE TRIGGER mcp_revision_uc_pointers_insert AFTER INSERT ON use_case_asset_pointers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id=NEW.project_id
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_uc_pointers_update AFTER UPDATE ON use_case_asset_pointers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id=NEW.project_id
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
CREATE TRIGGER mcp_revision_uc_pointers_delete AFTER DELETE ON use_case_asset_pointers BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) SELECT id,1 FROM projects WHERE id=OLD.project_id
 ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
