/**
 * Public shared routes. No workspace middleware — token is the only auth.
 *
 * Mount in your Express app: app.use('/api/shared', sharedRouter);
 * Example: import sharedRouter from './routes/shared.js';
 */
import { Router, type Request, type Response } from 'express';
import { getJourneyByShareId, getJourneyByShareToken, listJourneysForShareHub } from '../dal/journey.dal';
import { getWorkspaceIdByJourneysShareHubToken, getWorkspaceSettings } from '../dal/workspace.dal';
import { getEventWithProperties } from '../dal/event.dal';
import { DatabaseError, NotFoundError } from '../errors';
import { buildCodegenSnippets } from '../services/codegen.service';
import {
  computeCodegenRequiredForTriggerByPropertyIds,
  loadEffectiveDefinitionsForEventVariant,
  type EffectiveListCache,
} from '../lib/codegenRequiredness';
import { mergeEventPropertyWithDetailsWithEffectiveList } from '../lib/mergeVariantEffectiveIntoAttachedProperties';
import { isAttachedPropertyRequiredForTrigger } from '../../lib/effectiveEventSchema';
import type { EventPropertyPresence } from '../../types/schema';
import { generateJourneyHtmlExport } from '../services/export.service';
import { getSupabaseOrThrow } from '../db/supabase';
import { getSharedJourneyQARuns } from '../dal/qa.dal';

const router = Router();
const ASSETS_BUCKET = 'assets';

function isJourneyAssetPath(objectPath: string, workspaceId: string, journeyId: string): boolean {
  return (
    objectPath.startsWith(`journeys/${workspaceId}/${journeyId}/`) ||
    objectPath.startsWith(`workspaces/${workspaceId}/journeys/${journeyId}/`)
  );
}

type CanvasNode = {
  type?: string;
  id?: string;
  data?: {
    connectedEvent?: { eventId?: string; name?: string; variantId?: string };
    imageUrl?: string;
  };
};

/**
 * Deterministic boolean for shared snippet codegen: prefer variant/effective map lookup
 * (trimmed property_id key), never leave `required_for_trigger` undefined on the payload.
 */
function sharedSnippetRequiredForTrigger(
  map: Map<string, boolean>,
  propertyIdRaw: string | undefined,
  presence: EventPropertyPresence,
  propertyRequiredOverride: boolean | null | undefined
): boolean {
  const pid = typeof propertyIdRaw === 'string' ? propertyIdRaw.trim() : '';
  if (pid !== '') {
    const v = map.get(pid);
    if (typeof v === 'boolean') return v;
  }
  return isAttachedPropertyRequiredForTrigger(presence, propertyRequiredOverride ?? null);
}

function rewriteSharedImageUrls(journeyId: string, nodes: unknown): unknown {
  if (!Array.isArray(nodes)) return nodes;
  return (nodes as CanvasNode[]).map((n) => {
    if (n?.type !== 'journeyStepNode') return n;
    const url = n?.data?.imageUrl;
    if (typeof url !== 'string') return n;
    const prefix = `/api/journeys/${journeyId}/images/`;
    if (!url.startsWith(prefix)) return n;
    const encoded = url.slice(prefix.length);
    return {
      ...n,
      data: {
        ...n.data,
        imageUrl: `/api/shared/journeys/journey/${journeyId}/images/${encoded}`,
      },
    };
  });
}

function sharedSnippetMapKey(eventId: string, variantId: string | null): string {
  const e = eventId.trim();
  const v = variantId?.trim();
  return v ? `${e}::${v}` : e;
}

async function buildSharedEventSnippets(
  workspaceId: string,
  nodes: unknown
): Promise<Record<string, { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }>> {
  const workspaceSettings = await getWorkspaceSettings(workspaceId);
  const bloomreachApiCustomerIdKey =
    typeof (workspaceSettings as any)?.bloomreach_api_customer_id_key === 'string'
      ? String((workspaceSettings as any).bloomreach_api_customer_id_key)
      : null;
  const list = Array.isArray(nodes) ? (nodes as CanvasNode[]) : [];
  const pairKeys = new Set<string>();
  const eventIds = new Set<string>();
  for (const n of list) {
    if (n?.type !== 'triggerNode') continue;
    const rawEid = n?.data?.connectedEvent?.eventId;
    if (typeof rawEid !== 'string' || !rawEid.trim()) continue;
    const eid = rawEid.trim();
    eventIds.add(eid);
    const rawVid = n?.data?.connectedEvent?.variantId;
    const vid =
      typeof rawVid === 'string' && rawVid.trim() !== '' ? rawVid.trim() : null;
    pairKeys.add(sharedSnippetMapKey(eid, vid));
  }

  const eventCache = new Map<
    string,
    Awaited<ReturnType<typeof getEventWithProperties>>
  >();
  for (const eventId of eventIds) {
    try {
      const payload = await getEventWithProperties(workspaceId, eventId);
      eventCache.set(eventId, payload);
    } catch {
      // If event lookup fails, omit snippets for this event.
    }
  }

  const out: Record<
    string,
    { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }
  > = {};
  const effListCache: EffectiveListCache = new Map();

  for (const key of pairKeys) {
    const sep = key.indexOf('::');
    const eventId = sep === -1 ? key : key.slice(0, sep);
    const variantId = sep === -1 ? null : key.slice(sep + 2) || null;
    const cached = eventCache.get(eventId);
    if (!cached) continue;

    try {
      const { event, attached_properties } = cached;
      let rowsForCodegen = attached_properties;
      if (variantId) {
        const effList = await loadEffectiveDefinitionsForEventVariant(
          workspaceId,
          eventId,
          variantId,
          effListCache
        );
        rowsForCodegen = mergeEventPropertyWithDetailsWithEffectiveList(
          attached_properties,
          effList
        );
      }

      const requiredByPropId = await computeCodegenRequiredForTriggerByPropertyIds(
        workspaceId,
        eventId,
        new Set([variantId]),
        rowsForCodegen.map((p) => ({
          property_id: typeof p.property_id === 'string' ? p.property_id.trim() : '',
          presence: p.presence,
          property_required_override: p.property_required_override ?? null,
        })),
        effListCache
      );
      const attached = rowsForCodegen.map((p) => ({
        property_name: p.property_name || '',
        presence: p.presence,
        property_required_override: p.property_required_override ?? null,
        required_for_trigger: sharedSnippetRequiredForTrigger(
          requiredByPropId,
          p.property_id,
          p.presence,
          p.property_required_override ?? null
        ),
        property_id: p.property_id,
        property_data_type: p.property_data_type,
        property_data_formats: p.property_data_formats,
        property_example_values_json: p.property_example_values_json,
        property_value_schema_json: p.property_value_schema_json ?? null,
        property_object_child_property_refs_json: p.property_object_child_property_refs_json ?? null,
        object_child_snapshots_by_field: p.object_child_snapshots_by_field ?? null,
      }));
      out[key] = {
        eventName: event.name,
        snippets: buildCodegenSnippets(
          event.name,
          attached,
          event.codegen_event_name_overrides ?? null,
          { bloomreachApiCustomerIdKey }
        ),
      };
    } catch {
      // Omit this key on failure.
    }
  }
  return out;
}

/**
 * GET /api/shared/journeys-hub/:token
 * Lists journeys in the workspace that have individual sharing enabled (share_token set).
 * Hub access requires workspace_settings.journeys_share_hub_token to match.
 */
router.get(
  '/journeys-hub/:token',
  async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!token || typeof token !== 'string') {
      res.status(400).json({
        error: 'Hub token is required.',
        code: 'TOKEN_REQUIRED',
      });
      return;
    }
    try {
      const workspaceId = await getWorkspaceIdByJourneysShareHubToken(token.trim());
      if (!workspaceId) {
        res.status(404).json({
          error: 'Invalid or disabled shared hub link.',
          code: 'NOT_FOUND',
        });
        return;
      }
      const journeys = await listJourneysForShareHub(workspaceId);
      res.status(200).json({ journeys });
    } catch (err) {
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to load shared journeys hub.',
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
 * GET /api/shared/journeys/:token
 * Returns journey canvas data for read-only view. Public (no x-workspace-id).
 * Response: { id, name, description, testing_instructions_markdown, nodes, edges }.
 */
router.get(
  '/journeys/:token',
  async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({
        error: 'Share token is required.',
        code: 'TOKEN_REQUIRED',
      });
      return;
    }
    try {
      const journey = await getJourneyByShareToken(token);
      const rewrittenNodes = rewriteSharedImageUrls(journey.id, journey.nodes);
      const eventSnippets = await buildSharedEventSnippets(journey.workspace_id, rewrittenNodes);
      const qaRuns = await getSharedJourneyQARuns(journey.id);
      res.status(200).json({
        id: journey.id,
        name: journey.name,
        description: journey.description,
        testing_instructions_markdown: journey.testing_instructions_markdown,
        codegen_preferred_style: journey.codegen_preferred_style ?? null,
        nodes: rewrittenNodes,
        edges: journey.edges,
        eventSnippets,
        qaRuns,
      });
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
          error: 'Failed to load shared journey.',
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
 * GET /api/shared/journeys/journey/:id
 * Public read-only journey view by journey id (only when share enabled).
 */
router.get(
  '/journeys/journey/:id',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({
        error: 'Journey id is required.',
        code: 'ID_REQUIRED',
      });
      return;
    }
    try {
      const journey = await getJourneyByShareId(id);
      const rewrittenNodes = rewriteSharedImageUrls(journey.id, journey.nodes);
      const eventSnippets = await buildSharedEventSnippets(journey.workspace_id, rewrittenNodes);
      const qaRuns = await getSharedJourneyQARuns(journey.id);
      res.status(200).json({
        id: journey.id,
        name: journey.name,
        description: journey.description,
        testing_instructions_markdown: journey.testing_instructions_markdown,
        codegen_preferred_style: journey.codegen_preferred_style ?? null,
        nodes: rewrittenNodes,
        edges: journey.edges,
        eventSnippets,
        qaRuns,
      });
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
          error: 'Failed to load shared journey.',
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
 * GET /api/shared/journeys/journey/:id/export/html
 * Public Implementation Brief by journey id (only when share enabled).
 */
router.get(
  '/journeys/journey/:id/export/html',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({
        error: 'Journey id is required.',
        code: 'ID_REQUIRED',
      });
      return;
    }
    try {
      const journey = await getJourneyByShareId(id);
      const html = await generateJourneyHtmlExport(journey.workspace_id, journey.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
      if (err instanceof DatabaseError) {
        res.status(500).json({
          error: 'Failed to load implementation brief.',
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
 * GET /api/shared/journeys/journey/:id/images/:encodedPath
 * Streams a private journey image when share is enabled.
 */
router.get(
  '/journeys/journey/:id/images/:encodedPath',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;
    const encodedPath = req.params.encodedPath;
    if (!id || !encodedPath) {
      res.status(400).json({ error: 'Bad request.', code: 'BAD_REQUEST' });
      return;
    }
    let objectPath = '';
    try {
      objectPath = Buffer.from(encodedPath, 'base64url').toString('utf8');
    } catch {
      res.status(400).json({ error: 'Invalid image path.', code: 'BAD_REQUEST' });
      return;
    }

    try {
      const journey = await getJourneyByShareId(id);
      if (!isJourneyAssetPath(objectPath, journey.workspace_id, journey.id)) {
        res.status(403).json({ error: 'Forbidden.', code: 'FORBIDDEN' });
        return;
      }
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
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message, code: err.code, resource: err.resource });
        return;
      }
      res.status(500).json({ error: 'Failed to load image.', code: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
