-- Share via URL: secure public link for read-only journey view.
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journeys_share_token
  ON journeys(share_token) WHERE share_token IS NOT NULL;

COMMENT ON COLUMN journeys.share_token IS 'Public UUID for read-only share link. Null until generated.';
