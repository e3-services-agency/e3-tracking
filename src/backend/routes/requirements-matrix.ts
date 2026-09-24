/**
 * Computed requirements matrix route, mounted at `/api/projects/:projectId/requirements-matrix`
 * behind `requireProject` (T-1-07 acceptance capability 8; CONTEXT.md 3.2).
 */
import { Router, type Request, type Response } from 'express';
import { computeRequirementsMatrix } from '../services/requirements-matrix.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(computeRequirementsMatrix(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
