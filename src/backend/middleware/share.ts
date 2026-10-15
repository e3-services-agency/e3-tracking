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
 * Share audience (D-88, T-5-45): with `share_audience = 'listed_people'` the token alone is not
 * enough. `requireShare` also needs one of
 * - a Google session (`e3_comment_auth` cookie) whose server-stored, Google-verified email is in
 *   `share_members`; the effective access is that member's role capped by the link's `share_access`;
 * - Workspace staff recognised by the trusted proxy (`req.shareStaffVerified`, set only by the
 *   shared-auth router after `resolveStaffIdentity`); staff get the link's access.
 * Anyone else gets the identical 404 `SHARE_NOT_FOUND`. `requireShareToken` checks the token only:
 * it is for the sign-in routes and the neutral header, which must work before sign-in.
 *
 * Sets `req.projectId`/`req.shareAccess` for the route handlers below it. Never reads
 * `req.userId`/`req.userName` (D-48: share links need no login at all, local `optionalAuth` runs
 * unconditionally in local mode but a share visitor sends no auth headers of their own -- this
 * middleware must work identically either way, which is why `routes/shared.ts` is mounted in
 * `app.ts` ahead of `optionalAuth`).
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { findShareMember, getProjectByShareToken, type ProjectRow } from '../dal/project.dal';
import { readAuthSession, readAuthSessionEmail } from '../dal/commentAuth.dal';
import { capShareAccess, type ShareAccess } from '../../domain/enums';

declare global {
  namespace Express {
    interface Request {
      shareAccess?: ShareAccess;
      /** True only when the shared-auth router verified Workspace staff through the trusted proxy. */
      shareStaffVerified?: boolean;
    }
  }
}

/** Google sign-in session cookie of the shared portal (`routes/sharedAuth.ts`). */
export const SHARE_SESSION_COOKIE = 'e3_comment_auth';

export function cookieValue(req: Request, name: string): string | undefined {
  const values = (req.headers?.cookie ?? '').split(';').map((c) => c.trim()).filter((c) => c.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return undefined; }
}

function safeTokenEqual(provided: string, actual: string): boolean {
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(actual, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function shareNotFound(res: Response): void {
  res.status(404).json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' });
}

/** The project behind a valid, active token, or `null`. */
export function resolveShareProject(token: string | undefined): ProjectRow | null {
  if (!token) return null;
  const project = getProjectByShareToken(token);
  if (!project || !project.share_token || !project.share_access) return null;
  return safeTokenEqual(token, project.share_token) ? project : null;
}

/** The verified email of this request's Google session, if any. Server-side only. */
export function sessionVerifiedEmail(req: Request): string | null {
  const token = cookieValue(req, SHARE_SESSION_COOKIE);
  return token ? readAuthSessionEmail(token) : null;
}

/** Whether this request carries a live Google session at all (verified email or not). */
export function hasShareSession(req: Request): boolean {
  const token = cookieValue(req, SHARE_SESSION_COOKIE);
  return Boolean(token && readAuthSession(token));
}

/**
 * What this visitor may do on this share, or `null` when the audience shuts them out.
 * `anyone_with_link` is the link's own access, unchanged.
 */
export function shareViewerAccess(req: Request, project: ProjectRow): ShareAccess | null {
  const linkAccess = project.share_access as ShareAccess;
  if (project.share_audience !== 'listed_people') return linkAccess;
  const email = sessionVerifiedEmail(req);
  const member = email ? findShareMember(project.id, email) : undefined;
  if (member) return capShareAccess(linkAccess, member.role);
  if (req.shareStaffVerified === true) return linkAccess;
  return null;
}

/** Token only (sign-in routes and the neutral header). `req.shareAccess` is the link's access. */
export function requireShareToken(req: Request, res: Response, next: NextFunction): void {
  const project = resolveShareProject(req.params.token);
  if (!project) {
    shareNotFound(res);
    return;
  }
  req.projectId = project.id;
  req.shareAccess = project.share_access as ShareAccess;
  next();
}

/** Token plus audience: every data route. `req.shareAccess` is the visitor's effective access. */
export function requireShare(req: Request, res: Response, next: NextFunction): void {
  const project = resolveShareProject(req.params.token);
  const access = project ? shareViewerAccess(req, project) : null;
  if (!project || !access) {
    shareNotFound(res);
    return;
  }
  req.projectId = project.id;
  req.shareAccess = access;
  next();
}
