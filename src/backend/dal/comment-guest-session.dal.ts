/** Guest credentials are server state, excluded from project exports/backups. */
import { getDb } from '../db';
export function hasGuestSession(tokenHash: string, now: number): boolean {
  return !!getDb().prepare('SELECT token_hash FROM comment_guest_sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now);
}
export function createGuestSession(tokenHash: string, expiresAt: number, now: number): void {
  const db = getDb();
  db.prepare('DELETE FROM comment_guest_sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO comment_guest_sessions (token_hash, expires_at) VALUES (?, ?)').run(tokenHash, expiresAt);
}
