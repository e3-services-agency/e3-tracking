-- One token per workspace for the public "shared journeys hub" list (stakeholders).
-- Null = hub disabled; same enable/disable pattern as journey share_token.

ALTER TABLE workspace_settings
ADD COLUMN IF NOT EXISTS journeys_share_hub_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_settings_journeys_share_hub_token_unique
ON workspace_settings (journeys_share_hub_token)
WHERE journeys_share_hub_token IS NOT NULL;
