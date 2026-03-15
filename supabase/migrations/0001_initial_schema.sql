-- E3 Tracking: Initial schema (Phase 1)
-- Aligns with docs/DATA_SCHEMA_AND_ARCHITECTURE_PLAN.md
-- No ON DELETE CASCADE; soft deletes preserve history.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE property_context AS ENUM (
  'event_property',
  'user_property',
  'system_property'
);

CREATE TYPE pii_status AS ENUM (
  'none',
  'sensitive',
  'highly_sensitive'
);

CREATE TYPE property_data_type AS ENUM (
  'string',
  'integer',
  'float',
  'boolean',
  'object',
  'list'
);

CREATE TYPE event_property_presence AS ENUM (
  'always_sent',
  'sometimes_sent',
  'never_sent'
);

CREATE TYPE qa_run_status AS ENUM (
  'pass',
  'fail'
);

-- ---------------------------------------------------------------------------
-- Tables (order respects FK dependencies)
-- ---------------------------------------------------------------------------

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE workspace_settings (
  workspace_id UUID NOT NULL PRIMARY KEY REFERENCES workspaces(id),
  audit_rules_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No ON DELETE CASCADE: workspace soft-delete does not remove settings row; app handles consistency.

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  context property_context NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  pii_status pii_status NOT NULL DEFAULT 'none',
  data_type property_data_type NOT NULL,
  data_format TEXT,
  is_list BOOLEAN NOT NULL DEFAULT FALSE,
  example_values_json TEXT,
  name_mappings_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
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
  triggers_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
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

CREATE TABLE journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  developer_instructions_markdown TEXT,
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

-- ---------------------------------------------------------------------------
-- Indexes (including partial unique constraints)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_workspaces_deleted_at ON workspaces(deleted_at);
CREATE INDEX idx_sources_workspace_id ON sources(workspace_id);
CREATE INDEX idx_sources_workspace_deleted ON sources(workspace_id, deleted_at);
CREATE INDEX idx_properties_workspace_id ON properties(workspace_id);
CREATE INDEX idx_properties_workspace_deleted ON properties(workspace_id, deleted_at);
CREATE UNIQUE INDEX idx_properties_workspace_context_name_live
  ON properties(workspace_id, context, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_workspace_id ON events(workspace_id);
CREATE INDEX idx_events_workspace_deleted ON events(workspace_id, deleted_at);
CREATE UNIQUE INDEX idx_events_workspace_name_live
  ON events(workspace_id, name) WHERE deleted_at IS NULL;
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

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Application must set app.workspace_id at start of each request (e.g. via
-- SET LOCAL app.workspace_id = '<uuid>' in the same transaction/session).
-- Policies restrict read/write to rows where workspace_id matches.
-- ---------------------------------------------------------------------------

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_run_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_run_payloads ENABLE ROW LEVEL SECURITY;

-- Workspaces: only the workspace selected for this request
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT USING (id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY workspaces_insert ON workspaces
  FOR INSERT WITH CHECK (id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY workspaces_update ON workspaces
  FOR UPDATE USING (id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY workspaces_delete ON workspaces
  FOR DELETE USING (id = current_setting('app.workspace_id', true)::uuid);

-- Workspace settings: by workspace_id
CREATE POLICY workspace_settings_select ON workspace_settings
  FOR SELECT USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY workspace_settings_insert ON workspace_settings
  FOR INSERT WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY workspace_settings_update ON workspace_settings
  FOR UPDATE USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Sources, properties, events, journeys: direct workspace_id
CREATE POLICY sources_workspace ON sources
  FOR ALL USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY properties_workspace ON properties
  FOR ALL USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY events_workspace ON events
  FOR ALL USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
CREATE POLICY journeys_workspace ON journeys
  FOR ALL USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Join tables: allow only when parent belongs to current workspace
CREATE POLICY property_sources_workspace ON property_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_sources.property_id
        AND p.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY event_sources_workspace ON event_sources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_sources.event_id
        AND e.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY event_properties_workspace ON event_properties
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_properties.event_id
        AND e.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY journey_events_workspace ON journey_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.id = journey_events.journey_id
        AND j.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY qa_runs_workspace ON qa_runs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM journeys j
      WHERE j.id = qa_runs.journey_id
        AND j.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY qa_run_evidence_workspace ON qa_run_evidence
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_evidence.qa_run_id
        AND j.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );

CREATE POLICY qa_run_payloads_workspace ON qa_run_payloads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_payloads.qa_run_id
        AND j.workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );
