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
import type { CommentRow } from '../dal/comment.dal';

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
      generated_at: project.share_created_at,
    });
  } catch (err) {
    handleRouteError(err, res);
  }
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
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (isAbsolute || segments.some((s) => s === '..' || s === '.')) {
    res.status(400).json({ error: 'Invalid file path.', code: 'INVALID_PATH' });
    return;
  }
  if (!relativePath.startsWith(`${req.projectId}/`)) {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
    return;
  }
  try {
    const opened = await getFileStore().openForProject(req.projectId!, relativePath);
    res.setHeader('Content-Type', opened.mime);
    res.status(200).send(opened.buffer);
  } catch {
    res.status(404).json({ error: 'File not found.', code: 'NOT_FOUND' });
  }
});

/**
 * Strips fields a public commenter must never see (D-49 amendment, T-4-04): `project_id` (an
 * internal id, no use to a client), `resolved_by` (an internal actor's name) and `resolved_at`
 * (internal triage state -- whether the team marked it done is not this reader's business).
 * `via_share` stays -- not every comment reachable through this route was posted through a share
 * link (comments are one shared thread, D-49 amendment: an internal reply is visible here too), but
 * the flag itself is not private, and the internal Comments page and event/use-case panels still
 * want to tell a share-posted comment apart from one posted internally.
 */
function toPublicComment(comment: CommentRow): Omit<CommentRow, 'project_id' | 'resolved_by' | 'resolved_at'> {
  const { project_id: _projectId, resolved_by: _resolvedBy, resolved_at: _resolvedAt, ...rest } = comment;
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

const COMMENT_POST_FIELDS = new Set(['entity_type', 'entity_id', 'author_name', 'body']);

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
    const comments = CommentDAL.listComments(req.projectId!, {
      entity_type: entity_type as string | undefined,
      entity_id: entity_id as string | undefined,
    });
    res.status(200).json(comments.map(toPublicComment));
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

    const entityType = stringOrUndefined(body, 'entity_type');
    const entityId = stringOrUndefined(body, 'entity_id');
    const authorName = stringOrUndefined(body, 'author_name');
    const commentBody = stringOrUndefined(body, 'body');

    const comment = CommentDAL.createComment(req.projectId!, {
      entity_type: entityType ?? '',
      entity_id: entityId ?? '',
      author_name: authorName ?? '',
      body: commentBody ?? '',
      via_share: true,
    });
    res.status(201).json(toPublicComment(comment));
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
