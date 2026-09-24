-- Schema v1 (T-1-01): the target data model from reports/PLAN-2026-09-24.md
-- "Target data model" section, including the D-27 Client/Project additions.
-- Conventions: ids are UUID v4 text; timestamps are ISO-8601 text; JSON columns are TEXT
-- named `*_json`, parsed in the DAL; booleans are INTEGER 0/1. Every project-scoped table has
-- `project_id` with ON DELETE CASCADE. Soft delete (`deleted_at`) only on Project, Event,
-- Property, Catalog, UseCase per the plan; everything else hard-deletes.

-- ---------------------------------------------------------------------------
-- Client (D-27): a Bloomreach account, above Project.
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bloomreach_account_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Project (replaces Workspace, D-15; settings folded in; D-27 Bloomreach identifiers).
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  -- RESTRICT (T-1-02 delta): deleting a client that still owns projects must fail.
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
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

CREATE INDEX idx_projects_client_id ON projects(client_id);

-- project_members stays for the future remote auth step (D-13); local mode does not use it.
CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Source (kept)
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);

-- ---------------------------------------------------------------------------
-- Catalog and CatalogField (kept, extended)
-- ---------------------------------------------------------------------------
CREATE TABLE catalogs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  source_system TEXT,
  sync_method TEXT,
  update_frequency TEXT,
  catalog_type TEXT,
  mapping_role TEXT,
  client_name TEXT,
  purpose TEXT,
  priority TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_catalogs_project_id ON catalogs(project_id);
-- mapping_role main|variant is unique per project (T-1-06 delta); multiple NULLs are allowed.
CREATE UNIQUE INDEX uq_catalogs_project_mapping_role
  ON catalogs(project_id, mapping_role)
  WHERE mapping_role IS NOT NULL;

CREATE TABLE catalog_fields (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data_type TEXT,
  is_lookup_key INTEGER NOT NULL DEFAULT 0,
  is_searchable INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  client_field_name TEXT,
  bloomreach_column TEXT,
  purpose TEXT,
  priority TEXT,
  status TEXT,
  field_family TEXT,
  item_level TEXT,
  source_mapping_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (catalog_id, name)
);

CREATE INDEX idx_catalog_fields_catalog_id ON catalog_fields(catalog_id);

-- ---------------------------------------------------------------------------
-- Property (event and customer properties in one table, D-24)
-- ---------------------------------------------------------------------------
CREATE TABLE properties (
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
  deleted_at TEXT,
  UNIQUE (project_id, scope, name)
);

CREATE INDEX idx_properties_project_id ON properties(project_id);

-- ---------------------------------------------------------------------------
-- Event
-- ---------------------------------------------------------------------------
CREATE TABLE events (
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
  deleted_at TEXT,
  UNIQUE (project_id, name)
);

CREATE INDEX idx_events_project_id ON events(project_id);

-- event_sources: Event n-m Source with a kind (live|historical|daily).
CREATE TABLE event_sources (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, source_id)
);

-- ---------------------------------------------------------------------------
-- EventProperty (link, D-16: per-event required/role/payload_key/etc. live here)
-- ---------------------------------------------------------------------------
CREATE TABLE event_properties (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'normal',
  priority TEXT,
  status TEXT,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  payload_key TEXT,
  description_override TEXT,
  example_values_override_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, property_id)
);

CREATE INDEX idx_event_properties_property_id ON event_properties(property_id);

-- ---------------------------------------------------------------------------
-- Variant (D-03; replaces the old EventVariant, D-17)
-- ---------------------------------------------------------------------------
CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  conditions_json TEXT NOT NULL,
  expiration_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, name)
);

CREATE INDEX idx_variants_project_id ON variants(project_id);

-- ---------------------------------------------------------------------------
-- StandardEventMapping: standard_event (seed + project additions) to Event (+ optional Variant).
-- ---------------------------------------------------------------------------
CREATE TABLE standard_event_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  standard_event TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- SET NULL: removing just the variant should not wipe out the whole standard event mapping.
  variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
  field_map_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, standard_event)
);

CREATE INDEX idx_standard_event_mappings_event_id ON standard_event_mappings(event_id);

-- ---------------------------------------------------------------------------
-- IdentityRule
-- ---------------------------------------------------------------------------
CREATE TABLE identity_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bloomreach_field TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event_id TEXT REFERENCES events(id),
  trigger_text TEXT,
  value_rule TEXT,
  example TEXT,
  owner TEXT,
  source_id TEXT REFERENCES sources(id),
  tracker TEXT,
  priority TEXT,
  status TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_identity_rules_project_id ON identity_rules(project_id);

-- ---------------------------------------------------------------------------
-- ConsentCategory
-- ---------------------------------------------------------------------------
CREATE TABLE consent_categories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  standard_key TEXT,
  status TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);

CREATE INDEX idx_consent_categories_project_id ON consent_categories(project_id);

-- ---------------------------------------------------------------------------
-- UseCaseTemplate (global library, D-06; not project-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE use_case_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  default_requirements_json TEXT,
  narrative_template TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- UseCase (client instance)
-- ---------------------------------------------------------------------------
CREATE TABLE use_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES use_case_templates(id),
  code TEXT,
  name TEXT NOT NULL,
  type TEXT,
  description TEXT,
  priority TEXT,
  status TEXT,
  owner TEXT,
  notes TEXT,
  narrative TEXT,
  narrative_generated_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (project_id, code)
);

CREATE INDEX idx_use_cases_project_id ON use_cases(project_id);

-- ---------------------------------------------------------------------------
-- Requirement (ordered; the flow sequence)
-- ---------------------------------------------------------------------------
CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  use_case_id TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  target_kind TEXT NOT NULL,
  -- SET NULL on all three target columns: a requirement is a record of what was required (status
  -- can be `gap`), so hard-deleting the property/event/variant it pointed to clears the
  -- dangling reference instead of losing the requirement row.
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  status TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_requirements_use_case_id ON requirements(use_case_id);

-- ---------------------------------------------------------------------------
-- QaRun
-- ---------------------------------------------------------------------------
CREATE TABLE qa_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor TEXT,
  environment TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  customer_id TEXT,
  source_meta_json TEXT
);

CREATE INDEX idx_qa_runs_project_id ON qa_runs(project_id);

-- ---------------------------------------------------------------------------
-- Observation
-- ---------------------------------------------------------------------------
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  qa_run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  -- SET NULL: an observation is raw QA evidence and must survive the definition it was
  -- resolved against being hard-deleted; it just becomes unresolved again.
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
  timestamp REAL NOT NULL,
  properties_json TEXT NOT NULL,
  page_url TEXT,
  context_values_json TEXT,
  captured_at TEXT,
  raw_hash TEXT NOT NULL,
  UNIQUE (qa_run_id, raw_hash)
);

CREATE INDEX idx_observations_project_id ON observations(project_id);
CREATE INDEX idx_observations_qa_run_id ON observations(qa_run_id);
CREATE INDEX idx_observations_event_id ON observations(event_id);

-- ---------------------------------------------------------------------------
-- Finding (D-21)
-- ---------------------------------------------------------------------------
CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comparison TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  -- SET NULL: findings are a historical audit trail (D-21) and stay on record with the
  -- reference cleared when the definition entity they point to is hard-deleted.
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  observation_id TEXT REFERENCES observations(id),
  qa_run_id TEXT REFERENCES qa_runs(id),
  expected_json TEXT,
  actual_json TEXT,
  message TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (project_id, fingerprint)
);

CREATE INDEX idx_findings_project_id ON findings(project_id);
CREATE INDEX idx_findings_event_id ON findings(event_id);
CREATE INDEX idx_findings_status ON findings(status);
