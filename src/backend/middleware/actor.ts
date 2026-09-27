/**
 * Actor context middleware (D-44, T-3-01): wraps every request in `runWithActor` so DAL mutation
 * functions calling `getActor()` (via `change-log.dal.ts`'s `recordChange`) see `{actor:
 * req.userName, source: 'ui'}` without any route or DAL function threading a value through by
 * hand. Mounted right after `optionalAuth` in `src/backend/app.ts`, so `req.userName` is already
 * set (D-13).
 */
import type { Request, Response, NextFunction } from 'express';
import { runWithActor } from '../context/actor';

export function actorContext(req: Request, _res: Response, next: NextFunction): void {
  runWithActor({ actor: req.userName || 'system', source: 'ui' }, next);
}
