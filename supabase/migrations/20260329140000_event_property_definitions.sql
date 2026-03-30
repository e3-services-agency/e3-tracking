-- Event-scoped property semantics without duplicating `properties` rows.
-- Same workspace `property_id` can mean different things on different events (e.g. enum_values).
-- Do not use `properties.context` for this; context is global classification, not per-event variants.
-- One row per (event_id, property_id); workspace_id is denormalized for RLS and queries.
-- Trigger enforces workspace_id matches both events.workspace_id and properties.workspace_id.

CREATE TABLE event_property_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  event_id UUID NOT NULL REFERENCES events(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  description_override TEXT,
  enum_values JSONB,
  required BOOLEAN,
  example_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, property_id)
);

COMMENT ON TABLE event_property_definitions IS
  'Optional per-event semantics for a shared property row; canonical definition stays on properties.';

CREATE INDEX idx_event_property_definitions_workspace_id ON event_property_definitions(workspace_id);
CREATE INDEX idx_event_property_definitions_event_id ON event_property_definitions(event_id);
CREATE INDEX idx_event_property_definitions_property_id ON event_property_definitions(property_id);

CREATE OR REPLACE FUNCTION public.enforce_event_property_definitions_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  e_ws UUID;
  p_ws UUID;
  p_deleted TIMESTAMPTZ;
BEGIN
  SELECT e.workspace_id INTO e_ws
  FROM events e
  WHERE e.id = NEW.event_id AND e.deleted_at IS NULL;

  IF e_ws IS NULL THEN
    RAISE EXCEPTION 'event_property_definitions: event not found or deleted';
  END IF;

  IF e_ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'event_property_definitions: workspace_id does not match event';
  END IF;

  SELECT p.workspace_id, p.deleted_at INTO p_ws, p_deleted
  FROM properties p
  WHERE p.id = NEW.property_id;

  IF p_ws IS NULL THEN
    RAISE EXCEPTION 'event_property_definitions: property not found';
  END IF;

  IF p_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'event_property_definitions: property is soft-deleted';
  END IF;

  IF p_ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'event_property_definitions: workspace_id does not match property';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER event_property_definitions_workspace_enforce
  BEFORE INSERT OR UPDATE ON event_property_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_property_definitions_workspace();

ALTER TABLE event_property_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_property_definitions_member ON event_property_definitions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_property_definitions.event_id
        AND is_workspace_member(e.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_property_definitions.event_id
        AND is_workspace_member(e.workspace_id)
    )
  );
