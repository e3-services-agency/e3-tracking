/**
 * Source routes, mounted at `/api/projects/:projectId/sources` behind `requireProject`.
 */
import { Router, type Request, type Response } from 'express';
import * as SourceDAL from '../dal/source.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(SourceDAL.listSources(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/usage', (req: Request, res: Response) => {
  try {
    res.status(200).json(SourceDAL.getSourceUsage(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as { name?: unknown; color?: unknown; system?: unknown; method?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const source = SourceDAL.createSource(req.projectId!, {
      name,
      color: typeof body.color === 'string' ? body.color : null,
      system: body.system as string | undefined,
      method: body.method as string | null | undefined,
    });
    res.status(201).json(source);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const body = req.body as { name?: unknown; color?: unknown; system?: unknown; method?: unknown };
  try {
    const source = SourceDAL.updateSource(req.projectId!, req.params.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      color: body.color === undefined ? undefined : (body.color as string | null),
      system: body.system as string | undefined,
      method: body.method === undefined ? undefined : (body.method as string | null),
    });
    res.status(200).json(source);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    SourceDAL.deleteSource(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
