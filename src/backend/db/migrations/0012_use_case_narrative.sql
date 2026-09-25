-- T-2-11 (D-32): adds `use_cases.narrative_edited_at`, set when a human saves the narrative by
-- hand (`PATCH /use-cases/:id` with `narrative` in the body). `narrative_generated_at`
-- (0001_core.sql) is set only by `POST /use-cases/:id/narrative/regenerate`. Regenerating over a
-- manual edit requires `force: true` (409 `NARRATIVE_EDITED` otherwise) -- the service compares
-- these two columns, so a plain nullable `ADD COLUMN` is enough; no table rebuild needed.

ALTER TABLE use_cases ADD COLUMN narrative_edited_at TEXT;
