/**
 * Stub for routes whose backing tables/DAL were removed with the pre-SQLite schema (D-18):
 * journeys, the old QA overlay/runs, and metrics. T-1-01's fresh schema never created their
 * tables, so there is nothing to port (T-1-02 scope note); T-1-03 removes the remaining
 * frontend code paths. Every method on every sub-path replies with the same 501 envelope so the
 * frontend can fail soft instead of getting an unhandled 404/500.
 */
import { Router, type Request, type Response } from 'express';

export function removedRouter(task: 'T-1-03' | 'T-1-05'): Router {
  const router = Router({ mergeParams: true });
  router.all('*', (_req: Request, res: Response) => {
    res.status(501).json({ code: 'REMOVED_PENDING', task });
  });
  return router;
}
