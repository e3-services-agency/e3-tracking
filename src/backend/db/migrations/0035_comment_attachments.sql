-- T-5-04 (D-70 item 4): images attached to a comment. Up to 10 per comment, PNG/JPEG/WebP only,
-- re-encoded server-side on upload (no metadata survives); the bytes live in the FileStore under
-- `<project>/comments/<comment_id>/...`, this table holds the relative path and image facts.
-- 0033 (threads/status, T-5-02) and 0034 (reactions, T-5-03) are reserved for the parallel tasks.
CREATE TABLE comment_attachments (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_comment_attachments_comment ON comment_attachments (comment_id, sort_order);
CREATE INDEX idx_comment_attachments_project ON comment_attachments (project_id, file_path);
