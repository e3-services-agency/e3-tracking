/**
 * Finding routes (T-1-09, plan "API shape"), mounted at `/api/projects/:projectId/findings`: list
 * with filters (`comparison`, `kind`, `severity`, `event_id`, `status`).
 */
import { Router, type Request, type Response } from 'express';
import * as FindingDAL from '../dal/finding.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function stringParam(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(
      FindingDAL.listFindings(req.projectId!, {
        comparison: stringParam(req.query.comparison),
        kind: stringParam(req.query.kind),
        severity: stringParam(req.query.severity),
        event_id: stringParam(req.query.event_id),
        status: stringParam(req.query.status),
      })
    );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(FindingDAL.getFindingOrThrow(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
