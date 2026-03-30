import { getSupabaseOrThrow } from '../db/supabase';
import type { SourceRow } from '../../types/schema';
import { ConflictError, DatabaseError } from '../errors';

export interface SourceUsageRow {
  source_id: string;
  property_count: number;
  event_count: number;
}

export async function listSources(workspaceId: string): Promise<SourceRow[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) {
    throw new DatabaseError(`Failed to list sources: ${error.message}`, error);
  }

  return (data ?? []) as SourceRow[];
}

export async function createSource(
  workspaceId: string,
  input: { name: string; color?: string | null }
): Promise<SourceRow> {
  const supabase = getSupabaseOrThrow();
  const name = input.name.trim();
  if (!name) {
    throw new DatabaseError('Source name is required.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('sources')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingError) {
    throw new DatabaseError(
      `Failed to check existing source: ${existingError.message}`,
      existingError
    );
  }
  if (existing) {
    throw new ConflictError('A source with that name already exists.');
  }

  const payload = {
    workspace_id: workspaceId,
    name,
    color: input.color ?? null,
    deleted_at: null,
  };

  const { data, error } = await supabase
    .from('sources')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new DatabaseError(`Failed to create source: ${error.message}`, error);
  }

  return data as SourceRow;
}

/**
 * Usage counts per source from canonical relations:
 * - property_sources (joined to non-deleted properties in workspace)
 * - event_sources (joined to non-deleted events in workspace)
 */
export async function getSourceUsage(workspaceId: string): Promise<SourceUsageRow[]> {
  const supabase = getSupabaseOrThrow();

  const { data: sources, error: sourceErr } = await supabase
    .from('sources')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);
  if (sourceErr) {
    throw new DatabaseError(`Failed to list sources for usage: ${sourceErr.message}`, sourceErr);
  }

  const sourceIds = (sources ?? []).map((r: { id: string }) => r.id);
  if (sourceIds.length === 0) return [];

  const { data: properties, error: propErr } = await supabase
    .from('properties')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);
  if (propErr) {
    throw new DatabaseError(`Failed to list properties for source usage: ${propErr.message}`, propErr);
  }
  const propertyIds = new Set((properties ?? []).map((r: { id: string }) => r.id));

  const { data: events, error: eventErr } = await supabase
    .from('events')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null);
  if (eventErr) {
    throw new DatabaseError(`Failed to list events for source usage: ${eventErr.message}`, eventErr);
  }
  const eventIds = new Set((events ?? []).map((r: { id: string }) => r.id));

  const { data: propLinks, error: propLinkErr } = await supabase
    .from('property_sources')
    .select('source_id, property_id')
    .in('source_id', sourceIds);
  if (propLinkErr) {
    throw new DatabaseError(`Failed to list property_sources: ${propLinkErr.message}`, propLinkErr);
  }

  const { data: eventLinks, error: eventLinkErr } = await supabase
    .from('event_sources')
    .select('source_id, event_id')
    .in('source_id', sourceIds);
  if (eventLinkErr) {
    throw new DatabaseError(`Failed to list event_sources: ${eventLinkErr.message}`, eventLinkErr);
  }

  const propertyCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();

  for (const sid of sourceIds) {
    propertyCounts.set(sid, 0);
    eventCounts.set(sid, 0);
  }

  for (const row of propLinks ?? []) {
    const r = row as { source_id: string; property_id: string };
    if (!propertyIds.has(r.property_id)) continue;
    propertyCounts.set(r.source_id, (propertyCounts.get(r.source_id) ?? 0) + 1);
  }

  for (const row of eventLinks ?? []) {
    const r = row as { source_id: string; event_id: string };
    if (!eventIds.has(r.event_id)) continue;
    eventCounts.set(r.source_id, (eventCounts.get(r.source_id) ?? 0) + 1);
  }

  return sourceIds.map((source_id) => ({
    source_id,
    property_count: propertyCounts.get(source_id) ?? 0,
    event_count: eventCounts.get(source_id) ?? 0,
  }));
}

/**
 * Comma-separated source names per property (export HTML property table).
 */
export async function getPropertySourceLabelsByPropertyIds(
  workspaceId: string,
  propertyIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(propertyIds.filter((id) => typeof id === 'string' && id.length > 0))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const supabase = getSupabaseOrThrow();
  const { data: links, error: linkErr } = await supabase
    .from('property_sources')
    .select('property_id, source_id')
    .in('property_id', unique);
  if (linkErr) {
    throw new DatabaseError(`Failed to list property_sources: ${linkErr.message}`, linkErr);
  }

  const sourceIds = [
    ...new Set((links ?? []).map((r: { source_id: string }) => r.source_id)),
  ];
  if (sourceIds.length === 0) {
    for (const pid of unique) out.set(pid, '—');
    return out;
  }

  const { data: sources, error: srcErr } = await supabase
    .from('sources')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .in('id', sourceIds);
  if (srcErr) {
    throw new DatabaseError(`Failed to load sources: ${srcErr.message}`, srcErr);
  }

  const nameById = new Map(
    (sources ?? []).map((s: { id: string; name: string }) => [s.id, s.name])
  );
  const namesByProp = new Map<string, string[]>();
  for (const row of links ?? []) {
    const r = row as { property_id: string; source_id: string };
    const n = nameById.get(r.source_id);
    if (!n) continue;
    const arr = namesByProp.get(r.property_id) ?? [];
    arr.push(n);
    namesByProp.set(r.property_id, arr);
  }

  for (const pid of unique) {
    const list = namesByProp.get(pid);
    out.set(
      pid,
      list && list.length > 0 ? [...new Set(list)].sort().join(', ') : '—'
    );
  }
  return out;
}
