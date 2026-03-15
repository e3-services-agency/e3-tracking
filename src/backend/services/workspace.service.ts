/**
 * Workspace creation and cloning service.
 * Clones only core schema: workspace_settings, sources, properties, property_sources, events, event_sources, event_properties.
 * Does NOT clone: journeys, journey_events, qa_runs, qa_run_evidence, qa_run_payloads.
 */
import { getSupabase } from '../db/supabase';
import type { WorkspaceRow } from '../../types/schema';
import { DatabaseError, NotFoundError } from '../errors';

export interface CreateWorkspaceInput {
  name: string;
  cloneFromWorkspaceId?: string | null;
  /** Optional client name for portfolio grouping; stored in workspace_settings. */
  client_name?: string | null;
  /** When set, the user is added as admin in workspace_members. */
  userId?: string | null;
}

/**
 * Creates a new workspace. If cloneFromWorkspaceId is provided, deep-copies
 * workspace_settings, sources, properties, property_sources, events, event_sources, event_properties
 * into the new workspace with new UUIDs. Journeys and QA data are not cloned.
 */
export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<WorkspaceRow> {
  const supabase = getSupabase();
  const name = input.name?.trim() ?? '';
  if (!name) {
    throw new Error('Workspace name is required.');
  }

  const { data: newWorkspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      name,
      deleted_at: null,
    })
    .select()
    .single();

  if (workspaceError) {
    throw new DatabaseError(
      `Failed to create workspace: ${workspaceError.message}`,
      workspaceError
    );
  }
  if (!newWorkspace) {
    throw new DatabaseError('Create workspace returned no row.');
  }

  const newWorkspaceId = (newWorkspace as WorkspaceRow).id;

  if (input.userId) {
    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: newWorkspaceId,
      user_id: input.userId,
      role: 'admin',
    });
    if (memberError) {
      throw new DatabaseError(
        `Failed to add workspace member: ${memberError.message}`,
        memberError
      );
    }
  }

  if (!input.cloneFromWorkspaceId?.trim()) {
    await ensureWorkspaceSettings(supabase, newWorkspaceId, {
      client_name: input.client_name?.trim() || null,
    });
    return newWorkspace as WorkspaceRow;
  }

  const templateId = input.cloneFromWorkspaceId.trim();

  const template = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', templateId)
    .is('deleted_at', null)
    .maybeSingle();

  if (template.error) {
    throw new DatabaseError(
      `Failed to fetch template workspace: ${template.error.message}`,
      template.error
    );
  }
  if (!template.data) {
    throw new NotFoundError(
      'Template workspace not found or deleted.',
      'workspace'
    );
  }

  const sourceIdMap = new Map<string, string>();
  const propertyIdMap = new Map<string, string>();
  const eventIdMap = new Map<string, string>();

  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .eq('workspace_id', templateId)
    .is('deleted_at', null);

  if (sources && sources.length > 0) {
    for (const row of sources as { id: string; name: string; color: string | null; created_at: string; updated_at: string }[]) {
      const { data: inserted } = await supabase
        .from('sources')
        .insert({
          workspace_id: newWorkspaceId,
          name: row.name,
          color: row.color,
          deleted_at: null,
        })
        .select('id')
        .single();
      if (inserted && (inserted as { id: string }).id) {
        sourceIdMap.set(row.id, (inserted as { id: string }).id);
      }
    }
  }

  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .eq('workspace_id', templateId)
    .is('deleted_at', null);

  if (properties && properties.length > 0) {
    for (const row of properties as Record<string, unknown>[]) {
      const { id: _oldId, workspace_id: _w, created_at: _ca, updated_at: _ua, ...rest } = row;
      const { data: inserted } = await supabase
        .from('properties')
        .insert({
          ...rest,
          workspace_id: newWorkspaceId,
          deleted_at: null,
        })
        .select('id')
        .single();
      if (inserted && (inserted as { id: string }).id) {
        propertyIdMap.set(row.id as string, (inserted as { id: string }).id);
      }
    }
  }

  let propertySources: { property_id: string; source_id: string }[] | null = null;
  if (propertyIdMap.size > 0) {
    const { data } = await supabase
      .from('property_sources')
      .select('property_id, source_id')
      .in('property_id', [...propertyIdMap.keys()]);
    propertySources = data as { property_id: string; source_id: string }[] | null;
  }

  if (propertySources && propertySources.length > 0) {
    const newRows = propertySources
      .filter((r) => propertyIdMap.has(r.property_id) && sourceIdMap.has(r.source_id))
      .map((r) => ({
        property_id: propertyIdMap.get(r.property_id)!,
        source_id: sourceIdMap.get(r.source_id)!,
      }));
    if (newRows.length > 0) {
      await supabase.from('property_sources').insert(newRows);
    }
  }

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('workspace_id', templateId)
    .is('deleted_at', null);

  if (events && events.length > 0) {
    for (const row of events as Record<string, unknown>[]) {
      const { id: _oldId, workspace_id: _w, created_at: _ca, updated_at: _ua, ...rest } = row;
      const { data: inserted } = await supabase
        .from('events')
        .insert({
          ...rest,
          workspace_id: newWorkspaceId,
          deleted_at: null,
        })
        .select('id')
        .single();
      if (inserted && (inserted as { id: string }).id) {
        eventIdMap.set(row.id as string, (inserted as { id: string }).id);
      }
    }
  }

  let eventSources: { event_id: string; source_id: string }[] | null = null;
  if (eventIdMap.size > 0) {
    const { data } = await supabase
      .from('event_sources')
      .select('event_id, source_id')
      .in('event_id', [...eventIdMap.keys()]);
    eventSources = data as { event_id: string; source_id: string }[] | null;
  }

  if (eventSources && eventSources.length > 0) {
    const newRows = eventSources
      .filter((r) => eventIdMap.has(r.event_id) && sourceIdMap.has(r.source_id))
      .map((r) => ({
        event_id: eventIdMap.get(r.event_id)!,
        source_id: sourceIdMap.get(r.source_id)!,
      }));
    if (newRows.length > 0) {
      await supabase.from('event_sources').insert(newRows);
    }
  }

  let eventProperties: { event_id: string; property_id: string; presence: string }[] | null = null;
  if (eventIdMap.size > 0) {
    const { data } = await supabase
      .from('event_properties')
      .select('event_id, property_id, presence, created_at, updated_at')
      .in('event_id', [...eventIdMap.keys()]);
    eventProperties = data as { event_id: string; property_id: string; presence: string }[] | null;
  }

  if (eventProperties && eventProperties.length > 0) {
    const newRows = eventProperties
      .filter((r) => eventIdMap.has(r.event_id) && propertyIdMap.has(r.property_id))
      .map((r) => ({
        event_id: eventIdMap.get(r.event_id)!,
        property_id: propertyIdMap.get(r.property_id)!,
        presence: r.presence,
      }));
    if (newRows.length > 0) {
      await supabase.from('event_properties').insert(newRows);
    }
  }

  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('audit_rules_json')
    .eq('workspace_id', templateId)
    .maybeSingle();

  if (settings) {
    await supabase.from('workspace_settings').insert({
      workspace_id: newWorkspaceId,
      audit_rules_json: (settings as { audit_rules_json: unknown }).audit_rules_json ?? '{}',
      ...(input.client_name?.trim() ? { client_name: input.client_name.trim() } : {}),
    });
  } else {
    await ensureWorkspaceSettings(supabase, newWorkspaceId, {
      client_name: input.client_name?.trim() || null,
    });
  }

  return newWorkspace as WorkspaceRow;
}

async function ensureWorkspaceSettings(
  supabase: ReturnType<typeof getSupabase>,
  workspaceId: string,
  opts?: { client_name?: string | null }
): Promise<void> {
  const { error } = await supabase.from('workspace_settings').insert({
    workspace_id: workspaceId,
    audit_rules_json: '{}',
    ...(opts?.client_name != null ? { client_name: opts.client_name } : {}),
  });
  if (error) {
    throw new DatabaseError(
      `Failed to create workspace settings: ${error.message}`,
      error
    );
  }
}
