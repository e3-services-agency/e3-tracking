/**
 * Journeys Data Access Layer.
 * Document-Relational Hybrid: canvas state stored as JSONB; journey_events kept in sync from trigger nodes.
 * Every function takes workspaceId; all queries enforce workspace_id.
 */
import { getSupabase } from '../db/supabase.js';
import type { JourneyRow } from '../../types/schema.js';
import { DatabaseError, NotFoundError } from '../errors.js';

type NodeLike = { type?: string; data?: { connectedEvent?: { eventId?: string }; implementationType?: string } };

type TypeCounts = { new: number; enrichment: number; fix: number };

function computeTypeCounts(nodes: unknown): TypeCounts {
  const counts: TypeCounts = { new: 0, enrichment: 0, fix: 0 };
  if (!Array.isArray(nodes)) return counts;
  for (const node of nodes as NodeLike[]) {
    if (node?.type !== 'journeyStepNode') continue;
    const t = node?.data?.implementationType;
    if (t === 'new' || t === 'enrichment' || t === 'fix') counts[t] += 1;
  }
  return counts;
}

/**
 * Returns a journey by id only if it belongs to the workspace.
 */
export async function getJourneyById(
  workspaceId: string,
  journeyId: string
): Promise<JourneyRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('journeys')
    .select('*')
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch journey: ${error.message}`, error);
  }
  return data as JourneyRow | null;
}

/**
 * Lists all non-deleted journeys for the workspace.
 */
export async function listJourneys(workspaceId: string): Promise<JourneyRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('journeys')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new DatabaseError(`Failed to list journeys: ${error.message}`, error);
  }
  return (data ?? []) as JourneyRow[];
}

/**
 * Extracts event IDs from trigger nodes in the canvas nodes array.
 * Order is preserved for sort_order.
 */
function getEventIdsFromNodes(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  for (const node of nodes as NodeLike[]) {
    if (node?.type === 'triggerNode' && node?.data?.connectedEvent?.eventId) {
      const id = String(node.data.connectedEvent.eventId).trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * Saves canvas state to JSONB columns and syncs journey_events from trigger nodes.
 * - Writes nodes and edges to canvas_nodes_json and canvas_edges_json.
 * - Deletes existing journey_events for this journey, then UPSERTs one row per trigger node (by eventId) with sort_order.
 *
 * @throws NotFoundError when journey is not in workspace.
 */
export async function saveJourneyCanvas(
  workspaceId: string,
  journeyId: string,
  nodes: unknown,
  edges: unknown
): Promise<JourneyRow> {
  const journey = await getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const supabase = getSupabase();
  const type_counts = computeTypeCounts(nodes ?? []);

  const { error: updateError } = await supabase
    .from('journeys')
    .update({
      canvas_nodes_json: nodes ?? [],
      canvas_edges_json: edges ?? [],
      type_counts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId);

  if (updateError) {
    throw new DatabaseError(
      `Failed to save journey canvas: ${updateError.message}`,
      updateError
    );
  }

  const eventIds = getEventIdsFromNodes(nodes);

  const { error: deleteError } = await supabase
    .from('journey_events')
    .delete()
    .eq('journey_id', journeyId);

  if (deleteError) {
    throw new DatabaseError(
      `Failed to sync journey_events: ${deleteError.message}`,
      deleteError
    );
  }

  if (eventIds.length > 0) {
    const rows = eventIds.map((event_id, index) => ({
      journey_id: journeyId,
      event_id,
      sort_order: index,
    }));
    const { error: insertError } = await supabase
      .from('journey_events')
      .insert(rows);

    if (insertError) {
      throw new DatabaseError(
        `Failed to insert journey_events: ${insertError.message}`,
        insertError
      );
    }
  }

  const updated = await getJourneyById(workspaceId, journeyId);
  if (updated === null) {
    throw new DatabaseError('Journey not found after save.');
  }
  return updated;
}

/**
 * Updates journey metadata (e.g. testing_instructions_markdown).
 *
 * @throws NotFoundError when journey is not in workspace.
 */
export async function updateJourney(
  workspaceId: string,
  journeyId: string,
  patch: { testing_instructions_markdown?: string | null }
): Promise<JourneyRow> {
  const journey = await getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const supabase = getSupabase();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.testing_instructions_markdown !== undefined) {
    updates.testing_instructions_markdown = patch.testing_instructions_markdown;
  }

  const { error } = await supabase
    .from('journeys')
    .update(updates)
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new DatabaseError(
      `Failed to update journey: ${error.message}`,
      error
    );
  }

  const updated = await getJourneyById(workspaceId, journeyId);
  if (updated === null) {
    throw new DatabaseError('Journey not found after update.');
  }
  return updated;
}

/**
 * Generates and saves a share_token (UUID) for the journey.
 * If the journey already has a share_token, returns it without changing.
 *
 * @throws NotFoundError when journey is not in workspace.
 */
export async function generateShareToken(
  workspaceId: string,
  journeyId: string
): Promise<string> {
  const journey = await getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  if (journey.share_token) {
    return journey.share_token;
  }

  const { randomUUID } = await import('node:crypto');
  const token = randomUUID();

  const supabase = getSupabase();
  const { error } = await supabase
    .from('journeys')
    .update({
      share_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new DatabaseError(
      `Failed to generate share token: ${error.message}`,
      error
    );
  }

  return token;
}

/**
 * Returns journey canvas data by share token (public access, no workspace check).
 * Strips internal fields; returns only what is needed to render the read-only canvas.
 *
 * @throws NotFoundError when token is invalid or journey is deleted.
 */
export async function getJourneyByShareToken(token: string): Promise<{
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  nodes: unknown;
  edges: unknown;
}> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('journeys')
    .select('id, name, description, testing_instructions_markdown, canvas_nodes_json, canvas_edges_json')
    .eq('share_token', token)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(
      `Failed to fetch journey by share token: ${error.message}`,
      error
    );
  }

  if (data === null) {
    throw new NotFoundError(
      'Invalid or expired share link.',
      'journey'
    );
  }

  const row = data as {
    id: string;
    name: string;
    description: string | null;
    testing_instructions_markdown: string | null;
    canvas_nodes_json: unknown;
    canvas_edges_json: unknown;
  };

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    testing_instructions_markdown: row.testing_instructions_markdown,
    nodes: row.canvas_nodes_json ?? [],
    edges: row.canvas_edges_json ?? [],
  };
}
