-- Fix round on T-1-02 (finding #4a, #8): the uniqueness constraints on projects.key, events(project,
-- name), properties(project, scope, name) and property_bundles(project, name) were plain inline
-- UNIQUE table constraints, so they applied to *every* row including soft-deleted ones. The DAL's
-- own pre-checks already filter `deleted_at IS NULL`, so a delete-then-recreate-with-the-same-name
-- passed the pre-check and then hit the real constraint, surfacing as a raw 500 instead of either
-- succeeding or a clean 409. SQLite has no `ALTER TABLE ... DROP CONSTRAINT`; the only way to
-- replace an inline UNIQUE with a partial `UNIQUE INDEX ... WHERE deleted_at IS NULL` is the
-- documented rebuild: create the table without the constraint, copy the data, drop the old table,
-- rename the new one back. `ALTER TABLE ... RENAME TO` updates every other table's FK definitions
-- that reference the renamed table automatically (`legacy_alter_table` is off by default), so
-- `event_properties`, `requirements`, `findings`, `property_bundle_items`, `sources`, `catalogs`,
-- etc. keep working unchanged. `db/index.ts` disables `foreign_keys` for the whole migration run
-- (SQLite requires this outside of any transaction) and runs `PRAGMA foreign_key_check` right after
-- committing, so this file does not need to (and must not) touch the pragma itself.

-- ---------------------------------------------------------------------------
-- projects.key: partial unique so a soft-deleted project's key can be reused (finding #8).
-- ---------------------------------------------------------------------------
CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  client_name TEXT,
  description TEXT,
  client_primary_color TEXT,
  client_logo_path TEXT,
  bloomreach_api_customer_id_key TEXT,
  bloomreach_project_token TEXT,
  bloomreach_api_base_url TEXT,
  bloomreach_project_url TEXT,
  default_expiration_json TEXT,
  standard_event_additions_json TEXT,
  consent_key_additions_json TEXT,
  bloomreach_mapping_meta_json TEXT,
  share_token TEXT,
  share_access TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO projects_new (
  id, client_id, name, key, client_name, description, client_primary_color, client_logo_path,
  bloomreach_api_customer_id_key, bloomreach_project_token, bloomreach_api_base_url,
  bloomreach_project_url, default_expiration_json, standard_event_additions_json,
  consent_key_additions_json, bloomreach_mapping_meta_json, share_token, share_access,
  created_at, updated_at, deleted_at
)
SELECT
  id, client_id, name, key, client_name, description, client_primary_color, client_logo_path,
  bloomreach_api_customer_id_key, bloomreach_project_token, bloomreach_api_base_url,
  bloomreach_project_url, default_expiration_json, standard_event_additions_json,
  consent_key_additions_json, bloomreach_mapping_meta_json, share_token, share_access,
  created_at, updated_at, deleted_at
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE UNIQUE INDEX uq_projects_key ON projects(key) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- events(project_id, name): partial unique so a soft-deleted event's name can be reused.
-- ---------------------------------------------------------------------------
CREATE TABLE events_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  description TEXT,
  purpose TEXT,
  page TEXT,
  trigger_text TEXT,
  grain TEXT,
  identity_note TEXT,
  triggers_json TEXT,
  event_type TEXT NOT NULL DEFAULT 'custom',
  owner_business TEXT,
  owner_technical TEXT,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  expiration_json TEXT,
  not_suitable_for TEXT,
  agent_instructions TEXT,
  derived_metrics_json TEXT,
  tags_json TEXT,
  codegen_event_name_overrides_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO events_new (
  id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
  identity_note, triggers_json, event_type, owner_business, owner_technical, priority,
  status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
  tags_json, codegen_event_name_overrides_json, created_at, updated_at, deleted_at
)
SELECT
  id, project_id, name, business_name, description, purpose, page, trigger_text, grain,
  identity_note, triggers_json, event_type, owner_business, owner_technical, priority,
  status, expiration_json, not_suitable_for, agent_instructions, derived_metrics_json,
  tags_json, codegen_event_name_overrides_json, created_at, updated_at, deleted_at
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_project_id ON events(project_id);
CREATE UNIQUE INDEX uq_events_project_name ON events(project_id, name) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- properties(project_id, scope, name): partial unique so a soft-deleted property's
-- (scope, name) can be reused.
-- ---------------------------------------------------------------------------
CREATE TABLE properties_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  notes TEXT,
  data_type TEXT NOT NULL,
  data_formats_json TEXT,
  pii INTEGER NOT NULL DEFAULT 0,
  property_type TEXT NOT NULL DEFAULT 'custom',
  allowed_values_json TEXT,
  example_values_json TEXT,
  value_schema_json TEXT,
  object_child_property_refs_json TEXT,
  bloomreach_customer_property TEXT,
  priority TEXT,
  status TEXT,
  mapped_catalog_id TEXT REFERENCES catalogs(id),
  mapped_catalog_field_id TEXT REFERENCES catalog_fields(id),
  mapping_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO properties_new (
  id, project_id, scope, name, description, category, notes, data_type, data_formats_json,
  pii, property_type, allowed_values_json, example_values_json, value_schema_json,
  object_child_property_refs_json, bloomreach_customer_property, priority, status,
  mapped_catalog_id, mapped_catalog_field_id, mapping_type, created_at, updated_at, deleted_at
)
SELECT
  id, project_id, scope, name, description, category, notes, data_type, data_formats_json,
  pii, property_type, allowed_values_json, example_values_json, value_schema_json,
  object_child_property_refs_json, bloomreach_customer_property, priority, status,
  mapped_catalog_id, mapped_catalog_field_id, mapping_type, created_at, updated_at, deleted_at
FROM properties;

DROP TABLE properties;
ALTER TABLE properties_new RENAME TO properties;

CREATE INDEX idx_properties_project_id ON properties(project_id);
CREATE UNIQUE INDEX uq_properties_project_scope_name ON properties(project_id, scope, name) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- property_bundles(project_id, name): partial unique so a soft-deleted bundle's name can be reused.
-- ---------------------------------------------------------------------------
CREATE TABLE property_bundles_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO property_bundles_new (id, project_id, name, description, created_at, updated_at, deleted_at)
SELECT id, project_id, name, description, created_at, updated_at, deleted_at
FROM property_bundles;

DROP TABLE property_bundles;
ALTER TABLE property_bundles_new RENAME TO property_bundles;

CREATE INDEX idx_property_bundles_project_id ON property_bundles(project_id);
CREATE UNIQUE INDEX uq_property_bundles_project_name ON property_bundles(project_id, name) WHERE deleted_at IS NULL;
