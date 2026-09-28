/**
 * Project API routes (replaces the pre-D-15 scope routes, D-15). `GET/POST /api/projects`,
 * `GET/PATCH/DELETE /api/projects/:id`. Project-scoped sub-routers (sources, properties, events,
 * catalogs, bundles, files) are mounted on `/api/projects/:projectId/...` in `app.ts`, guarded by
 * `requireProject`.
 */
import { Router, type Request, type Response } from 'express';
import * as ProjectDAL from '../dal/project.dal';
import { handleRouteError } from './routeErrors';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    res.status(200).json(ProjectDAL.listProjects());
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const client_id = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!client_id) {
    res.status(400).json({ error: 'client_id is required.', code: 'CLIENT_ID_REQUIRED', field: 'client_id' });
    return;
  }
  if (!key) {
    res.status(400).json({ error: 'key is required.', code: 'KEY_REQUIRED', field: 'key' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: 'name is required.', code: 'NAME_REQUIRED', field: 'name' });
    return;
  }
  try {
    const project = ProjectDAL.createProject({
      client_id,
      key,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      client_primary_color:
        typeof body.client_primary_color === 'string' ? body.client_primary_color : null,
      bloomreach_api_customer_id_key:
        typeof body.bloomreach_api_customer_id_key === 'string'
          ? body.bloomreach_api_customer_id_key
          : null,
      bloomreach_project_token:
        typeof body.bloomreach_project_token === 'string' ? body.bloomreach_project_token : null,
      bloomreach_api_base_url:
        typeof body.bloomreach_api_base_url === 'string' ? body.bloomreach_api_base_url : null,
      bloomreach_project_url:
        typeof body.bloomreach_project_url === 'string' ? body.bloomreach_project_url : null,
      default_expiration_json: body.default_expiration_json ?? null,
    });
    res.status(201).json(project);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    res.status(200).json(ProjectDAL.getProjectWithClient(req.params.id));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const pick = (key: string): string | null | undefined =>
    body[key] === undefined ? undefined : ((body[key] as string | null) ?? null);
  try {
    const project = ProjectDAL.updateProject(req.params.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      key: typeof body.key === 'string' ? body.key : undefined,
      client_id: typeof body.client_id === 'string' ? body.client_id : undefined,
      description: pick('description'),
      client_primary_color: pick('client_primary_color'),
      client_logo_path: pick('client_logo_path'),
      bloomreach_api_customer_id_key: pick('bloomreach_api_customer_id_key'),
      bloomreach_project_token: pick('bloomreach_project_token'),
      bloomreach_api_base_url: pick('bloomreach_api_base_url'),
      bloomreach_project_url: pick('bloomreach_project_url'),
      default_expiration_json:
        body.default_expiration_json === undefined ? undefined : body.default_expiration_json,
      consent_key_additions_json:
        body.consent_key_additions_json === undefined ? undefined : body.consent_key_additions_json,
      standard_event_additions_json:
        body.standard_event_additions_json === undefined ? undefined : body.standard_event_additions_json,
      money_tolerance_percent: typeof body.money_tolerance_percent === 'number' ? body.money_tolerance_percent : undefined,
      money_tolerance_floor: typeof body.money_tolerance_floor === 'number' ? body.money_tolerance_floor : undefined,
      industry: pick('industry'),
    });
    res.status(200).json(project);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    ProjectDAL.softDeleteProject(req.params.id);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

/** `url` built from the request's own origin (D-48: the frontend route is `/tracking-plan/shared/<token>`,
 * mounted at whatever host/port serves the SPA -- there is no separate "public base URL" setting). */
function shareUrl(req: Request, token: string): string {
  return `${req.protocol}://${req.get('host')}/tracking-plan/shared/${token}`;
}

function shareResponse(req: Request, project: ProjectDAL.ProjectRow) {
  return {
    share_token: project.share_token,
    share_access: project.share_access,
    share_created_at: project.share_created_at,
    url: project.share_token ? shareUrl(req, project.share_token) : null,
  };
}

router.get('/:id/share', (req: Request, res: Response) => {
  try {
    const project = ProjectDAL.getProjectOrThrow(req.params.id);
    res.status(200).json(shareResponse(req, project));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/:id/share', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const access = typeof body.access === 'string' ? body.access : 'read';
  const force = body.force === true || req.query.force === 'true';
  try {
    const project = ProjectDAL.createOrRotateShare(req.params.id, access, { force });
    res.status(201).json(shareResponse(req, project));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.patch('/:id/share', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const access = typeof body.access === 'string' ? body.access : '';
  try {
    const project = ProjectDAL.updateShareAccess(req.params.id, access);
    res.status(200).json(shareResponse(req, project));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:id/share', (req: Request, res: Response) => {
  try {
    const project = ProjectDAL.revokeShare(req.params.id);
    res.status(200).json(shareResponse(req, project));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;
