CREATE TABLE asset_link_imports (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 input_hash TEXT NOT NULL, payload_hash TEXT NOT NULL, package_json TEXT NOT NULL,
 actor TEXT NOT NULL, restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1)), created_at TEXT NOT NULL,
 UNIQUE(project_id,id)
);
CREATE UNIQUE INDEX asset_link_imports_current ON asset_link_imports(project_id,input_hash) WHERE restored=0;
CREATE UNIQUE INDEX use_cases_scope_id ON use_cases(project_id,id);
CREATE TABLE use_case_asset_links (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, use_case_id TEXT NOT NULL, import_id TEXT NOT NULL,
 source_project_id TEXT NOT NULL, asset_type TEXT NOT NULL, asset_id TEXT NOT NULL,
 relation TEXT NOT NULL CHECK(relation IN ('implements','supports','variant')),
 link_json TEXT NOT NULL, restored INTEGER NOT NULL DEFAULT 0 CHECK(restored IN (0,1)), created_at TEXT NOT NULL,
 FOREIGN KEY(project_id,use_case_id) REFERENCES use_cases(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,import_id) REFERENCES asset_link_imports(project_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX use_case_asset_links_current ON use_case_asset_links(project_id,use_case_id,source_project_id,asset_type,asset_id) WHERE restored=0;
