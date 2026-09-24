/**
 * Project isolation middleware (D-15): replaces `requireWorkspace` / `x-workspace-id`.
 * Reads `:projectId` from the route path, verifies it is a non-deleted project, and sets
 * `req.projectId`. Membership: in local auth mode (D-13) the single local user is admin of
 * every project, so this only checks the project exists — a remote provider would add a
 * `project_members` lookup here.
 */
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';

declare global {
  namespace Express {
    interface Request {
      projectId?: string;
    }
  }
}

export function requireProject(req: Request, res: Response, next: NextFunction): void {
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Missing project id in path.', code: 'PROJECT_ID_REQUIRED' });
    return;
  }

  const row = getDb()
    .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(projectId) as { id: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Project not found.', code: 'NOT_FOUND', resource: 'project' });
    return;
  }

  req.projectId = projectId;
  next();
}
