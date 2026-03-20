-- Add canonical backend-backed event_type to events.
-- Keep nullable for backward compatibility with existing rows.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_event_type_check'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_event_type_check
      CHECK (event_type IS NULL OR event_type IN ('track', 'page', 'identify'));
  END IF;
END $$;
