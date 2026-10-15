import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db';

export const authHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const randomAuthToken = (): string => randomBytes(32).toString('base64url');
export interface AuthSession { participant_id: string; name: string; avatar_url: string | null; expires_at: number }
const SESSION_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

function prune(): void {
  const db = getDb();
  db.prepare('DELETE FROM comment_auth_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('DELETE FROM comment_auth_challenges WHERE expires_at <= ?').run(Date.now());
}
/** `verifiedEmail` is stored only when Google marked it verified (T-5-45); it never leaves the server. */
export function createAuthSession(subject: string, name: string, avatar: string | null, verifiedEmail: string | null = null): string {
  prune();
  const token = randomAuthToken();
  getDb().prepare('INSERT INTO comment_auth_sessions (token_hash, participant_id, name, avatar_url, expires_at, email) VALUES (?, ?, ?, ?, ?, ?)').run(
    authHash(token), `google:${authHash(subject)}`, name, avatar, Date.now() + SESSION_MS, verifiedEmail ? verifiedEmail.trim().toLowerCase() : null);
  return token;
}
/** The session's verified email for share-audience checks only (D-88); never part of `AuthSession`. */
export function readAuthSessionEmail(token: string): string | null {
  const row = getDb().prepare('SELECT email FROM comment_auth_sessions WHERE token_hash = ? AND expires_at > ?')
    .get(authHash(token), Date.now()) as { email: string | null } | undefined;
  return row?.email ?? null;
}
export function readAuthSession(token: string): AuthSession | undefined {
  return getDb().prepare('SELECT participant_id, name, avatar_url, expires_at FROM comment_auth_sessions WHERE token_hash = ? AND expires_at > ?')
    .get(authHash(token), Date.now()) as AuthSession | undefined;
}
export function deleteAuthSession(token: string): void {
  getDb().prepare('DELETE FROM comment_auth_sessions WHERE token_hash = ?').run(authHash(token));
}
export function createAuthChallenge(shareToken: string, previous?: string): { token: string; nonce: string } {
  prune();
  const db = getDb();
  if (previous) db.prepare('DELETE FROM comment_auth_challenges WHERE token_hash = ?').run(authHash(previous));
  // Bounded operational storage even when an unauthenticated caller repeatedly requests challenges.
  if ((db.prepare('SELECT count(*) AS n FROM comment_auth_challenges').get() as { n: number }).n >= 10000) throw new Error('Authentication is busy. Try again shortly.');
  const token = randomAuthToken();
  const nonce = randomAuthToken();
  db.prepare('INSERT INTO comment_auth_challenges (token_hash, share_hash, nonce, expires_at) VALUES (?, ?, ?, ?)').run(authHash(token), authHash(shareToken), nonce, Date.now() + CHALLENGE_MS);
  return { token, nonce };
}
export function consumeAuthChallenge(token: string, shareToken: string): string | undefined {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare('SELECT nonce FROM comment_auth_challenges WHERE token_hash = ? AND share_hash = ? AND expires_at > ?')
      .get(authHash(token), authHash(shareToken), Date.now()) as { nonce: string } | undefined;
    if (row) db.prepare('DELETE FROM comment_auth_challenges WHERE token_hash = ?').run(authHash(token));
    return row?.nonce;
  })();
}
