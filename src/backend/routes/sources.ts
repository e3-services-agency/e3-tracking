import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import * as SourceDAL from '../dal/source.dal';
import { ConflictError, DatabaseError } from '../errors';

const router = Router();

router.get('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: 'Workspace context required.',
      code: 'WORKSPACE_REQUIRED',
    });
    return;
  }

  try {
    const sources = await SourceDAL.listSources(workspaceId);
    res.status(200).json(sources);
  } catch (err) {
    if (err instanceof DatabaseError) {
      res.status(500).json({
        error: err.message,
        code: err.code,
      });
      return;
    }
    res.status(500).json({
      error: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
    });
  }
});

router.post('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: 'Workspace context required.',
      code: 'WORKSPACE_REQUIRED',
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const color =
    typeof body.color === 'string'
      ? body.color.trim() || null
      : body.color === null || typeof body.color === 'undefined'
        ? null
        : undefined;

  if (!name) {
    res.status(400).json({
      error: 'Source name is required.',
      code: 'NAME_REQUIRED',
      field: 'name',
    });
    return;
  }

  if (typeof color === 'undefined') {
    res.status(400).json({
      error: 'color must be a string when provided.',
      code: 'COLOR_INVALID',
      field: 'color',
    });
    return;
  }

  try {
    const source = await SourceDAL.createSource(workspaceId, { name, color });
    res.status(201).json(source);
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: err.message,
        code: err.code,
      });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({
        error: err.message,
        code: err.code,
      });
      return;
    }
    res.status(500).json({
      error: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
    });
  }
});

export default router;
