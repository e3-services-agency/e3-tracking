/**
 * Public share-link routes (D-48, T-4-01), mounted at `/api/shared` in `app.ts`, ahead of
 * `optionalAuth`/`express.json` so a share visitor needs no auth header and no request body. Every
 * route below requires `requireShare` (token lookup + timing-safe compare, 404 `SHARE_NOT_FOUND`
 * for unknown/revoked); anything not matched here also 404s the same way, never leaking whether a
 * path "would have" worked with a valid token.
 *
 * - `GET /:token` -- project header (name, client name, access, when the link was generated).
 * - `GET /:token/tracking-document.json` -- the same builder as the internal
 *   `GET /api/projects/:id/export/tracking-document.json` (`?version=` honoured the same way);
 *   contains no `internal_notes`/`internal_url` (those fields don't exist anywhere yet, T-4-08 adds
 *   them to templates/use cases and keeps them out of this document per its own plan section).
 * - `GET /:token/documentation.html` -- the same HTML export as the internal route.
 * - `GET /:token/files/*` -- the same decode/traversal checks as `routes/files.ts`, scoped to this
 *   token's project via `openForProject`.
 *
 * `POST`/`PATCH`/`DELETE /api/projects/:id/share` (create/rotate, change access, revoke) are
 * internal, authenticated routes in `routes/projects.ts`, not here.
 */
import { Router, type Request, type Response } from 'express';
import { requireShare } from '../middleware/share';
import { getProjectWithClient } from '../dal/project.dal';
import { buildTrackingDocument } from '../services/document.service';
import { generateProjectDocumentationHtml } from '../services/export.service';
import { getFileStore } from '../files/FileStore';
import { TRACKING_DOCUMENT_VERSION } from '../../domain/document/trackingDocument';
import { BadRequestError } from '../errors';
import { handleRouteError } from './routeErrors';

const router = Router();

router.get('/:token', requireShare, (req: Request, res: Response) => {
  try {
    const project = getProjectWithClient(req.projectId!);
    res.status(200).json({
      project: { name: project.name },
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
    res.status(200).json(buildTrackingDocument(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:token/documentation.html', requireShare, async (req: Request, res: Response) => {
  try {
    const html = await generateProjectDocumentationHtml(req.projectId!);
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
  res.status(404).json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' });
});

export default router;
