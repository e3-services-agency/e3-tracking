/**
 * Workspace API routes.
 * GET /api/workspaces — list (frontend uses Supabase + RLS for member-only list; this endpoint may be used with optional auth).
 * POST /api/workspaces — create workspace; requires auth; body: { name, cloneFromWorkspaceId? }. Creator is added as admin in workspace_members.
 * PATCH /api/workspaces/:id — update name and/or settings; requires auth + membership (admin for name/settings).
 * GET /api/workspaces/:id/members — list members; requires auth + membership.
 * POST /api/workspaces/:id/members — invite by email; requires auth + admin role; body: { email, role? }.
 */
import { Router, type Request, type Response } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth';
import * as WorkspaceDAL from '../dal/workspace.dal';
import { createWorkspace } from '../services/workspace.service';
import { DatabaseError, NotFoundError } from '../errors';

const router = Router();

/**
 * GET /api/workspaces
 * List all non-deleted workspaces.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const list = await WorkspaceDAL.listWorkspaces();
    res.status(200).json(list);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to list')) {
      res.status(500).json({
        error: 'Failed to list workspaces.',
        code: 'DATABASE_ERROR',
      });
      return;
    }
    res.status(500).json({
      error: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/workspaces
 * Create a new workspace. Requires auth. Body: { name: string, cloneFromWorkspaceId?: string }.
 * Creator is added as admin in workspace_members. Returns the newly created workspace row.
 */
router.post('/', optionalAuth, requireAuth, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: unknown; cloneFromWorkspaceId?: unknown; client_name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const cloneFromWorkspaceId =
    typeof body.cloneFromWorkspaceId === 'string' && body.cloneFromWorkspaceId.trim()
      ? body.cloneFromWorkspaceId.trim()
      : undefined;
  const client_name =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim()
      : undefined;

  if (!name) {
    res.status(400).json({
      error: 'Workspace name is required.',
      code: 'NAME_REQUIRED',
      field: 'name',
    });
    return;
  }

  const userId = req.userId ?? null;

  try {
    const workspace = await createWorkspace({ name, cloneFromWorkspaceId, client_name, userId });
    res.status(201).json(workspace);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({
        error: err.message,
        code: err.code,
        resource: err.resource,
      });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({
        error: err.message || 'Failed to create workspace.',
        code: err.code,
      });
      return;
    }
    if (err instanceof Error && err.message === 'Workspace name is required.') {
      res.status(400).json({
        error: err.message,
        code: 'NAME_REQUIRED',
      });
      return;
    }
    res.status(500).json({
      error: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/workspaces/:id
 * Returns workspace and settings. Requires auth + membership.
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.params.id;
  const userId = req.userId!;

  const member = await WorkspaceDAL.getWorkspaceMember(workspaceId, userId);
  if (!member) {
    res.status(403).json({ error: 'You are not a member of this workspace.', code: 'FORBIDDEN' });
    return;
  }

  try {
    const workspace = await WorkspaceDAL.getWorkspaceById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.', code: 'NOT_FOUND' });
      return;
    }
    const settings = await WorkspaceDAL.getWorkspaceSettings(workspaceId);
    res.status(200).json({ workspace, settings });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to')) {
      res.status(500).json({ error: err.message, code: 'DATABASE_ERROR' });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/workspaces/:id
 * Update workspace name and/or workspace_settings (client_primary_color, client_name, client_logo_url).
 * Requires auth; user must be a member (admin for name/settings).
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.params.id;
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;

  const member = await WorkspaceDAL.getWorkspaceMember(workspaceId, userId);
  if (!member) {
    res.status(403).json({ error: 'You are not a member of this workspace.', code: 'FORBIDDEN' });
    return;
  }
  if (member.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can update workspace settings.', code: 'FORBIDDEN' });
    return;
  }

  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const client_primary_color = typeof body.client_primary_color === 'string' ? body.client_primary_color.trim() || null : undefined;
  const client_name = typeof body.client_name === 'string' ? body.client_name.trim() || null : undefined;
  const client_logo_url = typeof body.client_logo_url === 'string' ? body.client_logo_url.trim() || null : undefined;
  const bloomreach_api_customer_id_key =
    typeof body.bloomreach_api_customer_id_key === 'string'
      ? body.bloomreach_api_customer_id_key.trim() || null
      : body.bloomreach_api_customer_id_key === null
        ? null
        : undefined;

  try {
    if (name !== undefined) {
      await WorkspaceDAL.updateWorkspace(workspaceId, { name });
    }
    if (
      client_primary_color !== undefined ||
      client_name !== undefined ||
      client_logo_url !== undefined ||
      bloomreach_api_customer_id_key !== undefined
    ) {
      await WorkspaceDAL.updateWorkspaceSettings(workspaceId, {
        client_primary_color: client_primary_color ?? undefined,
        client_name: client_name ?? undefined,
        client_logo_url: client_logo_url ?? undefined,
        bloomreach_api_customer_id_key: bloomreach_api_customer_id_key ?? undefined,
      });
    }
    const workspace = await WorkspaceDAL.getWorkspaceById(workspaceId);
    const settings = await WorkspaceDAL.getWorkspaceSettings(workspaceId);
    res.status(200).json({ workspace, settings });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to')) {
      res.status(500).json({ error: err.message, code: 'DATABASE_ERROR' });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/workspaces/:id/members
 * List workspace members. Requires auth + membership.
 */
router.get('/:id/members', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.params.id;
  const userId = req.userId!;

  const member = await WorkspaceDAL.getWorkspaceMember(workspaceId, userId);
  if (!member) {
    res.status(403).json({ error: 'You are not a member of this workspace.', code: 'FORBIDDEN' });
    return;
  }

  try {
    const members = await WorkspaceDAL.listWorkspaceMembers(workspaceId);
    res.status(200).json(members);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to')) {
      res.status(500).json({ error: err.message, code: 'DATABASE_ERROR' });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/workspaces/:id/members
 * Invite a user by email. Requires auth + admin role. Body: { email: string, role?: 'admin'|'member'|'viewer' }.
 */
router.post('/:id/members', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.params.id;
  const userId = req.userId!;
  const body = req.body as { email?: unknown; role?: unknown };

  const member = await WorkspaceDAL.getWorkspaceMember(workspaceId, userId);
  if (!member || member.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can invite members.', code: 'FORBIDDEN' });
    return;
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) {
    res.status(400).json({ error: 'Email is required.', code: 'EMAIL_REQUIRED', field: 'email' });
    return;
  }

  const role = (['admin', 'member', 'viewer'].includes(String(body.role)) ? body.role : 'member') as 'admin' | 'member' | 'viewer';

  try {
    const inviteeUserId = await WorkspaceDAL.getUserIdByEmail(email);
    if (!inviteeUserId) {
      res.status(404).json({ error: 'No user found with that email.', code: 'USER_NOT_FOUND' });
      return;
    }

    const existing = await WorkspaceDAL.getWorkspaceMember(workspaceId, inviteeUserId);
    if (existing) {
      res.status(409).json({ error: 'User is already a member of this workspace.', code: 'ALREADY_MEMBER' });
      return;
    }

    const added = await WorkspaceDAL.addWorkspaceMember(workspaceId, inviteeUserId, role);
    res.status(201).json(added);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to')) {
      res.status(500).json({ error: err.message, code: 'DATABASE_ERROR' });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

export default router;
