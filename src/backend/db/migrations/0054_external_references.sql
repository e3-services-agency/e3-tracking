CREATE TABLE external_references (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('finding','use_case')), target_id TEXT NOT NULL,
 system TEXT NOT NULL CHECK(system='cortex'), client TEXT NOT NULL, project TEXT NOT NULL,
 record_type TEXT NOT NULL CHECK(record_type IN ('entity','document','decision')),
 record_id TEXT NOT NULL CHECK(length(record_id)=24 AND record_id NOT GLOB '*[^a-f0-9]*'),
 revision INTEGER NOT NULL CHECK(revision>0),
 content_hash TEXT NOT NULL CHECK(length(content_hash)=64 AND content_hash NOT GLOB '*[^a-f0-9]*'),
 note TEXT, actor TEXT NOT NULL, agent TEXT, created_at TEXT NOT NULL,
 UNIQUE(project_id,target_kind,target_id,system,client,project,record_type,record_id,revision)
);
CREATE TRIGGER external_references_target BEFORE INSERT ON external_references BEGIN
 SELECT CASE WHEN (NEW.target_kind='finding' AND NOT EXISTS(SELECT 1 FROM findings WHERE project_id=NEW.project_id AND id=NEW.target_id))
 OR (NEW.target_kind='use_case' AND NOT EXISTS(SELECT 1 FROM use_cases WHERE project_id=NEW.project_id AND id=NEW.target_id)) THEN RAISE(ABORT,'Reference target is outside this project') END;
END;
CREATE TRIGGER external_references_finding_delete AFTER DELETE ON findings BEGIN DELETE FROM external_references WHERE project_id=OLD.project_id AND target_kind='finding' AND target_id=OLD.id; END;
CREATE TRIGGER external_references_use_case_delete AFTER DELETE ON use_cases BEGIN DELETE FROM external_references WHERE project_id=OLD.project_id AND target_kind='use_case' AND target_id=OLD.id; END;
CREATE TRIGGER external_references_revision AFTER INSERT ON external_references BEGIN
 INSERT INTO mcp_project_revisions(project_id,generation) VALUES(NEW.project_id,1) ON CONFLICT(project_id) DO UPDATE SET generation=generation+1;
END;
