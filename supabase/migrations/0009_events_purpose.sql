-- Add canonical backend-backed purpose to events.
-- Keep nullable for backward compatibility with existing rows.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS purpose TEXT NULL;
