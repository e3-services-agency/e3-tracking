-- Property bundles: named groups of workspace properties (junction: property_bundle_items).

CREATE TABLE property_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_property_bundles_workspace_name_live
  ON property_bundles(workspace_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_property_bundles_workspace_id ON property_bundles(workspace_id)
  WHERE deleted_at IS NULL;

CREATE TABLE property_bundle_items (
  bundle_id UUID NOT NULL REFERENCES property_bundles(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bundle_id, property_id)
);

CREATE INDEX idx_property_bundle_items_property_id ON property_bundle_items(property_id);

ALTER TABLE property_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_bundles_member ON property_bundles
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY property_bundle_items_member ON property_bundle_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM property_bundles b
      WHERE b.id = property_bundle_items.bundle_id
        AND is_workspace_member(b.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM property_bundles b
      WHERE b.id = property_bundle_items.bundle_id
        AND is_workspace_member(b.workspace_id)
    )
  );
