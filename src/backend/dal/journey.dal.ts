/**
 * Journeys Data Access Layer.
 * Document-Relational Hybrid: canvas state stored as JSONB; journey_events kept in sync from trigger nodes.
 * Every function takes workspaceId; all queries enforce workspace_id.
 */
import { getSupabaseOrThrow } from '../db/supabase';
import type { JourneyRow } from '../../types/schema';
import { ConflictError, DatabaseError, NotFoundError } from '../errors';

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
  const supabase = getSupabaseOrThrow();
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
  const supabase = getSupabaseOrThrow();
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
 * Creates a journey row (idempotent for existing id/workspace).
 * Used as a safety net when the UI creates journeys client-side and first persistence happens on Save Layout.
 */
export async function createJourneyIfMissing(
  workspaceId: string,
  journeyId: string,
  name: string
): Promise<JourneyRow> {
  const existing = await getJourneyById(workspaceId, journeyId);
  if (existing) return existing;

  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const { error } = await supabase.from('journeys').insert({
    id: journeyId,
    workspace_id: workspaceId,
    name: name || 'New Journey',
    description: null,
    developer_instructions_markdown: null,
    canvas_nodes_json: null,
    canvas_edges_json: null,
    testing_instructions_markdown: null,
    share_token: null,
    type_counts: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) {
    throw new DatabaseError(`Failed to create journey: ${error.message}`, error);
  }

  const created = await getJourneyById(workspaceId, journeyId);
  if (created === null) {
    throw new DatabaseError('Journey not found after create.');
  }
  return created;
}

/**
 * Creates a journey row. Throws ConflictError if the id already exists in this workspace.
 */
export async function createJourney(
  workspaceId: string,
  journeyId: string,
  name: string
): Promise<JourneyRow> {
  const existing = await getJourneyById(workspaceId, journeyId);
  if (existing) {
    throw new ConflictError('Journey already exists.', `journey_id=${journeyId}`);
  }
  return await createJourneyIfMissing(workspaceId, journeyId, name);
}

/**
 * Extracts event IDs from trigger nodes in the canvas nodes array.
 * Order is preserved for sort_order.
 */
function getEventIdsFromNodes(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes as NodeLike[]) {
    if (node?.type === 'triggerNode' && node?.data?.connectedEvent?.eventId) {
      const id = String(node.data.connectedEvent.eventId).trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export type SaveJourneyCanvasOptions = {
  /** Must be true: caller has already run assertEnumValuesForJourneyCanvasNodes (or equivalent). */
  enumValidated?: boolean;
};

/**
 * Saves canvas state to JSONB columns and syncs journey_events from trigger nodes.
 * - Writes nodes and edges to canvas_nodes_json and canvas_edges_json.
 * - Deletes existing journey_events for this journey, then UPSERTs one row per trigger node (by eventId) with sort_order.
 *
 * **Validation contract:** Trigger JSON enum checks are required before persistence. This function assumes
 * validated `nodes`; it does not re-run enum validation. The HTTP route PUT /api/journeys/:id/canvas is
 * responsible for calling assertEnumValuesForJourneyCanvasNodes first and passing `{ enumValidated: true }`.
 *
 * @throws Error when `options.enumValidated` is not true (developer misuse).
 * @throws NotFoundError when journey is not in workspace.
 */
export async function saveJourneyCanvas(
  workspaceId: string,
  journeyId: string,
  nodes: unknown,
  edges: unknown,
  options?: SaveJourneyCanvasOptions
): Promise<JourneyRow> {
  if (!options?.enumValidated) {
    throw new Error(
      'saveJourneyCanvas called without enum validation. Validation must be executed before persistence.'
    );
  }

  const journey = await getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const supabase = getSupabaseOrThrow();
  const type_counts = computeTypeCounts(nodes ?? []);

  const eventIds = getEventIdsFromNodes(nodes);

  // Sync journey_events first, then persist the canvas.
  // This prevents partial commits where a journey_events constraint/RLS failure
  // causes a 500 but leaves canvas_nodes_json persisted.
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
  patch: { testing_instructions_markdown?: string | null; name?: string }
): Promise<JourneyRow> {
  const journey = await getJourneyById(workspaceId, journeyId);
  if (journey === null) {
    throw new NotFoundError(
      'Journey not found or does not belong to this workspace.',
      'journey'
    );
  }

  const supabase = getSupabaseOrThrow();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    updates.name = patch.name;
  }
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

  const supabase = getSupabaseOrThrow();
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

export async function setShareToken(
  workspaceId: string,
  journeyId: string,
  token: string | null
): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { error } = await supabase
    .from('journeys')
    .update({
      share_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId);

  if (error) {
    throw new DatabaseError(`Failed to update share token: ${error.message}`, error);
  }
}

export async function deleteJourney(
  workspaceId: string,
  journeyId: string
): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('journeys')
    .update({
      deleted_at: now,
      share_token: null,
      updated_at: now,
    })
    .eq('id', journeyId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to delete journey: ${error.message}`, error);
  }
}

/**
 * Returns journey canvas data by journey id when public share is enabled.
 * Uses share_token as the enable/disable flag (non-null => enabled).
 *
 * @throws NotFoundError when id is invalid, deleted, or share is disabled.
 */
export async function getJourneyByShareId(journeyId: string): Promise<{
  workspace_id: string;
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  nodes: unknown;
  edges: unknown;
}> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('journeys')
    .select(
      'workspace_id, id, name, description, testing_instructions_markdown, canvas_nodes_json, canvas_edges_json, share_token'
    )
    .eq('id', journeyId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch journey by id: ${error.message}`, error);
  }

  if (data === null || !(data as { share_token: string | null }).share_token) {
    throw new NotFoundError('Invalid or expired share link.', 'journey');
  }

  const row = data as {
    workspace_id: string;
    id: string;
    name: string;
    description: string | null;
    testing_instructions_markdown: string | null;
    canvas_nodes_json: unknown;
    canvas_edges_json: unknown;
    share_token: string | null;
  };

  return {
    workspace_id: row.workspace_id,
    id: row.id,
    name: row.name,
    description: row.description,
    testing_instructions_markdown: row.testing_instructions_markdown,
    nodes: row.canvas_nodes_json ?? [],
    edges: row.canvas_edges_json ?? [],
  };
}

/**
 * Returns journey canvas data by share token (public access, no workspace check).
 * Strips internal fields; returns only what is needed to render the read-only canvas.
 *
 * @throws NotFoundError when token is invalid or journey is deleted.
 */
export async function getJourneyByShareToken(token: string): Promise<{
  workspace_id: string;
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  nodes: unknown;
  edges: unknown;
}> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('journeys')
    .select('workspace_id, id, name, description, testing_instructions_markdown, canvas_nodes_json, canvas_edges_json')
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
    workspace_id: string;
    id: string;
    name: string;
    description: string | null;
    testing_instructions_markdown: string | null;
    canvas_nodes_json: unknown;
    canvas_edges_json: unknown;
  };

  return {
    workspace_id: row.workspace_id,
    id: row.id,
    name: row.name,
    description: row.description,
    testing_instructions_markdown: row.testing_instructions_markdown,
    nodes: row.canvas_nodes_json ?? [],
    edges: row.canvas_edges_json ?? [],
  };
}

type TriggerNodeLike = {
  type?: string;
  data?: {
    connectedEvent?: { eventId?: string; variantId?: string | null };
  };
};

/**
 * Count journeys whose canvas references a trigger connected to this event variant.
 */
export async function countJourneysUsingEventVariant(
  workspaceId: string,
  variantId: string
): Promise<number> {
  if (!variantId.trim()) return 0;
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('journeys')
    .select('canvas_nodes_json')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to scan journeys for variant usage: ${error.message}`, error);
  }

  let count = 0;
  for (const row of data ?? []) {
    const nodes = (row as { canvas_nodes_json: unknown }).canvas_nodes_json;
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes as TriggerNodeLike[]) {
      if (node?.type !== 'triggerNode') continue;
      const vid = node?.data?.connectedEvent?.variantId;
      if (typeof vid === 'string' && vid === variantId) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/**
 * Journeys visible on the stakeholder hub: same workspace, individually shared (share_token set).
 */
export async function listJourneysForShareHub(workspaceId: string): Promise<
  { id: string; name: string; description: string | null; updated_at: string }[]
> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('journeys')
    .select('id, name, description, updated_at')
    .eq('workspace_id', workspaceId)
    .not('share_token', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new DatabaseError(`Failed to list shared journeys for hub: ${error.message}`, error);
  }
  return (data ?? []) as {
    id: string;
    name: string;
    description: string | null;
    updated_at: string;
  }[];
}
