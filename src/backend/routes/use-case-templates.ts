/**
 * UseCaseTemplate routes, mounted at `/api/use-case-templates` (global, not project-scoped — the
 * library is shared across clients, D-06). `GET`/`:id` are read-only (T-1-07); `import/preview`,
 * `import/apply`, `export.json` and `DELETE /:id` are the library format's write surface (T-3-06,
 * D-47, D-22). Never wrapped in `runWithActor`/`change_log` — template edits are library
 * maintenance, not a project change (D-44).
 */
import { Router, type Request, type Response } from 'express';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { previewUseCaseLibrary, applyUseCaseLibrary, exportUseCaseLibrary } from '../services/useCaseLibraryImport.service';
import { handleRouteError } from './routeErrors';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseTemplateDAL.listUseCaseTemplates());
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/export.json', (_req: Request, res: Response) => {
  try {
    res.status(200).json(exportUseCaseLibrary());
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/import/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewUseCaseLibrary(req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

interface ApplyBody {
  payload: unknown;
  payload_hash: string;
  selected_item_ids: string[];
}

function parseApplyBody(req: Request): ApplyBody {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    payload: body.payload,
    payload_hash: typeof body.payload_hash === 'string' ? body.payload_hash : '',
    selected_item_ids: Array.isArray(body.selected_item_ids) ? (body.selected_item_ids as string[]) : [],
  };
}

router.post('/import/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res.status(200).json(applyUseCaseLibrary(payload, payload_hash, selected_item_ids));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(UseCaseTemplateDAL.getUseCaseTemplateOrThrow(req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    UseCaseTemplateDAL.deleteUseCaseTemplate(req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
