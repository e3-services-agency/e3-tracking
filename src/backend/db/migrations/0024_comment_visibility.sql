-- T-4-10 (D-49 amendment 2): per-comment and per-link comment visibility.
--
-- `comments.internal_only = 1` marks a comment that is never returned by the public share routes,
-- whatever the link's settings. `projects.share_comments` is the link-wide setting: `all` shows
-- every non-internal comment on the shared view (the D-49 amendment one-shared-thread default),
-- `via_share_only` shows only comments posted through the link itself. Plain ADD COLUMNs, no table
-- rebuild; the allowed values are enforced with a CHECK here and in the DAL.
ALTER TABLE comments ADD COLUMN internal_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN share_comments TEXT NOT NULL DEFAULT 'all' CHECK (share_comments IN ('all', 'via_share_only'));
