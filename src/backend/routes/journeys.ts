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
import * as EventDAL from '../dal/event.dal';
import { listPayloadKeyPropertyBindingsForEvent } from '../dal/event.dal';
import { listEffectiveEventPropertyDefinitionsWithVariant } from '../dal/event-property-definition.dal';
import * as WorkspaceDAL from '../dal/workspace.dal';
import { getTriggerRequiredPayloadKeysForEvent } from '../lib/triggerRequiredPayloadKeys';
import { getJourneyQARunsCountAndLatest, getJourneyQARuns, upsertJourneyQARuns } from '../dal/qa.dal';
import { generateJourneyHtmlExport } from '../services/export.service';
import {
  assertEnumValuesForJourneyCanvasNodes,
  tryParseEventPayloadObject,
} from '../lib/eventPayloadEnumValidation';
import { isPropertyRequiredForTrigger } from '../../lib/effectiveEventSchema';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError, ConfigError } from '../errors';
import { getSupabaseOrThrow } from '../db/supabase';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ASSETS_BUCKET = 'assets';

function isJourneyAssetPath(objectPath: string, workspaceId: string, journeyId: string): boolean {
  return (
    objectPath.startsWith(`journeys/${workspaceId}/${journeyId}/`) ||
    objectPath.startsWith(`workspaces/${workspaceId}/journeys/${journeyId}/`)
  );
}

/**
 * validatePayload(eventId, actualJson): checks always_sent keys only.
 * actualJson: JSON string (will be parsed). Must be a JSON object (key/value).
 * Returns { valid: true } or { valid: false, missing_keys: string[] }.
 *
 * NOTE: This validation is NOT enforced for production ingestion here.
 * Enum and payload rules are enforced on PUT /api/journeys/:id/canvas and in upsertJourneyQARuns
 * (assertEnumValuesForJourneyCanvasNodes / assertEnumValuesForQaRunPayloads).
 * Do not assume runtime protection from this helper or POST .../qa/validate alone.
 */
export async function validatePayload(
  workspaceId: string,
  eventId: string,
  actualJson: string,
  codegenPreferredStyle?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null,
  variantId?: string | null
): Promise<
  | { valid: true }
  | { valid: false; error_type: 'invalid_format'; issues: string[] }
  | { valid: false; error_type: 'invalid_structure'; issues: string[] }
  | { valid: false; error_type: 'invalid_event_name'; issues: string[] }
  | { valid: false; error_type: 'unknown_mode'; issues: string[] }
  | { valid: false; error_type: 'invalid_types'; issues: string[]; missing_keys?: string[] }
  | { valid: false; error_type: 'missing_keys'; missing_keys: string[] }
> {
  const style = codegenPreferredStyle;
  if (style !== 'dataLayer' && style !== 'bloomreachSdk' && style !== 'bloomreachApi') {
    return {
      valid: false,
      error_type: 'unknown_mode',
      issues: [
        'Validation could not determine payload mode from Default Codegen Method.',
      ],
    };
  }

  const event = await EventDAL.getEventById(workspaceId, eventId);
  const canonicalEventName = (event?.name ?? '').trim();
  const overrides = event?.codegen_event_name_overrides ?? null;
  const expectedEventName =
    style === 'dataLayer'
      ? (typeof overrides?.dataLayer === 'string' && overrides.dataLayer.trim() ? overrides.dataLayer.trim() : canonicalEventName)
      : style === 'bloomreachSdk'
        ? (typeof overrides?.bloomreachSdk === 'string' && overrides.bloomreachSdk.trim() ? overrides.bloomreachSdk.trim() : canonicalEventName)
        : (typeof overrides?.bloomreachApi === 'string' && overrides.bloomreachApi.trim() ? overrides.bloomreachApi.trim() : canonicalEventName);

  const requiredKeys = await getTriggerRequiredPayloadKeysForEvent(
    workspaceId,
    eventId,
    variantId
  );

  const parsed = tryParseEventPayloadObject(actualJson);
  if (!parsed) {
    return {
      valid: false,
      error_type: 'invalid_format',
      issues: [
        'Payload must be a raw JSON object (e.g. {"key":"value"}). Wrapper scripts like window.dataLayer.push(...) are not supported.',
      ],
    };
  }

  // Mode-specific shape + event name validation (no auto-detect).
  if (style === 'dataLayer') {
    const ev = (parsed as Record<string, unknown>)['event'];
    if (typeof expectedEventName === 'string' && expectedEventName && typeof ev === 'string' && ev.trim() && ev.trim() !== expectedEventName) {
      return {
        valid: false,
        error_type: 'invalid_event_name',
        issues: [`Expected event '${expectedEventName}' in top-level "event". Found '${ev}'.`],
      };
    }
  } else {
    const ty = (parsed as Record<string, unknown>)['type'];
    const props = (parsed as Record<string, unknown>)['properties'];
    if (props === undefined) {
      return {
        valid: false,
        error_type: 'invalid_structure',
        issues: ['Bloomreach payload must include a top-level "properties" object.'],
      };
    }
    if (props === null || typeof props !== 'object' || Array.isArray(props)) {
      return {
        valid: false,
        error_type: 'invalid_structure',
        issues: ['Bloomreach payload "properties" must be a JSON object.'],
      };
    }
    if (typeof expectedEventName === 'string' && expectedEventName && typeof ty === 'string' && ty.trim() && ty.trim() !== expectedEventName) {
      return {
        valid: false,
        error_type: 'invalid_event_name',
        issues: [`Expected event '${expectedEventName}' in top-level "type". Found '${ty}'.`],
      };
    }
  }

  if (requiredKeys.length === 0) return { valid: true };

  const keyContainer =
    style === 'dataLayer'
      ? parsed
      : ((parsed as Record<string, unknown>)['properties'] as Record<string, unknown>);
  const actualKeys = new Set(Object.keys(keyContainer));
  const missing_keys = requiredKeys.filter((k) => !actualKeys.has(k));

  // Type validation: validate only properties that are required for trigger (same contract as requiredKeys).
  const effective = await listEffectiveEventPropertyDefinitionsWithVariant(workspaceId, eventId, {
    variantId: variantId ?? undefined,
  });
  const bindings = await listPayloadKeyPropertyBindingsForEvent(workspaceId, eventId);
  const pidToKey = new Map(bindings.map((b) => [b.property_id, b.payload_key]));
  const requiredTypeByKey = new Map<
    string,
    {
      dataType: string;
      dataFormats: string[] | null;
      propertyName: string;
      arrayItemType?: string;
      arrayItemFormats?: string[] | null;
      objectChildren?: Record<
        string,
        {
          type: string;
          dataFormats: string[] | null;
          required: boolean;
        }
      >;
    }
  >();
  for (const def of effective) {
    if (!isPropertyRequiredForTrigger(def)) continue;
    const k = pidToKey.get(def.property_id);
    if (!k) continue;
    const schema = def.property.value_schema_json;
    const arrayItemType =
      def.property.data_type === 'array' && schema?.type === 'array'
        ? schema.items?.type
        : undefined;
    const arrayItemFormats =
      def.property.data_type === 'array' && schema?.type === 'array'
        ? (schema.items?.data_formats ?? null)
        : null;

    const objectChildren =
      def.property.data_type === 'object' && schema?.type === 'object' && schema.properties
        ? (() => {
            const refs = def.property.object_child_property_refs_json as
              | Record<string, string>
              | null
              | undefined;
            // Only validate child fields when schema + linkage are explicitly present.
            if (!refs || Object.keys(refs).length === 0) return undefined;
            const out: Record<string, { type: string; dataFormats: string[] | null; required: boolean }> = {};
            for (const [fieldKey, node] of Object.entries(schema.properties)) {
              if (!fieldKey) continue;
              if (!node || typeof node !== 'object') continue;
              if (!refs[fieldKey]) continue;
              const dt = (node as any).type;
              if (typeof dt !== 'string') continue;
              const required =
                (node as any).required === true || (node as any).presence === 'always_sent';
              out[fieldKey] = {
                type: dt,
                dataFormats: Array.isArray((node as any).data_formats)
                  ? ((node as any).data_formats as string[])
                  : null,
                required,
              };
            }
            return Object.keys(out).length > 0 ? out : undefined;
          })()
        : undefined;

    requiredTypeByKey.set(k, {
      dataType: def.property.data_type,
      dataFormats: def.property.data_formats ?? null,
      propertyName: def.property.name,
      ...(typeof arrayItemType === 'string' ? { arrayItemType } : {}),
      arrayItemFormats,
      ...(objectChildren ? { objectChildren } : {}),
    });
  }

  function expectedTypeLabel(dt: string): string {
    if (dt === 'timestamp') return 'timestamp';
    return dt;
  }

  function actualTypeLabel(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function isValidForExpected(dt: string, fmts: string[] | null, v: unknown): boolean {
    if (v === null) return false;
    if (dt === 'string') return typeof v === 'string';
    if (dt === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (dt === 'boolean') return typeof v === 'boolean';
    if (dt === 'object') return typeof v === 'object' && !Array.isArray(v);
    if (dt === 'array') return Array.isArray(v);
    if (dt === 'timestamp') {
      const wantsNumber =
        Array.isArray(fmts) &&
        (fmts.includes('unix_seconds') || fmts.includes('unix_milliseconds'));
      return wantsNumber ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string';
    }
    return true;
  }

  function isPrimitiveType(dt: string | undefined): boolean {
    return dt === 'string' || dt === 'number' || dt === 'boolean' || dt === 'timestamp';
  }

  const typeIssues: string[] = [];
  for (const [payloadKey, spec] of requiredTypeByKey.entries()) {
    if (!actualKeys.has(payloadKey)) continue;
    const raw = (keyContainer as Record<string, unknown>)[payloadKey];
    const ok = isValidForExpected(spec.dataType, spec.dataFormats, raw);
    if (!ok) {
      typeIssues.push(
        `Property "${payloadKey}" must be ${expectedTypeLabel(spec.dataType)} (got ${actualTypeLabel(raw)}).`
      );
      continue;
    }

    // Bounded shallow schema: for arrays, validate primitive item types only when explicitly provided by schema.
    if (spec.dataType === 'array' && Array.isArray(raw) && raw.length > 0) {
      const itemType = spec.arrayItemType;
      if (isPrimitiveType(itemType)) {
        for (let i = 0; i < raw.length; i += 1) {
          const item = raw[i];
          const okItem = isValidForExpected(itemType!, spec.arrayItemFormats ?? null, item);
          if (!okItem) {
            typeIssues.push(
              `Property "${payloadKey}[${i}]" must be ${expectedTypeLabel(itemType!)} (got ${actualTypeLabel(item)}).`
            );
            break;
          }
        }
      }
    }

    // Bounded shallow schema: for objects, validate explicitly-linked required child fields (one level deep).
    if (spec.dataType === 'object' && raw && typeof raw === 'object' && !Array.isArray(raw) && spec.objectChildren) {
      const childObj = raw as Record<string, unknown>;
      for (const [childKey, childSpec] of Object.entries(spec.objectChildren)) {
        if (!childKey) continue;
        if (childSpec.required === true) {
          if (!(childKey in childObj)) {
            typeIssues.push(`Property "${payloadKey}.${childKey}" is required.`);
            continue;
          }
        } else {
          if (!(childKey in childObj)) {
            continue;
          }
        }

        const childVal = childObj[childKey];
        const okChild = isValidForExpected(childSpec.type, childSpec.dataFormats, childVal);
        if (!okChild) {
          typeIssues.push(
            `Property "${payloadKey}.${childKey}" must be ${expectedTypeLabel(childSpec.type)} (got ${actualTypeLabel(childVal)}).`
          );
        }
      }
    }
  }

  if (typeIssues.length > 0) {
    return {
      valid: false,
      error_type: 'invalid_types',
      issues: typeIssues,
      ...(missing_keys.length > 0 ? { missing_keys } : {}),
    };
  }

  if (missing_keys.length === 0) return { valid: true };
  return { valid: false, error_type: 'missing_keys', missing_keys };
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
 * GET /api/journeys/share-hub
 * Stakeholder hub: returns whether the workspace hub link is enabled and the token (if any).
 */
router.get('/share-hub', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: 'Workspace context required.',
      code: 'WORKSPACE_REQUIRED',
    });
    return;
  }
  try {
    const token = await WorkspaceDAL.getJourneysShareHubToken(workspaceId);
    const enabled = typeof token === 'string' && token.length > 0;
    res.status(200).json({ enabled, token: enabled ? token : null });
  } catch (err) {
    console.error('[journeys/share-hub GET]', err);
    res.status(500).json({
      error: 'Failed to load share hub settings.',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * PATCH /api/journeys/share-hub
 * Body: { enabled: boolean }. Enables generates a stable hub token; disable clears it.
 */
router.patch('/share-hub', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({
      error: 'Workspace context required.',
      code: 'WORKSPACE_REQUIRED',
    });
    return;
  }
  const body = req.body as { enabled?: unknown };
  const enabled = body.enabled === true;
  try {
    if (enabled) {
      const token = await WorkspaceDAL.ensureJourneysShareHubToken(workspaceId);
      res.status(200).json({ enabled: true, token });
      return;
    }
    await WorkspaceDAL.setJourneysShareHubToken(workspaceId, null);
    res.status(200).json({ enabled: false });
  } catch (err) {
    console.error('[journeys/share-hub PATCH]', err);
    res.status(500).json({
      error: 'Failed to update share hub settings.',
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
      const objectPath = `journeys/${workspaceId}/${journeyId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(ASSETS_BUCKET)
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
      const { data: pub } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(objectPath);
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

    // Allow the new journeys/... object path and the legacy workspaces/.../journeys/... path.
    if (!isJourneyAssetPath(objectPath, workspaceId, journeyId)) {
      res.status(403).json({ error: 'Forbidden.', code: 'FORBIDDEN' });
      return;
    }

    try {
      const supabase = getSupabaseOrThrow();
      const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(objectPath);
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
 * PATCH /api/journeys/:id/step-order
 * Persists explicit step order for journeyStepNode ids.
 * Body: { step_order: string[] }
 */
router.patch(
  '/:id/step-order',
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
    const body = req.body as { step_order?: unknown };
    const raw = body.step_order;
    if (!Array.isArray(raw)) {
      res.status(400).json({
        error: 'step_order must be an array of step node ids.',
        code: 'INVALID_STEP_ORDER',
      });
      return;
    }

    const step_order = raw
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);

    // Dedupe while preserving order.
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const id of step_order) {
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(id);
    }

    try {
      const journey = await JourneyDAL.getJourneyById(workspaceId, journeyId);
      if (!journey) {
        res.status(404).json({
          error: 'Journey not found.',
          code: 'NOT_FOUND',
          resource: 'journey',
        });
        return;
      }

      const nodes = Array.isArray(journey.canvas_nodes_json)
        ? (journey.canvas_nodes_json as any[])
        : [];
      const stepNodeIds = new Set(
        nodes
          .filter((n) => n?.type === 'journeyStepNode' && typeof n?.id === 'string')
          .map((n) => String(n.id))
      );

      for (const id of deduped) {
        if (!stepNodeIds.has(id)) {
          res.status(400).json({
            error: `Unknown step id in step_order: ${id}`,
            code: 'INVALID_STEP_ORDER',
          });
          return;
        }
      }

      const updated = await JourneyDAL.updateJourney(workspaceId, journeyId, {
        step_order_json: deduped,
      });

      res.status(200).json({ success: true, step_order: updated.step_order_json ?? null });
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
        // Surface concrete DB cause (helps diagnose missing migrations / schema drift).
        const cause = err.cause as any;
        const causeMsg = typeof cause?.message === 'string' ? cause.message : '';
        const causeCode = typeof cause?.code === 'string' ? cause.code : undefined;
        console.error('[journeys] step-order update failed', {
          journeyId,
          workspaceId,
          message: err.message,
          causeCode,
          causeMsg,
        });

        // Small safety net: if the DB schema is missing the new column, fall back to persisting
        // the order by reordering journeyStepNode entries in canvas_nodes_json.
        // This keeps the system usable even if migrations have not been applied yet.
        const looksLikeMissingColumn =
          (typeof causeMsg === 'string' &&
            (causeMsg.includes('column') &&
              (causeMsg.includes('step_order_json') || causeMsg.includes('step_order')) &&
              causeMsg.includes('does not exist'))) ||
          causeCode === '42703';

        if (looksLikeMissingColumn) {
          try {
            const nodes = Array.isArray((journey as any).canvas_nodes_json)
              ? ((journey as any).canvas_nodes_json as any[])
              : [];
            const stepById = new Map(
              nodes
                .filter((n) => n?.type === 'journeyStepNode' && typeof n?.id === 'string')
                .map((n) => [String(n.id), n] as const)
            );
            const orderedSteps: any[] = [];
            const seenIds = new Set<string>();
            for (const id of deduped) {
              const n = stepById.get(id);
              if (!n || seenIds.has(id)) continue;
              seenIds.add(id);
              orderedSteps.push(n);
            }
            for (const n of nodes) {
              if (n?.type !== 'journeyStepNode') continue;
              const id = typeof n?.id === 'string' ? String(n.id) : '';
              if (!id || seenIds.has(id)) continue;
              seenIds.add(id);
              orderedSteps.push(n);
            }
            const nonSteps = nodes.filter((n) => n?.type !== 'journeyStepNode');
            const nextNodes = [...orderedSteps, ...nonSteps];

            const supabase = getSupabaseOrThrow();
            const { error: updateErr } = await supabase
              .from('journeys')
              .update({ canvas_nodes_json: nextNodes, updated_at: new Date().toISOString() })
              .eq('id', journeyId)
              .eq('workspace_id', workspaceId);

            if (!updateErr) {
              res.status(200).json({
                success: true,
                step_order: deduped,
                warning: 'step_order_json column missing; persisted by reordering canvas_nodes_json instead.',
              });
              return;
            }
          } catch (fallbackErr) {
            console.error('[journeys] step-order fallback failed', fallbackErr);
          }
        }

        res.status(500).json({
          error: 'Failed to update step order.',
          code: err.code,
          details: err.message,
          db_code: causeCode,
          db_message: causeMsg,
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
 *
 * Invalid JSON payload (enum mismatch) → 400 BadRequestError; upsertJourneyQARuns does not write.
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
      if (err instanceof BadRequestError) {
        res.status(400).json({
          error: err.message,
          message: err.message,
          code: err.code,
          ...(err.field && { field: err.field }),
          ...(err.details && {
            property_id: err.details.property_id,
            value: err.details.value,
            allowed: err.details.allowed,
          }),
        });
        return;
      }
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
 *
 * Invalid trigger JSON payload (enum mismatch) → 400 BadRequestError; no journey row is created and saveJourneyCanvas is not called.
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
    const nodes = body.nodes ?? [];
    const edges = body.edges;
    const name = typeof body.name === 'string' ? body.name : 'New Journey';

    try {
      // Sole enum gate for canvas save (saveJourneyCanvas does not re-validate).
      await assertEnumValuesForJourneyCanvasNodes(workspaceId, nodes);
      // Safety net: if the UI created the journey client-side, persist the row on first save.
      await JourneyDAL.createJourneyIfMissing(workspaceId, journeyId, name);
      const updated = await JourneyDAL.saveJourneyCanvas(
        workspaceId,
        journeyId,
        nodes,
        edges ?? [],
        { enumValidated: true }
      );
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof BadRequestError) {
        res.status(400).json({
          error: err.message,
          message: err.message,
          code: err.code,
          ...(err.field && { field: err.field }),
          ...(err.details && {
            property_id: err.details.property_id,
            value: err.details.value,
            allowed: err.details.allowed,
          }),
        });
        return;
      }
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
    const body = req.body as {
      testing_instructions_markdown?: unknown;
      name?: unknown;
      codegen_preferred_style?: unknown;
    };
    const testing_instructions_markdown =
      typeof body.testing_instructions_markdown === 'string'
        ? body.testing_instructions_markdown
        : undefined;
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const codegen_preferred_style =
      body.codegen_preferred_style === null
        ? null
        : body.codegen_preferred_style === 'dataLayer' ||
            body.codegen_preferred_style === 'bloomreachSdk' ||
            body.codegen_preferred_style === 'bloomreachApi'
          ? body.codegen_preferred_style
          : undefined;
    if (
      body.codegen_preferred_style !== undefined &&
      body.codegen_preferred_style !== null &&
      codegen_preferred_style === undefined
    ) {
      res.status(400).json({
        error: 'Invalid codegen_preferred_style value.',
        code: 'INVALID_CODEGEN_PREFERRED_STYLE',
      });
      return;
    }

    try {
      const updated = await JourneyDAL.updateJourney(workspaceId, journeyId, {
        testing_instructions_markdown,
        name,
        codegen_preferred_style,
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
 *
 * NOTE: This endpoint is advisory / QA-debug only. Enum enforcement happens when
 * journey canvas or QA data is persisted, not here. Do not assume runtime protection from this route.
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
    const body = req.body as {
      actualJson?: string;
      variant_id?: string | null;
      codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
    };
    const actualJson = typeof body.actualJson === 'string' ? body.actualJson : '{}';
    const codegenPreferredStyle = body.codegen_preferred_style;
    const variantIdRaw = body.variant_id;
    const variantId =
      typeof variantIdRaw === 'string' && variantIdRaw.trim() !== ''
        ? variantIdRaw.trim()
        : variantIdRaw === null
          ? null
          : undefined;

    try {
      await JourneyDAL.getJourneyById(workspaceId, journeyId);
      const result = await validatePayload(
        workspaceId,
        eventId,
        actualJson,
        codegenPreferredStyle,
        variantId
      );
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
