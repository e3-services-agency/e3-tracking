/**
 * Property bundles CRUD. Requires `x-workspace-id` (see requireWorkspace).
 */
import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import * as BundleDAL from '../dal/bundle.dal';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from '../errors';

const router = Router();

router.get('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  try {
    const list = await BundleDAL.getBundlesByWorkspace(workspaceId);
    res.status(200).json(list);
  } catch (err) {
    console.error(err);
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.get('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const bundleId = req.params.id;
  try {
    const row = await BundleDAL.getBundleById(workspaceId, bundleId);
    if (!row) {
      res.status(404).json({ error: 'Bundle not found.', code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json(row);
  } catch (err) {
    console.error(err);
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.post('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  const description =
    typeof body.description === 'string' || body.description === null
      ? body.description
      : undefined;
  let property_ids: string[] | null | undefined;
  if (body.property_ids !== undefined) {
    if (!Array.isArray(body.property_ids)) {
      res.status(400).json({
        error: 'property_ids must be an array of strings when provided.',
        code: 'INVALID_PAYLOAD',
        field: 'property_ids',
      });
      return;
    }
    for (let i = 0; i < body.property_ids.length; i += 1) {
      if (typeof body.property_ids[i] !== 'string') {
        res.status(400).json({
          error: 'property_ids must be an array of strings.',
          code: 'INVALID_PAYLOAD',
          field: 'property_ids',
        });
        return;
      }
    }
    property_ids = [...new Set(body.property_ids.map((s) => String(s).trim()).filter(Boolean))];
  }

  try {
    const created = await BundleDAL.createBundle(workspaceId, {
      name,
      description: description === undefined ? undefined : description,
      property_ids: property_ids ?? null,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message, code: err.code, field: err.field });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.patch('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const bundleId = req.params.id;
  const body = req.body as Record<string, unknown>;
  const input: {
    name?: string;
    description?: string | null;
    property_ids?: string[] | null;
  } = {};

  if (typeof body.name === 'string') input.name = body.name;
  if (body.description !== undefined) {
    input.description =
      typeof body.description === 'string' || body.description === null ? body.description : null;
  }
  if (body.property_ids !== undefined) {
    if (!Array.isArray(body.property_ids)) {
      res.status(400).json({
        error: 'property_ids must be an array of strings when provided.',
        code: 'INVALID_PAYLOAD',
        field: 'property_ids',
      });
      return;
    }
    for (let i = 0; i < body.property_ids.length; i += 1) {
      if (typeof body.property_ids[i] !== 'string') {
        res.status(400).json({
          error: 'property_ids must be an array of strings.',
          code: 'INVALID_PAYLOAD',
          field: 'property_ids',
        });
        return;
      }
    }
    input.property_ids = [...new Set(body.property_ids.map((s) => String(s).trim()).filter(Boolean))];
  }

  if (Object.keys(input).length === 0) {
    res.status(400).json({ error: 'No valid fields to update.', code: 'NO_UPDATES' });
    return;
  }

  try {
    const updated = await BundleDAL.updateBundle(workspaceId, bundleId, input);
    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message, code: err.code, field: err.field });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.delete('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }
  const bundleId = req.params.id;
  try {
    await BundleDAL.deleteBundle(workspaceId, bundleId);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

export default router;
