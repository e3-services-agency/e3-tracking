import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { hasGuestSession, createGuestSession } from '../dal/comment-guest-session.dal';
import { ValidationError } from '../errors';
import { anonymousName, isGeneratedVisitorName, safeCommentAvatar, type CommentParticipantView } from '../../domain/commentIdentity';

/** Set only by middleware that verifies the staff/Google session, never from body/header claims. */
export interface VerifiedCommentParticipant {
  id: string;
  name: string;
  avatar_url?: string | null;
  verified: true;
  kind: 'google' | 'staff';
}
declare global {
  namespace Express { interface Request { commentParticipant?: VerifiedCommentParticipant } }
}
export interface ResolvedCommentParticipant extends CommentParticipantView { id: string }
const COOKIE = 'e3_comment_guest';
const SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const staffParticipantId = (userId: string): string => `staff:${digest(userId.trim().toLowerCase())}`;

function existingGuestSession(req: Request): string | undefined {
  const raw = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) && hasGuestSession(digest(raw), Date.now()) ? raw : undefined;
}
const scopedGuestId = (session: string, token: string): string => `guest:${digest(`${digest(session)}:${token}`)}`;
/** Reading comments must not race /identity by issuing a second initial guest cookie. */
export function existingCommentParticipantId(req: Request): string | undefined {
  if (req.commentParticipant) return req.commentParticipant.id;
  const session = existingGuestSession(req);
  return session ? scopedGuestId(session, req.params.token) : undefined;
}
function guestId(req: Request, res: Response): string {
  let session = existingGuestSession(req);
  if (!session) {
    session = randomBytes(32).toString('base64url');
    const now = Date.now();
    createGuestSession(digest(session), now + SESSION_AGE_MS, now);
    res.cookie(COOKIE, session, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_AGE_MS });
  }
  return scopedGuestId(session, req.params.token);
}

export function resolveCommentParticipant(req: Request, res: Response, requestedName?: unknown, requireName = false): ResolvedCommentParticipant {
  if (req.commentParticipant) {
    const verified = req.commentParticipant;
    return { id: verified.id, name: verified.name, kind: verified.kind, avatar_url: safeCommentAvatar(verified.avatar_url) ?? null, verified: true, name_chosen: true };
  }
  if (requestedName !== undefined && typeof requestedName !== 'string') throw new ValidationError('author_name must be a string.', 'author_name');
  const chosen = typeof requestedName === 'string' ? requestedName.trim() : '';
  if (chosen.length > 80) throw new ValidationError('author_name must be 80 characters or fewer.', 'author_name');
  if (chosen.toLowerCase() === 'share link') throw new ValidationError('"Share link" is reserved and cannot be used as a name.', 'author_name');
  const explicitlyChosen = !!chosen && !isGeneratedVisitorName(chosen);
  if (requireName && !explicitlyChosen) throw new ValidationError('Enter your name first.', 'author_name');
  const id = guestId(req, res);
  return { id, name: explicitlyChosen ? chosen : anonymousName(id), kind: 'guest', avatar_url: null, verified: false, name_chosen: explicitlyChosen };
}

export function publicParticipant(participant: ResolvedCommentParticipant): CommentParticipantView {
  const { id: _id, ...publicView } = participant;
  return publicView;
}
