-- Promote Event categories/tags into the canonical baseline and add minimal Metrics.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS categories_json JSONB,
  ADD COLUMN IF NOT EXISTS tags_json JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_categories_json_array_check'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_categories_json_array_check
      CHECK (categories_json IS NULL OR jsonb_typeof(categories_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_tags_json_array_check'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_tags_json_array_check
      CHECK (tags_json IS NULL OR jsonb_typeof(tags_json) = 'array');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  owner_team_id UUID NULL,
  aggregation_type TEXT NOT NULL CHECK (aggregation_type IN ('count', 'sum', 'avg')),
  primary_event_id UUID NOT NULL REFERENCES events(id),
  measurement_property_id UUID NULL REFERENCES properties(id),
  filter_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'metrics_filter_json_object_check'
  ) THEN
    ALTER TABLE metrics
      ADD CONSTRAINT metrics_filter_json_object_check
      CHECK (filter_json IS NULL OR jsonb_typeof(filter_json) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_metrics_workspace_id ON metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_metrics_workspace_deleted ON metrics(workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_metrics_primary_event_id ON metrics(primary_event_id);
CREATE INDEX IF NOT EXISTS idx_metrics_measurement_property_id ON metrics(measurement_property_id);

ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'metrics'
      AND policyname = 'metrics_member'
  ) THEN
    CREATE POLICY metrics_member ON metrics
      FOR ALL
      USING (is_workspace_member(workspace_id))
      WITH CHECK (is_workspace_member(workspace_id));
  END IF;
END $$;
