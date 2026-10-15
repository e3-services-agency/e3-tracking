import { publicFindingHistory } from '../services/qaReports.service';
/**
 * Finding routes (T-1-09, plan "API shape"), mounted at `/api/projects/:projectId/findings`: list
 * with filters (`comparison`, `kind`, `severity`, `event_id`, `status`); `PATCH /:id` (T-2-09) lets
 * a person manually resolve or reopen one finding (D-21's lifecycle stays "no manual mute" -- see
 * `finding.dal.ts`'s `setFindingStatus` for the exact rule against recompute reopening it).
 *
 * D-89 (T-5-47): every row carries the derived `priority`, `priority_rank` and `priority_reasons`.
 * The list is ordered by `priority_rank` (`?sort=priority`, the default) or by the older severity
 * then `last_seen_at DESC` order (`?sort=severity`), and `?priority=P1,P2` keeps only those
 * priorities. An unknown `sort` or `priority` value is a 400.
 */
import { Router, type Request, type Response } from 'express';
import * as FindingDAL from '../dal/finding.dal';
import { parseFindingPriorityFilter } from '../../domain/findingPriority';
import { filterByFindingPriority, loadFindingPriorityContext, sortByFindingPriority, withFindingPriority } from '../services/findingPriority.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

function stringParam(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

const SORTS = ['priority', 'severity'] as const;

router.get('/', (req: Request, res: Response) => {
  const sort = stringParam(req.query.sort) ?? 'priority';
  if (!(SORTS as readonly string[]).includes(sort)) {
    res.status(400).json({ error: "sort must be 'priority' or 'severity'.", code: 'SORT_INVALID', field: 'sort' });
    return;
  }
  let priorities: ReturnType<typeof parseFindingPriorityFilter>;
  try {
    const raw = req.query.priority;
    priorities = parseFindingPriorityFilter(typeof raw === 'string' || Array.isArray(raw) ? (raw as string[] | string) : undefined);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, code: 'PRIORITY_INVALID', field: 'priority' });
    return;
  }
  try {
    const rows = FindingDAL.listFindings(req.projectId!, {
      comparison: stringParam(req.query.comparison),
      kind: stringParam(req.query.kind),
      severity: stringParam(req.query.severity),
      event_id: stringParam(req.query.event_id),
      status: stringParam(req.query.status),
      qa_run_id: stringParam(req.query.qa_run_id),
    });
    const prioritised = filterByFindingPriority(withFindingPriority(rows, loadFindingPriorityContext(req.projectId!)), priorities);
    res.status(200).json(sort === 'priority' ? sortByFindingPriority(prioritised) : prioritised);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id/history',(req,res)=>{try{res.json(publicFindingHistory(req.projectId!,req.params.id,false));}catch(err){handleRouteError(err,res);}});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const finding = FindingDAL.getFindingOrThrow(req.projectId!, req.params.id);
    res.status(200).json(withFindingPriority([finding], loadFindingPriorityContext(req.projectId!))[0]);
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
