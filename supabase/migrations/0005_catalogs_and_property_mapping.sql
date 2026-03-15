-- Catalogs & Data Governance: CDP lookup tables and property-to-catalog mapping.

-- ---------------------------------------------------------------------------
-- Catalogs (workspace-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL DEFAULT '',
  source_system TEXT NOT NULL DEFAULT '',
  sync_method TEXT NOT NULL DEFAULT '',
  update_frequency TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalogs_workspace_id ON catalogs(workspace_id);

-- ---------------------------------------------------------------------------
-- Catalog fields (one lookup key per catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean')),
  is_lookup_key BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_fields_catalog_id ON catalog_fields(catalog_id);

-- Ensure at most one lookup key per catalog (application enforces; optional DB constraint)
-- CREATE UNIQUE INDEX idx_catalog_fields_one_lookup_key ON catalog_fields(catalog_id) WHERE is_lookup_key = TRUE;

-- ---------------------------------------------------------------------------
-- Property mapping: optional link from property to catalog field
-- ---------------------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS mapped_catalog_id UUID REFERENCES catalogs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mapped_catalog_field_id UUID REFERENCES catalog_fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mapping_type TEXT CHECK (mapping_type IN ('lookup_key', 'mapped_value'));

-- ---------------------------------------------------------------------------
-- RLS for catalogs and catalog_fields
-- ---------------------------------------------------------------------------
ALTER TABLE catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalogs_workspace ON catalogs
  FOR ALL USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

CREATE POLICY catalog_fields_via_catalog ON catalog_fields
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM catalogs c
      WHERE c.id = catalog_fields.catalog_id
        AND c.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );
