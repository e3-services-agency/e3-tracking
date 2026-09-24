/**
 * Property bundle routes, mounted at `/api/projects/:projectId/bundles` (D-26: kept as a shell
 * convenience).
 */
import { Router, type Request, type Response } from 'express';
import * as BundleDAL from '../dal/bundle.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(BundleDAL.listBundles(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as { name?: unknown; description?: unknown; property_ids?: unknown };
  try {
    const bundle = BundleDAL.createBundle(req.projectId!, {
      name: String(body.name ?? ''),
      description: typeof body.description === 'string' ? body.description : null,
      property_ids: Array.isArray(body.property_ids) ? (body.property_ids as string[]) : null,
    });
    res.status(201).json(bundle);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const body = req.body as { name?: unknown; description?: unknown; property_ids?: unknown };
  try {
    const bundle = BundleDAL.updateBundle(req.projectId!, req.params.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: 'description' in body ? (body.description as string | null) : undefined,
      property_ids: Array.isArray(body.property_ids) ? (body.property_ids as string[]) : undefined,
    });
    res.status(200).json(bundle);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    BundleDAL.deleteBundle(req.projectId!, req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
