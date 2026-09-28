-- T-4-01 (D-48, migration number 0018 per the D-53 amendment 2026-09-28): the share link's
-- `share_token`/`share_access` columns already exist since 0001; this adds `share_created_at` so
-- Settings can show when the current link was generated (rotate/regenerate updates it, revoke
-- clears all three). Plain nullable `ADD COLUMN`, no table rebuild.
ALTER TABLE projects ADD COLUMN share_created_at TEXT;
