/**
 * Public shared routes. No workspace middleware — token is the only auth.
 *
 * Mount in your Express app: app.use('/api/shared', sharedRouter);
 * Example: import sharedRouter from './routes/shared.js';
 */
import { Router, type Request, type Response } from 'express';
import { getJourneyByShareId, getJourneyByShareToken } from '../dal/journey.dal';
import { getEventWithProperties } from '../dal/event.dal';
import { DatabaseError, NotFoundError } from '../errors';
import { buildCodegenSnippets } from '../services/codegen.service';

const router = Router();

type CanvasNode = {
  type?: string;
  data?: {
    connectedEvent?: { eventId?: string; name?: string };
  };
};

async function buildSharedEventSnippets(
  workspaceId: string,
  nodes: unknown
): Promise<Record<string, { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }>> {
  const list = Array.isArray(nodes) ? (nodes as CanvasNode[]) : [];
  const eventIds = [...new Set(
    list
      .filter((n) => n?.type === 'triggerNode')
      .map((n) => n?.data?.connectedEvent?.eventId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )];

  const out: Record<string, { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }> = {};
  for (const eventId of eventIds) {
    try {
      const { event, attached_properties } = await getEventWithProperties(workspaceId, eventId);
      const alwaysSent = attached_properties
        .filter((p) => p.presence === 'always_sent')
        .map((p) => p.property_name);
      const sometimesSent = attached_properties
        .filter((p) => p.presence === 'sometimes_sent')
        .map((p) => p.property_name);
      out[eventId] = { eventName: event.name, snippets: buildCodegenSnippets(event.name, attached_properties) };
      // Note: snippets already encode optional props; keep lists implicit.
      void alwaysSent;
      void sometimesSent;
    } catch {
      // If event lookup fails, omit snippets.
    }
  }
  return out;
}

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
      const eventSnippets = await buildSharedEventSnippets(journey.workspace_id, journey.nodes);
      res.status(200).json({
        id: journey.id,
        name: journey.name,
        description: journey.description,
        testing_instructions_markdown: journey.testing_instructions_markdown,
        nodes: journey.nodes,
        edges: journey.edges,
        eventSnippets,
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
      const eventSnippets = await buildSharedEventSnippets(journey.workspace_id, journey.nodes);
      res.status(200).json({
        id: journey.id,
        name: journey.name,
        description: journey.description,
        testing_instructions_markdown: journey.testing_instructions_markdown,
        nodes: journey.nodes,
        edges: journey.edges,
        eventSnippets,
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

export default router;
