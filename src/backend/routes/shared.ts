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
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireShare } from '../middleware/share';
import { getProjectWithClient } from '../dal/project.dal';
import { buildTrackingDocument, toPublicTrackingDocument } from '../services/document.service';
import { generateProjectDocumentationHtml } from '../services/export.service';
import { getFileStore } from '../files/FileStore';
import { TRACKING_DOCUMENT_VERSION } from '../../domain/document/trackingDocument';
import { BadRequestError } from '../errors';
import { handleRouteError } from './routeErrors';

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
