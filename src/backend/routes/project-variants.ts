/**
 * Read-only project-wide Variant listing, mounted at `/api/projects/:projectId/variants`
 * (fix round T-1-05 LOW 7): the Standard events page needs every variant's name across all
 * events to resolve `StandardEventMapping.variant_id` for display without one request per event.
 * Write operations stay under `/api/projects/:projectId/events/:id/variants` (`events.ts`) since a
 * variant is always created/edited in the context of its event.
 */
import { Router, type Request, type Response } from 'express';
import * as VariantDAL from '../dal/variant.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(VariantDAL.listVariantsByProject(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
