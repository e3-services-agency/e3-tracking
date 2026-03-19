/**
 * Journeys API routes.
 * Document-Relational Hybrid: canvas in JSONB; journey_events synced from trigger nodes.
 * All routes require workspace context (x-workspace-id).
 *
 * Mount this router at /api/journeys, e.g. app.use('/api/journeys', journeysRouter).
 */
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireWorkspace } from '../middleware/workspace';
import { requireAuth } from '../middleware/auth';
import * as JourneyDAL from '../dal/journey.dal';
import { getAlwaysSentPropertyKeysForEvent } from '../dal/event.dal';
import { getJourneyQARunsCountAndLatest, getJourneyQARuns, upsertJourneyQARuns } from '../dal/qa.dal';
import { generateJourneyHtmlExport } from '../services/export.service';
import { ConflictError, DatabaseError, NotFoundError, ConfigError } from '../errors';
import { getSupabaseOrThrow } from '../db/supabase';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * validatePayload(eventId, actualJson): checks that all always_sent property keys exist in actualJson.
 * actualJson: JSON string (will be parsed). Must be a JSON object (key/value).
 * Returns { valid: true } or { valid: false, missing_keys: string[] }.
 */
export async function validatePayload(
  workspaceId: string,
  eventId: string,
  actualJson: string
): Promise<{ valid: true } | { valid: false; missing_keys: string[] }> {
  const requiredKeys = await getAlwaysSentPropertyKeysForEvent(workspaceId, eventId);
  if (requiredKeys.length === 0) {
    return { valid: true };
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(actualJson);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, missing_keys: requiredKeys };
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return { valid: false, missing_keys: requiredKeys };
  }

  const actualKeys = new Set(Object.keys(parsed));
  const missing_keys = requiredKeys.filter((k) => !actualKeys.has(k));
  if (missing_keys.length === 0) {
    return { valid: true };
  }
  return { valid: false, missing_keys };
}

/**
 * GET /api/journeys
 * List journeys for the workspace.
 */
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
    const list = await JourneyDAL.listJourneys(workspaceId);

    // Homepage needs QA run count + latest run for derived status.
    // We intentionally load only the latest run + count (not all runs).
    const enriched = await Promise.all(
      list.map(async (j) => {
        try {
          const summary = await getJourneyQARunsCountAndLatest(
            workspaceId,
            j.id
          );
          return {
            ...j,
            qaRunsCount: summary.qaRunsCount,
            latestQARun: summary.latestQARun,
          };
        } catch (e) {
          // Keep journeys list usable even if QA summary fails.
          console.error('Failed to load QA summary for journey', j.id, e);
          return { ...j, qaRunsCount: 0, latestQARun: null };
        }
      })
    );

    res.status(200).json(enriched);
  } catch (err) {
    if (err instanceof DatabaseError) {
      res.status(500).json({
        error: 'Failed to list journeys.',
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

/**
 * POST /api/journeys/:id/images
 * Upload an image to Supabase Storage (service role). Returns { path, url }.
 */
router.post(
  '/:id/images',
  requireWorkspace,
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }
    const journeyId = req.params.id;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'file is required.', code: 'BAD_REQUEST' });
      return;
    }

    try {
      // Ensure journey exists in workspace (prevents writing orphaned paths).
      const journey = await JourneyDAL.getJourneyById(workspaceId, journeyId);
      if (!journey) {
        res.status(404).json({ error: 'Journey not found.', code: 'NOT_FOUND', resource: 'journey' });
        return;
      }

      const supabase = getSupabaseOrThrow();
      const safeName = (file.originalname || 'image')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9._-]/g, '');
      const objectPath = `workspaces/${workspaceId}/journeys/${journeyId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('journey-images')
        .upload(objectPath, file.buffer, {
          upsert: true,
          contentType: file.mimetype || 'application/octet-stream',
          cacheControl: '3600',
        });

      if (upErr) {
        res.status(500).json({ error: upErr.message, code: 'STORAGE_UPLOAD_FAILED' });
        return;
      }

      // Bucket is public (Option A): return a stable public URL for reuse in QA/export/docs.
      const { data: pub } = supabase.storage.from('journey-images').getPublicUrl(objectPath);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        res.status(500).json({ error: 'Failed to generate public URL.', code: 'STORAGE_URL_FAILED' });
        return;
      }
      res.status(200).json({
        path: objectPath,
        url: publicUrl,
      });
    } catch (err) {
      if (err instanceof ConfigError) {
        res.status(503).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({ error: 'Failed to upload image.', code: err.code });
        return;
      }
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      res.status(500).json({ error: msg, code: 'INTERNAL_ERROR' });
    }
  }
);

/**
 * GET /api/journeys/:id/images/:encodedPath
 * Streams a private storage object via service role.
 */
router.get(
  '/:id/images/:encodedPath',
  requireWorkspace,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }
    const journeyId = req.params.id;
    const encodedPath = req.params.encodedPath;
    let objectPath = '';
    try {
      objectPath = Buffer.from(encodedPath, 'base64url').toString('utf8');
    } catch {
      res.status(400).json({ error: 'Invalid image path.', code: 'BAD_REQUEST' });
      return;
    }

    // Basic guard: ensure path matches journey/workspace prefix we write.
    const expectedPrefix = `workspaces/${workspaceId}/journeys/${journeyId}/`;
    if (!objectPath.startsWith(expectedPrefix)) {
      res.status(403).json({ error: 'Forbidden.', code: 'FORBIDDEN' });
      return;
    }

    try {
      const supabase = getSupabaseOrThrow();
      const { data, error } = await supabase.storage.from('journey-images').download(objectPath);
      if (error || !data) {
        res.status(404).json({ error: 'Image not found.', code: 'NOT_FOUND' });
        return;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      res.setHeader('Content-Type', 'application/octet-stream');
      res.status(200).send(buf);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load image.', code: 'INTERNAL_ERROR' });
    }
  }
);

/**
 * DELETE /api/journeys/:id
 * Soft-deletes a journey (sets deleted_at).
 */
router.delete(
  '/:id',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    try {
      await JourneyDAL.deleteJourney(workspaceId, journeyId);
      res.status(204).send('');
    } catch (err) {
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to delete journey.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/journeys
 * Create a journey row for the workspace.
 * Body: { id: string, name: string }.
 */
router.post(
  '/',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const body = req.body as { id?: unknown; name?: unknown };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!id || !name) {
      res.status(400).json({
        error: 'id and name are required.',
        code: 'BAD_REQUEST',
      });
      return;
    }

    try {
      const created = await JourneyDAL.createJourney(workspaceId, id, name);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof ConflictError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
          details: err.details,
        });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to create journey.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * GET /api/journeys/:id/export/html
 * Generate standalone HTML implementation brief (steps, screenshots, tracking payloads).
 * Returns HTML with Content-Disposition: attachment.
 */
router.get(
  '/:id/export/html',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    try {
      const html = await generateJourneyHtmlExport(workspaceId, journeyId);
      const filename = 'journey-export.html';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.status(200).send(html);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({
          error: err.message,
          code: err.code,
          resource: err.resource,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/journeys/:id/share
 * Generate or retrieve share token. Returns { token: string }.
 * Requires workspace. Use token in URL: /share/:token
 */
router.post(
  '/:id/share',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    try {
      const token = await JourneyDAL.generateShareToken(workspaceId, journeyId);
      res.status(200).json({ token });
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
          error: 'Failed to generate share link.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * PATCH /api/journeys/:id/share
 * Enable/disable public sharing. Body: { enabled: boolean }.
 *
 * Implementation detail: share_token being non-null indicates sharing is enabled.
 */
router.patch(
  '/:id/share',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    const body = req.body as { enabled?: unknown };
    const enabled = body.enabled === true;
    try {
      if (enabled) {
        const token = await JourneyDAL.generateShareToken(workspaceId, journeyId);
        res.status(200).json({ enabled: true, token });
        return;
      }
      await JourneyDAL.setShareToken(workspaceId, journeyId, null);
      res.status(200).json({ enabled: false });
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
          error: 'Failed to update share settings.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * PUT /api/journeys/:id/qa
 * Persists QA runs + per-node verifications so shared URL can render QA.
 * Body: { qaRuns: Array<{ id: string; verifications?: Record<string, any> }> }
 */
router.put(
  '/:id/qa',
  requireWorkspace,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }

    const journeyId = req.params.id;
    const body = req.body as { qaRuns?: unknown };
    const qaRuns = Array.isArray(body.qaRuns) ? body.qaRuns : [];

    try {
      await upsertJourneyQARuns(workspaceId, journeyId, qaRuns as any);
      res.status(200).json({ success: true });
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
          error: 'Failed to save QA.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  },
);

/**
 * GET /api/journeys/:id/qa
 * Returns QA runs + verifications for this workspace.
 */
router.get(
  '/:id/qa',
  requireWorkspace,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
      return;
    }

    const journeyId = req.params.id;
    try {
      const qaRuns = await getJourneyQARuns(workspaceId, journeyId);
      res.status(200).json({ success: true, qaRuns });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code, resource: err.resource });
        return;
      }
      if (err instanceof DatabaseError) {
        res.status(500).json({ error: 'Failed to load QA.', code: err.code });
        return;
      }
      res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    }
  }
);

/**
 * GET /api/journeys/:id
 * Get one journey by id.
 */
router.get('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: 'Workspace context required.',
      code: 'WORKSPACE_REQUIRED',
    });
    return;
  }
  const journeyId = req.params.id;
  try {
    const journey = await JourneyDAL.getJourneyById(workspaceId, journeyId);
    if (journey === null) {
      res.status(404).json({
        error: 'Journey not found or does not belong to this workspace.',
        code: 'NOT_FOUND',
        resource: 'journey',
      });
      return;
    }
    res.status(200).json(journey);
  } catch (err) {
    if (err instanceof DatabaseError) {
      res.status(500).json({
        error: 'Failed to fetch journey.',
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

/**
 * PUT /api/journeys/:id/canvas
 * Save canvas state (nodes, edges) to JSONB and sync journey_events from trigger nodes.
 * Body: { nodes: unknown[], edges: unknown[] }.
 */
router.put(
  '/:id/canvas',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    const body = req.body as { nodes?: unknown; edges?: unknown; name?: unknown };
    const nodes = body.nodes;
    const edges = body.edges;
    const name = typeof body.name === 'string' ? body.name : 'New Journey';

    try {
      // Safety net: if the UI created the journey client-side, persist the row on first save.
      await JourneyDAL.createJourneyIfMissing(workspaceId, journeyId, name);
      const updated = await JourneyDAL.saveJourneyCanvas(
        workspaceId,
        journeyId,
        nodes ?? [],
        edges ?? []
      );
      res.status(200).json(updated);
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
          error: err.message || 'Failed to save journey canvas.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * PATCH /api/journeys/:id
 * Update journey metadata (e.g. testing_instructions_markdown). Body: { testing_instructions_markdown?: string }.
 */
router.patch(
  '/:id',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    const body = req.body as { testing_instructions_markdown?: unknown; name?: unknown };
    const testing_instructions_markdown =
      typeof body.testing_instructions_markdown === 'string'
        ? body.testing_instructions_markdown
        : undefined;
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;

    try {
      const updated = await JourneyDAL.updateJourney(workspaceId, journeyId, {
        testing_instructions_markdown,
        name,
      });
      res.status(200).json(updated);
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
          error: 'Failed to update journey.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/journeys/:id/events/:eventId/qa/validate
 * Validate a payload JSON string against the event's always_sent properties.
 * Body: { actualJson: string } — the raw JSON string (e.g. pasted payload).
 * Returns { valid: boolean, missing_keys?: string[] }.
 */
router.post(
  '/:id/events/:eventId/qa/validate',
  requireWorkspace,
  async (req: Request, res: Response): Promise<void> => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      res.status(403).json({
        error: 'Workspace context required.',
        code: 'WORKSPACE_REQUIRED',
      });
      return;
    }
    const journeyId = req.params.id;
    const eventId = req.params.eventId;
    const body = req.body as { actualJson?: string };
    const actualJson = typeof body.actualJson === 'string' ? body.actualJson : '{}';

    try {
      await JourneyDAL.getJourneyById(workspaceId, journeyId);
      const result = await validatePayload(workspaceId, eventId, actualJson);
      res.status(200).json(result);
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
          error: 'Failed to validate payload.',
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

export default router;
