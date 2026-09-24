-- Property bundles (T-1-02 delta, D-26): project-scoped named groups of properties, kept as a
-- shell convenience per the plan ("Property bundles are kept as a shell convenience"). Missing
-- from 0001_core.sql (T-1-01 reviewer gap); added here as the next ordered migration rather than
-- editing the already-merged 0001 file.

CREATE TABLE property_bundles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (project_id, name)
);

CREATE INDEX idx_property_bundles_project_id ON property_bundles(project_id);

CREATE TABLE property_bundle_items (
  bundle_id TEXT NOT NULL REFERENCES property_bundles(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (bundle_id, property_id)
);

CREATE INDEX idx_property_bundle_items_property_id ON property_bundle_items(property_id);
