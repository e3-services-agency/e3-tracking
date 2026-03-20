-- Pre-production cleanup: remove legacy markdown trigger storage.
-- Structured triggers in triggers_json are now the only event trigger representation.

ALTER TABLE events
  DROP COLUMN IF EXISTS triggers_markdown;
