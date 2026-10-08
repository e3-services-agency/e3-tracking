-- T-5-15: authentication sessions are operational credentials, never project backup data.
CREATE TABLE comment_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX comment_auth_sessions_expiry ON comment_auth_sessions(expires_at);
CREATE TABLE comment_auth_challenges (
  token_hash TEXT PRIMARY KEY,
  share_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX comment_auth_challenges_expiry ON comment_auth_challenges(expires_at);
