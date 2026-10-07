-- T-5-02 (D-70 items 1-2): comment threads and status.
--
-- `parent_id` makes a comment a reply (one level: a reply inherits the root's entity and
-- internal_only; replies to replies attach to the root). `status` replaces the resolved flag as the
-- source of truth (open | on_it | done | wont_do); `resolved_at`/`resolved_by` are kept and mirrored
-- (set when status becomes done, cleared otherwise) so older readers keep working.
-- `status_changed_by/at` is the lightweight record of the last status change (comments stay out of
-- change_log, D-49). Plain ADD COLUMNs, no table rebuild.
ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'on_it', 'done', 'wont_do'));
ALTER TABLE comments ADD COLUMN status_changed_by TEXT;
ALTER TABLE comments ADD COLUMN status_changed_at TEXT;
UPDATE comments SET status = 'done', status_changed_by = resolved_by, status_changed_at = resolved_at WHERE resolved_at IS NOT NULL;
CREATE INDEX idx_comments_parent ON comments (parent_id);
