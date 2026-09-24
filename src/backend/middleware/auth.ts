/**
 * Auth middleware (D-13): a `provider` switch so a future remote provider can be added without
 * touching routes. `AUTH_MODE` selects the provider; default and only implemented provider today
 * is `local` (D-09: no remote dependency to verify the app).
 *
 * - `local` provider: every request is user `local-user`, admin on every project. The display
 *   name (`req.userName`, used for QA run `actor` and future change history) resolves once at
 *   process startup, in order (D-25 Q8): `E3_LOCAL_USER_NAME` env, else `git config user.name`
 *   (read synchronously once, cached), else the literal "Local user".
 * - A future `remote` provider would verify a bearer token (e.g. against a hosted auth service)
 *   and set `req.userId`/`req.userName` from the verified session; `requireAuth` and the
 *   `requireProject` membership check already treat "no req.userId" as unauthenticated, so adding
 *   it is additive here, not a route change.
 */
import type { Request, Response, NextFunction } from 'express';
import { execFileSync } from 'node:child_process';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userName?: string;
    }
  }
}

type AuthProvider = 'local' | 'remote';

function getAuthProvider(): AuthProvider {
  const raw = (process.env.AUTH_MODE ?? 'local').trim().toLowerCase();
  return raw === 'remote' ? 'remote' : 'local';
}

/** Reads `git config user.name` once, synchronously, at module load. Never throws. */
function readGitUserName(): string | null {
  try {
    const out = execFileSync('git', ['config', 'user.name'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Resolved once at process startup (D-25 Q8): env override, else git user.name, else fallback. */
export const LOCAL_USER_NAME: string =
  process.env.E3_LOCAL_USER_NAME?.trim() || readGitUserName() || 'Local user';

export const LOCAL_USER_ID = 'local-user';

/**
 * Sets `req.userId`/`req.userName` for every request. In `local` mode this always succeeds (no
 * token, no network). A `remote` provider would verify a bearer token here and leave the fields
 * unset on failure, same as the current pass-through-on-missing-token behaviour.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  if (getAuthProvider() === 'local') {
    req.userId = LOCAL_USER_ID;
    req.userName = LOCAL_USER_NAME;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.userId) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Authentication required.',
    code: 'UNAUTHORIZED',
  });
}

/** True when `userId` is an admin of every project (local mode: always true for the local user, D-13). */
export function isLocalAdmin(userId: string | undefined): boolean {
  return getAuthProvider() === 'local' && userId === LOCAL_USER_ID;
}
