-- T-4-02 (D-49, capability 13): adds the `comments` table so a team member (and, from T-4-04, a
-- client via a share link) can annotate an event, property, use case or requirement.
--
-- `entity_id` is deliberately not a foreign key: a comment must survive its target's soft delete
-- (and a requirement's target can even be replaced by `replaceRequirements`, D-49) so the panel
-- can still list it; `entity_label` is resolved fresh on every read by the route, never stored.
-- `via_share` distinguishes a client-posted comment (through `/api/shared/:token/comments`,
-- T-4-04) from an internal one; `resolved_at`/`resolved_by` are an internal-only triage toggle,
-- never settable through the share route, and there is no edit -- only resolve and delete.
--
-- Migration number 0019 per the D-53 amendment (2026-09-28): 0016 T-3-06, 0017 T-3-10, 0018
-- T-4-01 (`projects.share_created_at`), 0019 T-4-02. Not logged to `change_log` (D-44 lists what
-- is not logged; comments are their own lightweight discussion trail, not a definition write).
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'property', 'use_case', 'requirement')),
  entity_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  via_share INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX idx_comments_entity ON comments (project_id, entity_type, entity_id, created_at);
