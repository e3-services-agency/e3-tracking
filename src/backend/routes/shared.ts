/**
 * Public share-link routes (D-48, T-4-01), mounted at `/api/shared` in `app.ts`, ahead of
 * `optionalAuth`/`express.json` so a share visitor needs no auth header and no request body. Every
 * route below requires `requireShare` (token lookup + timing-safe compare, 404 `SHARE_NOT_FOUND`
 * for unknown/revoked); anything not matched here also 404s the same way, never leaking whether a
 * path "would have" worked with a valid token.
 *
 * - `GET /:token` -- project header (name, client name, access, when the link was generated).
 * - `GET /:token/tracking-document.json` -- the same builder as the internal
 *   `GET /api/projects/:id/export/tracking-document.json` (`?version=` honoured the same way), run
 *   through `toPublicTrackingDocument` (D-48 amendment): `agent_instructions`, `owners`,
 *   `identity_note`, `bloomreach_project_url` and any `internal_*` field are stripped;
 *   `not_suitable_for` stays.
 * - `GET /:token/documentation.html` -- the same HTML export as the internal route, generated with
 *   `{ public: true }` (same field set stripped).
 * - `GET /:token/files/*` -- the same decode/traversal checks as `routes/files.ts`, scoped to this
 *   token's project via `openForProject`.
 * - `GET /:token/comments` / `POST /:token/comments` (D-49 amendment, T-4-04): the public counterpart
 *   of `routes/comments.ts`. Comments are one shared thread (D-49 amendment, fix round): `GET`
 *   returns every comment on the anchor, posted internally or through this same link alike -- an
 *   internal reply IS visible through the share link by design; a private note belongs in one of the
 *   internal-only fields the tracking document's public projection strips (`identity_note`,
 *   `owners`, `agent_instructions`, ...), never in a comment. `GET` lists (optionally filtered by
 *   `entity_type`/`entity_id`, same query params as the internal route) through `toPublicComment`
 *   (drops `project_id` and `resolved_by` -- internal ids/actor names -- and `resolved_at`, which is
 *   internal triage state a client has no use for; `via_share` stays, so the internal Comments page
 *   and panels can still tell a share-posted comment apart from one posted internally). `POST`
 *   accepts only `entity_type`/`entity_id`/`author_name`/`body` -- any other key (most importantly `resolved`) is
 *   400 `FIELD_NOT_ALLOWED`, before any other validation; `req.shareAccess !== 'comment'` is 403
 *   `SHARE_READ_ONLY`; a per-token limit of 60 posts per 10 minutes (in-memory, reset on process
 *   restart) is 429 `RATE_LIMITED` -- a cheap guard only, phase 5 (real hosting) replaces it with
 *   actual rate limiting. The anchor (`entity_type`/`entity_id`) is validated the same way the
 *   internal route validates it (`comment.dal.ts#createComment`'s `assertEntityExists`, scoped to
 *   this token's own project via `requireShare`'s `req.projectId`), so a comment can never attach to
 *   another project's entity. Every created comment carries `via_share: true`.
 *
 * D-48 amendment (fix round, 2026-09-28 reviewer FAIL): every response here carries
 * `Cache-Control: no-store` (a token-bearing URL must never be cached by a browser or proxy), and
 * every error reaching this router -- including a `URIError` thrown by Express's own `:token`/`*`
 * param decoding on a malformed percent-escape, before `requireShare` or any handler runs -- is
 * mapped to the exact same 404 `SHARE_NOT_FOUND` body as an unknown token, via the router-level
 * error handler at the bottom of this file. The global `app.ts` error handler also stopped emitting
 * `stack` outside `NODE_ENV=development`, so this is defence in depth, not the only fix.
 *
 * `POST`/`PATCH`/`DELETE /api/projects/:id/share` (create/rotate, change access, revoke) are
 * internal, authenticated routes in `routes/projects.ts`, not here.
 */
import { resolveCommentParticipant, publicParticipant, existingCommentParticipantId } from '../services/commentParticipant';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { requireShare } from '../middleware/share';
import { getProjectWithClient } from '../dal/project.dal';
import { buildTrackingDocument, toPublicTrackingDocument } from '../services/document.service';
import { generateProjectDocumentationHtml } from '../services/export.service';
import { getFileStore } from '../files/FileStore';
import { TRACKING_DOCUMENT_VERSION } from '../../domain/document/trackingDocument';
import { BadRequestError, FieldNotAllowedError, RateLimitedError, ShareReadOnlyError, ValidationError } from '../errors';
import { handleRouteError } from './routeErrors';
import * as CommentDAL from '../dal/comment.dal';
import * as ProjectDAL from '../dal/project.dal';
import type { CommentRow } from '../dal/comment.dal';
import { attachReactions, listReactionSummaries, toggleReaction } from '../dal/comment-reaction.dal';
import * as AttachmentDAL from '../dal/comment-attachment.dal';
import { addCommentAttachment } from '../services/commentAttachments.service';
import { singleImageUpload, requireUploadedFile } from './commentAttachments';

const router = Router();

function shareNotFound(res: Response): void {
  res.status(404).json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' });
}

// D-48 amendment: no caching of a token-bearing URL anywhere in the chain, on every response
// (including error responses below).
router.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.get('/:token', requireShare, (req: Request, res: Response) => {
  try {
    const project = getProjectWithClient(req.projectId!);
    res.status(200).json({
      // T-4-03: `client_logo_path` is additive, resolved by the caller through this same token's
      // `/:token/files/*` route (a project logo is stored the same way a trigger screenshot is,
      // D-14); `null` when the project has none.
      project: { name: project.name, client_logo_path: project.client_logo_path },
      client: { name: project.client?.name ?? null },
      access: req.shareAccess,
      require_name: project.share_require_name,
      generated_at: project.share_created_at,
    });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:token/identity', requireShare, (req: Request, res: Response) => {
  try { res.json(publicParticipant(resolveCommentParticipant(req, res))); } catch (err) { handleRouteError(err, res); }
});

router.get('/:token/tracking-document.json', requireShare, (req: Request, res: Response) => {
  try {
    const requestedVersion = req.query.version !== undefined ? Number(req.query.version) : TRACKING_DOCUMENT_VERSION;
    if (!Number.isInteger(requestedVersion) || requestedVersion !== TRACKING_DOCUMENT_VERSION) {
      throw new BadRequestError(
        `Unsupported tracking document version "${String(req.query.version)}"; only version ${TRACKING_DOCUMENT_VERSION} is available.`,
        'version'
      );
    }
    res.status(200).json(toPublicTrackingDocument(buildTrackingDocument(req.projectId!)));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:token/documentation.html', requireShare, async (req: Request, res: Response) => {
  try {
    const html = await generateProjectDocumentationHtml(req.projectId!, { public: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    handleRouteError(err, res);
  }
});

// Same decode/traversal checks as `routes/files.ts`'s `GET /*` -- kept identical deliberately so a
// future fix to one is easy to port to the other (T-4-01 plan: "same decode and traversal checks").
router.get('/:token/files/*', requireShare, async (req: Request, res: Response) => {
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(req.params[0] ?? '');
  } catch {
    res.status(400).json({ error: 'Invalid file path.', code: 'INVALID_PATH' });
    return;
  }
  const isAbsolute = /^(?:[a-zA-Z]:)?[\\/]/.test(relativePath);
  const rawSegments = relativePath.split(/[\\/]/);
  if (isAbsolute || rawSegments.some((s) => s === '..' || s === '.')) {
    res.status(400).json({ error: 'Invalid file path.', code: 'INVALID_PATH' });
    return;
  }
  // T-5-04 review fix: every decision below is made on the normalised path, never the raw string.
  // An empty segment (`<project>//comments/...`) is refused outright, and the comments prefix is
  // matched case-insensitively (a case-insensitive filesystem would otherwise still open the file).
  if (rawSegments.some((s) => s === '')) {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
    return;
  }
  const normalised = rawSegments.join('/');
  if (rawSegments[0] !== req.projectId) {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
    return;
  }
  // T-5-04 (D-70): a comment image is served only when its comment is visible to this link (not
  // internal_only, and the project's share_comments rule); anything else is the same 404 as a
  // missing file. A `<project>/comments/...` path with no attachment row is never served.
  if (rawSegments[1]?.toLowerCase() === 'comments') {
    const attachment = AttachmentDAL.getAttachmentByPath(req.projectId!, normalised);
    const visible = attachment ? isCommentVisibleToLink(req.projectId!, attachment.comment_id) : false;
    if (!visible) {
      res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
      return;
    }
  }
  try {
    const opened = await getFileStore().openForProject(req.projectId!, normalised);
    res.setHeader('Content-Type', opened.mime);
    res.status(200).send(opened.buffer);
  } catch {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
  }
});

/** A shared comment target and its root must both be public. Replies may have their own private
 * flag (for example after a staff visibility change or backup restore), independently of the root. */
function isCommentVisibleToLink(projectId: string, commentId: string): boolean {
  try {
    if (CommentDAL.getCommentOrThrow(projectId, commentId).internal_only) return false;
  } catch {
    return false;
  }
  const project = ProjectDAL.getProjectOrThrow(projectId);
  return CommentDAL.getShareVisibleRoot(projectId, commentId, project.share_comments) !== null;
}

/**
 * Strips fields a public commenter must never see (D-49 amendment, T-4-04): `project_id` (an
 * internal id, no use to a client), `resolved_by` (an internal actor's name) and `resolved_at`
 * (internal triage state -- whether the team marked it done is not this reader's business).
 * `via_share` stays -- not every comment reachable through this route was posted through a share
 * link (comments are one shared thread, D-49 amendment: an internal reply is visible here too), but
 * the flag itself is not private, and the internal Comments page and event/use-case panels still
 * want to tell a share-posted comment apart from one posted internally.
 */
function toPublicComment(
  comment: CommentRow
): Omit<
  CommentRow,
  'project_id' | 'resolved_by' | 'resolved_at' | 'internal_only' | 'status_changed_by' | 'status_changed_at' | 'participant_id'
> {
  const {
    participant_id: _participantId,
    project_id: _projectId,
    resolved_by: _resolvedBy,
    resolved_at: _resolvedAt,
    internal_only: _internalOnly,
    status_changed_by: _statusChangedBy,
    status_changed_at: _statusChangedAt,
    ...rest
  } = comment;
  return rest;
}

// D-49, T-4-04: a cheap in-memory sliding-window guard, 60 posts per 10 minutes per token. Reset on
// process restart; not shared across multiple server instances. Replaced by real rate limiting once
// the app is actually hosted (phase 5, D-48's phase 5 notes) -- this exists only so a stray script
// hammering a leaked link today cannot flood a project's comment list.
const COMMENT_RATE_LIMIT = 60;
const COMMENT_RATE_WINDOW_MS = 10 * 60 * 1000;
const commentPostTimestampsByToken = new Map<string, number[]>();

/**
 * Fix round (L3): every check also prunes *every* token's entry, not just the one being checked --
 * a filtered-to-empty entry is deleted outright rather than left as a stale empty array. Without
 * this, a rotated or revoked token's last few post timestamps would sit in the map forever (nothing
 * else ever revisits that key once the token stops being used), a slow, unbounded leak over a long
 * server lifetime.
 */
function pruneExpiredCommentRateLimitEntries(cutoff: number): void {
  for (const [tok, timestamps] of commentPostTimestampsByToken) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      commentPostTimestampsByToken.delete(tok);
    } else if (filtered.length !== timestamps.length) {
      commentPostTimestampsByToken.set(tok, filtered);
    }
  }
}

function checkCommentRateLimit(token: string): void {
  const now = Date.now();
  const cutoff = now - COMMENT_RATE_WINDOW_MS;
  pruneExpiredCommentRateLimitEntries(cutoff);
  const existing = commentPostTimestampsByToken.get(token) ?? [];
  if (existing.length >= COMMENT_RATE_LIMIT) {
    throw new RateLimitedError('Too many comments posted through this link recently; try again later.');
  }
  existing.push(now);
  commentPostTimestampsByToken.set(token, existing);
}

const COMMENT_POST_FIELDS = new Set(['entity_type', 'entity_id', 'author_name', 'body', 'parent_id']);

/** Same "present but not a string" guard as `routes/comments.ts`'s own `stringOrUndefined`. */
function stringOrUndefined(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${key} must be a string.`, key);
  }
  return value;
}

router.get('/:token/comments', requireShare, (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id } = req.query;
    if (entity_type !== undefined && typeof entity_type !== 'string') {
      throw new ValidationError('entity_type must be a single string value.', 'entity_type');
    }
    if (entity_id !== undefined && typeof entity_id !== 'string') {
      throw new ValidationError('entity_id must be a single string value.', 'entity_id');
    }
    // D-49 amendment 2 (T-4-10): enforced here, server-side. Internal-only rows never leave; a
    // `via_share_only` link additionally hides comments posted internally.
    const project = ProjectDAL.getProjectOrThrow(req.projectId!);
    // Replies inherit the root's internal_only, so dropping internal rows drops their replies too.
    // The share_comments rule applies to roots: a kept root keeps all of its (non-internal) replies.
    let comments = CommentDAL.listComments(req.projectId!, {
      entity_type: entity_type as string | undefined,
      entity_id: entity_id as string | undefined,
      excludeInternalOnly: true,
    });
    const keptRoots = new Set(
      comments.filter((c) => !c.parent_id && CommentDAL.isRootShareVisible(c, project.share_comments)).map((c) => c.id)
    );
    comments = comments.filter((c) => keptRoots.has(c.parent_id ?? c.id));
    const viewerId = existingCommentParticipantId(req) ?? 'unidentified-viewer';
    const attachments = AttachmentDAL.listAttachmentsByComment(req.projectId!, comments.map((c) => c.id));
    res.status(200).json(
      attachReactions(
        req.projectId!,
        comments.map((c) => ({ ...toPublicComment(c), attachments: (attachments.get(c.id) ?? []).map(AttachmentDAL.toPublicAttachment) })),
        undefined, viewerId
      )
    );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:token/comments', express.json({ limit: '20kb' }), requireShare, (req: Request, res: Response) => {
  try {
    if (req.shareAccess !== 'comment') {
      throw new ShareReadOnlyError('This share link is read-only; comments cannot be posted through it.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const unknownField = Object.keys(body).find((key) => !COMMENT_POST_FIELDS.has(key));
    if (unknownField !== undefined) {
      throw new FieldNotAllowedError(`"${unknownField}" is not accepted on this route.`, unknownField);
    }
    checkCommentRateLimit(req.params.token);
    const participant = resolveCommentParticipant(req, res, body.author_name, ProjectDAL.getProjectOrThrow(req.projectId!).share_require_name);

    const entityType = stringOrUndefined(body, 'entity_type');
    const entityId = stringOrUndefined(body, 'entity_id');
    const commentBody = stringOrUndefined(body, 'body');
    const parentId = stringOrUndefined(body, 'parent_id');
    if (parentId !== undefined && !isCommentVisibleToLink(req.projectId!, parentId)) {
      shareNotFound(res);
      return;
    }

    const comment = CommentDAL.createComment(req.projectId!, {
      entity_type: entityType ?? '',
      entity_id: entityId ?? '',
      author_name: participant.name,
      participant_id: participant.id,
      author_kind: participant.kind,
      avatar_url: participant.avatar_url,
      body: commentBody ?? '',
      via_share: true,
      parent_id: parentId ?? null,
    });
    res.status(201).json(toPublicComment(comment));
  } catch (err) {
    handleRouteError(err, res);
  }
});

// D-70 item 4, T-5-04: image upload for a comment. Comment access only; the target comment must be
// visible to this link, posted through a share link and at most 15 minutes old (a visitor can add
// screenshots to the comment they just wrote, not to someone else's or an old one). Per-token limits:
// 60 uploads per 10 minutes and 200 MB per rolling 24 hours (in-memory, like the post limit).
const UPLOAD_DAILY_BYTES = 200 * 1024 * 1024;
const UPLOAD_DAY_MS = 24 * 60 * 60 * 1000;
const ATTACH_WINDOW_MS = 15 * 60 * 1000;
const uploadTimestampsByToken = new Map<string, number[]>();
const uploadBytesByToken = new Map<string, { at: number; bytes: number }[]>();

function checkUploadLimits(token: string, incomingBytes: number): void {
  const now = Date.now();
  const recent = (uploadTimestampsByToken.get(token) ?? []).filter((t) => t > now - COMMENT_RATE_WINDOW_MS);
  const day = (uploadBytesByToken.get(token) ?? []).filter((e) => e.at > now - UPLOAD_DAY_MS);
  const used = day.reduce((sum, e) => sum + e.bytes, 0);
  if (recent.length >= COMMENT_RATE_LIMIT || used + incomingBytes > UPLOAD_DAILY_BYTES) {
    uploadTimestampsByToken.set(token, recent);
    uploadBytesByToken.set(token, day);
    throw new RateLimitedError('Too many images uploaded through this link recently; try again later.');
  }
  recent.push(now);
  day.push({ at: now, bytes: incomingBytes });
  uploadTimestampsByToken.set(token, recent);
  uploadBytesByToken.set(token, day);
}

router.post(
  '/:token/comments/:commentId/attachments',
  requireShare,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.shareAccess !== 'comment') {
        throw new ShareReadOnlyError('This share link is read-only; images cannot be uploaded through it.');
      }
      next();
    } catch (err) {
      handleRouteError(err, res);
    }
  },
  singleImageUpload,
  async (req: Request, res: Response) => {
    try {
      const buffer = requireUploadedFile(req);
      const participant = resolveCommentParticipant(req, res);
      let comment: CommentRow | null = null;
      try {
        comment = CommentDAL.getCommentOrThrow(req.projectId!, req.params.commentId);
      } catch {
        comment = null;
      }
      if (
        !comment ||
        !comment.via_share ||
        (comment.participant_id !== null && comment.participant_id !== participant.id) ||
        !isCommentVisibleToLink(req.projectId!, comment.id) ||
        Date.now() - Date.parse(comment.created_at) > ATTACH_WINDOW_MS
      ) {
        res.status(404).json({ error: 'Comment not found.', code: 'NOT_FOUND' });
        return;
      }
      checkUploadLimits(req.params.token, buffer.length);
      const row = await addCommentAttachment(req.projectId!, comment.id, buffer);
      res.status(201).json(AttachmentDAL.toPublicAttachment(row));
    } catch (err) {
      handleRouteError(err, res);
    }
  }
);

// D-70, T-5-02: a comment-access link may set on_it/done on a comment it can see, never wont_do and
// never reopen (403 STATUS_NOT_ALLOWED). Same read-only gate, field whitelist and rate limit as posts.
router.patch('/:token/comments/:id/status', express.json({ limit: '2kb' }), requireShare, (req: Request, res: Response) => {
  try {
    if (req.shareAccess !== 'comment') {
      throw new ShareReadOnlyError('This share link is read-only; comments cannot be changed through it.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const unknownField = Object.keys(body).find((key) => key !== 'status' && key !== 'author_name');
    if (unknownField !== undefined) {
      throw new FieldNotAllowedError(`"${unknownField}" is not accepted on this route.`, unknownField);
    }
    checkCommentRateLimit(req.params.token);
    const project = ProjectDAL.getProjectOrThrow(req.projectId!);
    // Hidden, missing, other-project and reply ids all answer the identical SHARE_NOT_FOUND.
    const root = CommentDAL.getShareVisibleRoot(req.projectId!, req.params.id, project.share_comments);
    if (!root || root.id !== req.params.id) {
      shareNotFound(res);
      return;
    }
    const participant = resolveCommentParticipant(req, res, body.author_name, project.share_require_name);
    const status = stringOrUndefined(body, 'status') ?? '';
    const by = participant.name;
    const comment = CommentDAL.setCommentStatus(req.projectId!, req.params.id, status, by, { restricted: true });
    res.status(200).json(toPublicComment(comment));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:token/comments/:id/reactions', express.json({ limit: '2kb' }), requireShare, (req: Request, res: Response) => {
  try {
    if (req.shareAccess !== 'comment') {
      throw new ShareReadOnlyError('This share link is read-only; comments cannot be changed through it.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const unknownField = Object.keys(body).find((key) => key !== 'kind' && key !== 'author_name');
    if (unknownField !== undefined) {
      throw new FieldNotAllowedError(`"${unknownField}" is not accepted on this route.`, unknownField);
    }
    checkCommentRateLimit(req.params.token);
    const project = ProjectDAL.getProjectOrThrow(req.projectId!);
    if (!isCommentVisibleToLink(req.projectId!, req.params.id)) {
      shareNotFound(res);
      return;
    }
    const participant = resolveCommentParticipant(req, res, body.author_name, project.share_require_name);
    const result = toggleReaction(req.projectId!, req.params.id, body.kind, participant.name, { viaShare: true, participantId: participant.id });
    res.status(200).json({
      added: result.added,
      comment: toPublicComment(result.comment),
      reactions: listReactionSummaries(req.projectId!, [req.params.id], undefined, participant.id).get(req.params.id) ?? [],
    });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.all('*', (_req: Request, res: Response) => {
  shareNotFound(res);
});

// Router-level error handler (reviewer FAIL, ERROR 1, 2026-09-28 18:14): catches everything that
// reaches this router as an error, most importantly the `URIError` Express's own `Layer.match`
// throws while decoding `:token`/`*` for a malformed percent-escape (e.g. `%`, `%ZZ`, `%E0%A4%A`) --
// that happens during route matching, before `requireShare` or any handler above runs, so it would
// otherwise fall through to `app.ts`'s global handler as a 500 `INTERNAL_ERROR` with a stack trace.
// Every error here becomes the identical 404 `SHARE_NOT_FOUND` body an unknown token gets, so the
// public surface never distinguishes "malformed" from "doesn't exist".
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  shareNotFound(res);
});

export default router;
