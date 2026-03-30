-- Per-event, per-method codegen output event names (canonical `events.name` unchanged).
ALTER TABLE events
ADD COLUMN IF NOT EXISTS codegen_event_name_overrides JSONB DEFAULT NULL;
