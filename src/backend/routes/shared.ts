/**
 * Public share-link routes (D-27 consequence, phase 4). The journey-scoped share mechanism is
 * gone (D-18); this stub keeps the route/path shape alive so phase 4 only has to implement the
 * handler, not re-plumb the mount. Every sub-path replies 404 `NOT_AVAILABLE_UNTIL_PHASE_4`.
 */
import { Router, type Request, type Response } from 'express';

const router = Router();

router.get('/:token/documentation.html', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Share links are not available until phase 4.', code: 'NOT_AVAILABLE_UNTIL_PHASE_4' });
});

router.all('*', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Share links are not available until phase 4.', code: 'NOT_AVAILABLE_UNTIL_PHASE_4' });
});

export default router;
