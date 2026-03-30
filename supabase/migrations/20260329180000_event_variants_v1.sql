-- Event variants v1: scenario overrides under a base event (not Avo-style global variants).
-- Tracked event name remains the base event; variant only affects effective schema for implementation.

CREATE TABLE event_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  base_event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT event_variants_name_unique_per_event UNIQUE (base_event_id, name)
);

CREATE INDEX idx_event_variants_workspace ON event_variants(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_variants_base_event ON event_variants(base_event_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE event_variants IS 'Per-base-event implementation scenarios; overrides_json stores delta vs base event_properties + event_property_definitions.';

ALTER TABLE event_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_variants_member ON event_variants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_variants.base_event_id
        AND is_workspace_member(e.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_variants.base_event_id
        AND is_workspace_member(e.workspace_id)
    )
  );
