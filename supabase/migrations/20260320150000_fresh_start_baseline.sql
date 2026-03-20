-- Fresh-start baseline for a brand new Supabase project.
-- This file creates the full current accepted schema directly in final form.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE workspace_member_role AS ENUM ('admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE property_context AS ENUM ('event_property', 'user_property', 'system_property');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_property_presence AS ENUM ('always_sent', 'sometimes_sent', 'never_sent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE qa_run_status AS ENUM ('pass', 'fail');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.generate_workspace_key(input_uuid UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(replace(input_uuid::text, '-', ''));
$$;

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT workspaces_workspace_key_not_blank CHECK (btrim(workspace_key) <> '')
);

CREATE OR REPLACE FUNCTION public.assign_workspace_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.workspace_key IS NULL OR btrim(NEW.workspace_key) = '' THEN
    NEW.workspace_key := public.generate_workspace_key(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workspaces_assign_workspace_key
BEFORE INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION public.assign_workspace_key();

CREATE TABLE workspace_settings (
  workspace_id UUID NOT NULL PRIMARY KEY REFERENCES workspaces(id),
  audit_rules_json JSONB NOT NULL DEFAULT '{}',
  client_primary_color TEXT,
  client_name TEXT,
  client_logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT NOT NULL DEFAULT '',
  source_system TEXT NOT NULL DEFAULT '',
  sync_method TEXT NOT NULL DEFAULT '',
  update_frequency TEXT NOT NULL DEFAULT '',
  catalog_type TEXT NOT NULL DEFAULT 'General',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalogs_catalog_type_check CHECK (catalog_type IN ('Product', 'Variant', 'General'))
);

CREATE TABLE catalog_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL,
  is_lookup_key BOOLEAN NOT NULL DEFAULT FALSE,
  field_family TEXT NOT NULL DEFAULT 'custom',
  item_level TEXT NOT NULL DEFAULT 'general',
  source_mapping_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_fields_data_type_check CHECK (data_type IN ('string', 'number', 'boolean')),
  CONSTRAINT catalog_fields_field_family_check CHECK (field_family IN ('system', 'custom')),
  CONSTRAINT catalog_fields_item_level_check CHECK (item_level IN ('parent', 'variant', 'general')),
  CONSTRAINT catalog_fields_source_mapping_json_object_check CHECK (
    source_mapping_json IS NULL OR jsonb_typeof(source_mapping_json) = 'object'
  ),
  CONSTRAINT catalog_fields_source_mapping_type_check CHECK (
    source_mapping_json IS NULL
    OR (
      source_mapping_json ? 'mapping_type'
      AND source_mapping_json ? 'source_value'
      AND source_mapping_json->>'mapping_type' IN ('json_field', 'json_path', 'alias')
      AND jsonb_typeof(source_mapping_json->'source_value') = 'string'
    )
  )
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  context property_context NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  pii BOOLEAN NOT NULL DEFAULT FALSE,
  data_type TEXT NOT NULL,
  data_formats_json JSONB,
  value_schema_json JSONB,
  example_values_json JSONB,
  name_mappings_json JSONB,
  mapped_catalog_id UUID REFERENCES catalogs(id) ON DELETE SET NULL,
  mapped_catalog_field_id UUID REFERENCES catalog_fields(id) ON DELETE SET NULL,
  mapping_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT properties_data_type_v1_check CHECK (
    data_type IN ('string', 'number', 'boolean', 'timestamp', 'object', 'array')
  ),
  CONSTRAINT properties_data_formats_json_array_check CHECK (
    data_formats_json IS NULL OR jsonb_typeof(data_formats_json) = 'array'
  ),
  CONSTRAINT properties_value_schema_json_object_check CHECK (
    value_schema_json IS NULL OR jsonb_typeof(value_schema_json) = 'object'
  ),
  CONSTRAINT properties_example_values_json_array_check CHECK (
    example_values_json IS NULL OR jsonb_typeof(example_values_json) = 'array'
  ),
  CONSTRAINT properties_name_mappings_json_array_check CHECK (
    name_mappings_json IS NULL OR jsonb_typeof(name_mappings_json) = 'array'
  ),
  CONSTRAINT properties_mapping_type_check CHECK (
    mapping_type IS NULL OR mapping_type IN ('lookup_key', 'mapped_value')
  )
);

CREATE TABLE property_sources (
  property_id UUID NOT NULL REFERENCES properties(id),
  source_id UUID NOT NULL REFERENCES sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, source_id)
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  purpose TEXT,
  event_type TEXT,
  owner_team_id UUID NULL,
  categories_json JSONB,
  tags_json JSONB,
  triggers_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT events_event_type_check CHECK (
    event_type IS NULL OR event_type IN ('track', 'page', 'identify')
  ),
  CONSTRAINT events_categories_json_array_check CHECK (
    categories_json IS NULL OR jsonb_typeof(categories_json) = 'array'
  ),
  CONSTRAINT events_tags_json_array_check CHECK (
    tags_json IS NULL OR jsonb_typeof(tags_json) = 'array'
  ),
  CONSTRAINT events_triggers_json_array_check CHECK (
    triggers_json IS NULL OR jsonb_typeof(triggers_json) = 'array'
  )
);

CREATE TABLE event_sources (
  event_id UUID NOT NULL REFERENCES events(id),
  source_id UUID NOT NULL REFERENCES sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, source_id)
);

CREATE TABLE event_properties (
  event_id UUID NOT NULL REFERENCES events(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  presence event_property_presence NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, property_id)
);

CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  owner_team_id UUID NULL,
  aggregation_type TEXT NOT NULL,
  primary_event_id UUID NOT NULL REFERENCES events(id),
  measurement_property_id UUID NULL REFERENCES properties(id),
  filter_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT metrics_aggregation_type_check CHECK (
    aggregation_type IN ('count', 'sum', 'avg')
  ),
  CONSTRAINT metrics_filter_json_object_check CHECK (
    filter_json IS NULL OR jsonb_typeof(filter_json) = 'object'
  )
);

CREATE TABLE journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  developer_instructions_markdown TEXT,
  canvas_nodes_json JSONB,
  canvas_edges_json JSONB,
  testing_instructions_markdown TEXT,
  share_token UUID UNIQUE,
  type_counts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE journey_events (
  journey_id UUID NOT NULL REFERENCES journeys(id),
  event_id UUID NOT NULL REFERENCES events(id),
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (journey_id, event_id)
);

CREATE TABLE qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES journeys(id),
  status qa_run_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE qa_run_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id UUID NOT NULL REFERENCES qa_runs(id),
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qa_run_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id UUID NOT NULL REFERENCES qa_runs(id),
  node_id TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  actual_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_deleted_at ON workspaces(deleted_at);
CREATE UNIQUE INDEX idx_workspaces_workspace_key ON workspaces(workspace_key);

CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);

CREATE INDEX idx_sources_workspace_id ON sources(workspace_id);
CREATE INDEX idx_sources_workspace_deleted ON sources(workspace_id, deleted_at);

CREATE INDEX idx_catalogs_workspace_id ON catalogs(workspace_id);
CREATE INDEX idx_catalog_fields_catalog_id ON catalog_fields(catalog_id);

CREATE INDEX idx_properties_workspace_id ON properties(workspace_id);
CREATE INDEX idx_properties_workspace_deleted ON properties(workspace_id, deleted_at);
CREATE UNIQUE INDEX idx_properties_workspace_context_name_live
  ON properties(workspace_id, context, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_events_workspace_id ON events(workspace_id);
CREATE INDEX idx_events_workspace_deleted ON events(workspace_id, deleted_at);
CREATE UNIQUE INDEX idx_events_workspace_name_live
  ON events(workspace_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_metrics_workspace_id ON metrics(workspace_id);
CREATE INDEX idx_metrics_workspace_deleted ON metrics(workspace_id, deleted_at);
CREATE INDEX idx_metrics_primary_event_id ON metrics(primary_event_id);
CREATE INDEX idx_metrics_measurement_property_id ON metrics(measurement_property_id);

CREATE INDEX idx_event_properties_event_id ON event_properties(event_id);
CREATE INDEX idx_event_properties_property_id ON event_properties(property_id);

CREATE INDEX idx_journeys_workspace_id ON journeys(workspace_id);
CREATE INDEX idx_journeys_workspace_deleted ON journeys(workspace_id, deleted_at);
CREATE INDEX idx_journey_events_journey_sort ON journey_events(journey_id, sort_order);

CREATE INDEX idx_qa_runs_journey_id ON qa_runs(journey_id);
CREATE INDEX idx_qa_runs_journey_created ON qa_runs(journey_id, created_at);
CREATE INDEX idx_qa_run_evidence_qa_run_id ON qa_run_evidence(qa_run_id);
CREATE INDEX idx_qa_run_evidence_qa_run_sort ON qa_run_evidence(qa_run_id, sort_order);
CREATE INDEX idx_qa_run_payloads_qa_run_id ON qa_run_payloads(qa_run_id);

CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email TEXT)
RETURNS UUID AS $$
  SELECT id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.get_user_id_by_email IS
  'Resolve auth user id by email; for workspace invite. Use with service role only.';

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_run_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_run_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_select_member ON workspaces
  FOR SELECT
  USING (is_workspace_member(id));

CREATE POLICY workspaces_update_member ON workspaces
  FOR UPDATE
  USING (is_workspace_member(id))
  WITH CHECK (is_workspace_member(id));

CREATE POLICY workspaces_delete_member ON workspaces
  FOR DELETE
  USING (is_workspace_member(id));

CREATE POLICY workspaces_insert_authenticated ON workspaces
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY workspace_members_select_member ON workspace_members
  FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY workspace_members_update_member ON workspace_members
  FOR UPDATE
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY workspace_members_delete_member ON workspace_members
  FOR DELETE
  USING (is_workspace_member(workspace_id));

CREATE POLICY workspace_members_insert_bootstrap ON workspace_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND (
      is_workspace_member(workspace_id)
      OR NOT EXISTS (
        SELECT 1
        FROM workspace_members existing
        WHERE existing.workspace_id = workspace_id
      )
    )
  );

CREATE POLICY workspace_settings_member ON workspace_settings
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY sources_member ON sources
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY catalogs_member ON catalogs
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY catalog_fields_member ON catalog_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM catalogs c
      WHERE c.id = catalog_fields.catalog_id
        AND is_workspace_member(c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM catalogs c
      WHERE c.id = catalog_fields.catalog_id
        AND is_workspace_member(c.workspace_id)
    )
  );

CREATE POLICY properties_member ON properties
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY property_sources_member ON property_sources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM properties p
      WHERE p.id = property_sources.property_id
        AND is_workspace_member(p.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM properties p
      WHERE p.id = property_sources.property_id
        AND is_workspace_member(p.workspace_id)
    )
  );

CREATE POLICY events_member ON events
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY event_sources_member ON event_sources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_sources.event_id
        AND is_workspace_member(e.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_sources.event_id
        AND is_workspace_member(e.workspace_id)
    )
  );

CREATE POLICY event_properties_member ON event_properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_properties.event_id
        AND is_workspace_member(e.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_properties.event_id
        AND is_workspace_member(e.workspace_id)
    )
  );

CREATE POLICY metrics_member ON metrics
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY journeys_member ON journeys
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY journeys_public_share ON journeys
  FOR SELECT
  USING (share_token IS NOT NULL);

CREATE POLICY journey_events_member ON journey_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM journeys j
      WHERE j.id = journey_events.journey_id
        AND is_workspace_member(j.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM journeys j
      WHERE j.id = journey_events.journey_id
        AND is_workspace_member(j.workspace_id)
    )
  );

CREATE POLICY qa_runs_member ON qa_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM journeys j
      WHERE j.id = qa_runs.journey_id
        AND is_workspace_member(j.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM journeys j
      WHERE j.id = qa_runs.journey_id
        AND is_workspace_member(j.workspace_id)
    )
  );

CREATE POLICY qa_run_evidence_member ON qa_run_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_evidence.qa_run_id
        AND is_workspace_member(j.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_evidence.qa_run_id
        AND is_workspace_member(j.workspace_id)
    )
  );

CREATE POLICY qa_run_payloads_member ON qa_run_payloads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_payloads.qa_run_id
        AND is_workspace_member(j.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_payloads.qa_run_id
        AND is_workspace_member(j.workspace_id)
    )
  );
