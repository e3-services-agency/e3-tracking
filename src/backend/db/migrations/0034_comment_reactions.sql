-- T-5-03 (D-70 items 3 and 5): comment reactions and the "require a name" share setting.
--
-- `comment_reactions`: one row per (comment, author, kind). Authors are free text on a share link,
-- so uniqueness is case-insensitive (expression index on lower(author_name)). Reactions are not
-- change-logged (comments are their own lightweight trail, D-49). Cascade-deleted with the comment.
-- `projects.share_require_name`: when 1 the share link needs an author name for posts, replies,
-- reactions and status changes. Plain ADD COLUMN.
CREATE TABLE comment_reactions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('seen', 'like', 'on_it')),
  via_share INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_comment_reactions_author_kind ON comment_reactions (comment_id, lower(author_name), kind);
CREATE INDEX idx_comment_reactions_project ON comment_reactions (project_id);
ALTER TABLE projects ADD COLUMN share_require_name INTEGER NOT NULL DEFAULT 0 CHECK (share_require_name IN (0, 1));
