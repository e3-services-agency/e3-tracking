/**
 * Client API routes (D-27). `GET/POST /api/clients`, `PATCH/DELETE /api/clients/:id`.
 * Local auth mode: every request is the local admin (D-13), so no membership check here.
 */
import { Router, type Request, type Response } from 'express';
import * as ClientDAL from '../dal/client.dal';
import { handleRouteError as handleError } from './routeErrors';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    res.status(200).json(ClientDAL.listClients());
  } catch (err) {
    handleError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!key) {
    res.status(400).json({ error: 'key is required.', code: 'KEY_REQUIRED', field: 'key' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const client = ClientDAL.createClient({
      key,
      name,
      bloomreach_account_id:
        typeof body.bloomreach_account_id === 'string' ? body.bloomreach_account_id : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    res.status(201).json(client);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  try {
    const client = ClientDAL.updateClient(req.params.id, {
      key: typeof body.key === 'string' ? body.key : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      bloomreach_account_id:
        body.bloomreach_account_id === undefined
          ? undefined
          : (body.bloomreach_account_id as string | null),
      notes: body.notes === undefined ? undefined : (body.notes as string | null),
    });
    res.status(200).json(client);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    ClientDAL.deleteClient(req.params.id);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
