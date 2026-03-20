-- Canonicalize Event owner as a backend-backed nullable field.
-- Intentionally no foreign key yet because teams are not normalized in the backend schema.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS owner_team_id UUID NULL;
