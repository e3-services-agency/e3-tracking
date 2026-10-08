import { publicFindingHistory } from '../services/qaReports.service';
/**
 * Finding routes (T-1-09, plan "API shape"), mounted at `/api/projects/:projectId/findings`: list
 * with filters (`comparison`, `kind`, `severity`, `event_id`, `status`); `PATCH /:id` (T-2-09) lets
 * a person manually resolve or reopen one finding (D-21's lifecycle stays "no manual mute" -- see
 * `finding.dal.ts`'s `setFindingStatus` for the exact rule against recompute reopening it).
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
        qa_run_id: stringParam(req.query.qa_run_id),
      })
    );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id/history',(req,res)=>{try{res.json(publicFindingHistory(req.projectId!,req.params.id,false));}catch(err){handleRouteError(err,res);}});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(FindingDAL.getFindingOrThrow(req.projectId!, req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const status = (req.body as Record<string, unknown>)?.status;
  if (status !== 'resolved' && status !== 'open') {
    res.status(400).json({ error: "status must be 'resolved' or 'open'.", code: 'STATUS_INVALID', field: 'status' });
    return;
  }
  try {
    res.status(200).json(FindingDAL.setFindingStatus(req.projectId!, req.params.id, status));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
