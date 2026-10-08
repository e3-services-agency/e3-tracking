-- T-5-13: additive attribution, retaining legacy names and reactions unchanged.
ALTER TABLE comments ADD COLUMN participant_id TEXT;
ALTER TABLE comments ADD COLUMN author_kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE comments ADD COLUMN avatar_url TEXT;
ALTER TABLE comment_reactions ADD COLUMN participant_id TEXT;
DROP INDEX uq_comment_reactions_author_kind;
CREATE UNIQUE INDEX uq_comment_reactions_legacy_author_kind ON comment_reactions (comment_id, lower(author_name), kind) WHERE participant_id IS NULL;
CREATE UNIQUE INDEX uq_comment_reactions_participant_kind ON comment_reactions (comment_id, participant_id, kind) WHERE participant_id IS NOT NULL;
-- Opaque browser credentials stay outside project backups/exports.
CREATE TABLE comment_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_comment_guest_sessions_expiry ON comment_guest_sessions (expires_at);
