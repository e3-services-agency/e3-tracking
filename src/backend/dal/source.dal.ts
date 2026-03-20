import { getSupabaseOrThrow } from '../db/supabase';
import type { SourceRow } from '../../types/schema';
import { ConflictError, DatabaseError } from '../errors';

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
