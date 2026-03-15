-- Multi-tenant security: workspace membership and RLS by auth.uid().
-- All access is gated by workspace_members. Public share: journeys with share_token are readable (for shared links).

-- ---------------------------------------------------------------------------
-- Membership role enum and table
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE workspace_member_role AS ENUM ('admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role workspace_member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);

-- Helper: true if current user is a member of the given workspace
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- Drop existing RLS policies (from 0001 and 0005)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspaces_select ON workspaces;
DROP POLICY IF EXISTS workspaces_insert ON workspaces;
DROP POLICY IF EXISTS workspaces_update ON workspaces;
DROP POLICY IF EXISTS workspaces_delete ON workspaces;
DROP POLICY IF EXISTS workspace_settings_select ON workspace_settings;
DROP POLICY IF EXISTS workspace_settings_insert ON workspace_settings;
DROP POLICY IF EXISTS workspace_settings_update ON workspace_settings;
DROP POLICY IF EXISTS sources_workspace ON sources;
DROP POLICY IF EXISTS properties_workspace ON properties;
DROP POLICY IF EXISTS events_workspace ON events;
DROP POLICY IF EXISTS journeys_workspace ON journeys;
DROP POLICY IF EXISTS property_sources_workspace ON property_sources;
DROP POLICY IF EXISTS event_sources_workspace ON event_sources;
DROP POLICY IF EXISTS event_properties_workspace ON event_properties;
DROP POLICY IF EXISTS journey_events_workspace ON journey_events;
DROP POLICY IF EXISTS qa_runs_workspace ON qa_runs;
DROP POLICY IF EXISTS qa_run_evidence_workspace ON qa_run_evidence;
DROP POLICY IF EXISTS qa_run_payloads_workspace ON qa_run_payloads;
DROP POLICY IF EXISTS catalogs_workspace ON catalogs;
DROP POLICY IF EXISTS catalog_fields_via_catalog ON catalog_fields;

-- ---------------------------------------------------------------------------
-- RLS: workspace_members (users see only rows for workspaces they belong to)
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_members_all ON workspace_members
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- RLS: workspaces (select/insert/update/delete only if member)
-- ---------------------------------------------------------------------------
CREATE POLICY workspaces_member ON workspaces
  FOR ALL
  USING (is_workspace_member(id))
  WITH CHECK (is_workspace_member(id));

-- ---------------------------------------------------------------------------
-- RLS: workspace_settings
-- ---------------------------------------------------------------------------
CREATE POLICY workspace_settings_member ON workspace_settings
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- RLS: sources, properties, events, catalogs (direct workspace_id)
-- ---------------------------------------------------------------------------
CREATE POLICY sources_member ON sources
  FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY properties_member ON properties
  FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY events_member ON events
  FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY catalogs_member ON catalogs
  FOR ALL USING (is_workspace_member(workspace_id)) WITH CHECK (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- RLS: journeys (member access; public share: anon can SELECT where share_token set)
-- ---------------------------------------------------------------------------
CREATE POLICY journeys_member ON journeys
  FOR ALL
  USING (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- Public share: allow SELECT for rows with share_token so shared URLs work (anon/service_role)
CREATE POLICY journeys_public_share ON journeys
  FOR SELECT
  USING (share_token IS NOT NULL);

-- ---------------------------------------------------------------------------
-- RLS: join tables (via parent workspace)
-- ---------------------------------------------------------------------------
CREATE POLICY property_sources_member ON property_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = property_sources.property_id AND is_workspace_member(p.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = property_sources.property_id AND is_workspace_member(p.workspace_id))
  );
CREATE POLICY event_sources_member ON event_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_sources.event_id AND is_workspace_member(e.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_sources.event_id AND is_workspace_member(e.workspace_id))
  );
CREATE POLICY event_properties_member ON event_properties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_properties.event_id AND is_workspace_member(e.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM events e WHERE e.id = event_properties.event_id AND is_workspace_member(e.workspace_id))
  );
CREATE POLICY journey_events_member ON journey_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM journeys j WHERE j.id = journey_events.journey_id AND is_workspace_member(j.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM journeys j WHERE j.id = journey_events.journey_id AND is_workspace_member(j.workspace_id))
  );
CREATE POLICY catalog_fields_member ON catalog_fields
  FOR ALL USING (
    EXISTS (SELECT 1 FROM catalogs c WHERE c.id = catalog_fields.catalog_id AND is_workspace_member(c.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM catalogs c WHERE c.id = catalog_fields.catalog_id AND is_workspace_member(c.workspace_id))
  );
CREATE POLICY qa_runs_member ON qa_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM journeys j WHERE j.id = qa_runs.journey_id AND is_workspace_member(j.workspace_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM journeys j WHERE j.id = qa_runs.journey_id AND is_workspace_member(j.workspace_id))
  );
CREATE POLICY qa_run_evidence_member ON qa_run_evidence
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_evidence.qa_run_id AND is_workspace_member(j.workspace_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_evidence.qa_run_id AND is_workspace_member(j.workspace_id)
    )
  );
CREATE POLICY qa_run_payloads_member ON qa_run_payloads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_payloads.qa_run_id AND is_workspace_member(j.workspace_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM qa_runs qr
      JOIN journeys j ON j.id = qr.journey_id
      WHERE qr.id = qa_run_payloads.qa_run_id AND is_workspace_member(j.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Helper for invite: resolve user id by email (called by backend with service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = user_email LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.get_user_id_by_email IS 'Resolve auth user id by email; for workspace invite. Use with service role only.';

-- Optional: workspace-level branding (for General tab in Settings)
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS client_primary_color TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_logo_url TEXT;
