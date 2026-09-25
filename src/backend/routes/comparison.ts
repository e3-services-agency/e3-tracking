/**
 * Comparison routes (T-1-09, plan "API shape"; T-2-04 generalizes to the orchestrator), mounted at
 * `/api/projects/:projectId/comparison`: `POST /run` recomputes every comparison engine
 * (`comparison.service.ts`'s `runComparison`, D-21) and returns `{open, produced, resolved,
 * by_comparison}`.
 */
import { Router, type Request, type Response } from 'express';
import { runComparison } from '../services/comparison.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

/**
 * `scope: {event?, qa_run_id?}` is accepted for forward compatibility with the plan's API table
 * but does not narrow the recompute — every comparison always runs over the whole project (D-21);
 * see `comparison.service.ts`'s top comment.
 */
router.post('/run', (req: Request, res: Response) => {
  try {
    res.status(200).json(runComparison(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
