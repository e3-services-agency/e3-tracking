-- Add canonical structured trigger storage for events.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS triggers_json JSONB DEFAULT NULL;
