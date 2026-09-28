/**
 * Restore-a-backup-as-a-new-project routes (T-3-05, D-45), mounted at
 * `/api/projects/restore-backup` in `app.ts` -- unscoped (no `:projectId`, no `requireProject`),
 * since the whole point is that the target project does not exist yet. Given its own 100 MB
 * `express.json` limit in `app.ts` (a backup embeds base64 files and can be much larger than every
 * other Bloomreach paste box).
 */
import { Router, type Request, type Response } from 'express';
import { previewRestore, applyRestore } from '../services/backupRestore.service';
import { handleRouteError } from './routeErrors';

const router = Router();

router.post('/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewRestore(req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/apply', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const payloadHash = typeof body.payload_hash === 'string' ? body.payload_hash : '';
    const projectInput = (body.project ?? {}) as Record<string, unknown>;
    const result = await applyRestore(body.backup, payloadHash, {
      name: typeof projectInput.name === 'string' ? projectInput.name : '',
      key: typeof projectInput.key === 'string' ? projectInput.key : '',
      client_id: typeof projectInput.client_id === 'string' ? projectInput.client_id : '',
    });
    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
