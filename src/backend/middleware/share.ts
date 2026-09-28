/**
 * Public share-link middleware (D-48, T-4-01), mounted on every `/api/shared/:token/*` route
 * (`routes/shared.ts`). Looks the project up by its exact token (`getProjectByShareToken`, an
 * indexed exact match, non-deleted only) and then re-verifies the match with a timing-safe byte
 * comparison (`node:crypto.timingSafeEqual`) rather than trusting a plain `===`/index hit alone, so
 * neither an unknown token nor a wrong-length token nor a same-length-but-wrong token differ in how
 * the token itself is compared. Unknown or revoked (no `share_token`/`share_access` on the row) is a
 * 404 `SHARE_NOT_FOUND` -- deliberately not 403, so a leaked/rotated link gives no signal that a
 * project ever existed at that path.
 *
 * Sets `req.projectId`/`req.shareAccess` for the route handlers below it. Never reads
 * `req.userId`/`req.userName` (D-48: share links need no login at all, local `optionalAuth` runs
 * unconditionally in local mode but a share visitor sends no auth headers of their own -- this
 * middleware must work identically either way, which is why `routes/shared.ts` is mounted in
 * `app.ts` ahead of `optionalAuth`).
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getProjectByShareToken } from '../dal/project.dal';
import type { ShareAccess } from '../../domain/enums';

declare global {
  namespace Express {
    interface Request {
      shareAccess?: ShareAccess;
    }
  }
}

function safeTokenEqual(provided: string, actual: string): boolean {
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(actual, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function shareNotFound(res: Response): void {
  res.status(404).json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' });
}

export function requireShare(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token;
  if (!token) {
    shareNotFound(res);
    return;
  }
  const project = getProjectByShareToken(token);
  if (!project || !project.share_token || !project.share_access) {
    shareNotFound(res);
    return;
  }
  if (!safeTokenEqual(token, project.share_token)) {
    shareNotFound(res);
    return;
  }
  req.projectId = project.id;
  req.shareAccess = project.share_access as ShareAccess;
  next();
}
