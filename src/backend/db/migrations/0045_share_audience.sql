-- T-5-45 (D-88): share audience and members. `listed_people` gates the share link behind a
-- verified Google sign-in whose email is in `share_members`; `anyone_with_link` is today's behaviour.
ALTER TABLE projects ADD COLUMN share_audience TEXT NOT NULL DEFAULT 'anyone_with_link'
  CHECK (share_audience IN ('anyone_with_link', 'listed_people'));
CREATE TABLE share_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter')),
  added_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, email)
);
-- Verified Google email (email_verified true only); server-side only, never in a public response.
ALTER TABLE comment_auth_sessions ADD COLUMN email TEXT;
