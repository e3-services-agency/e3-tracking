/**
 * Workspace Data Access Layer.
 * All functions require workspaceId; every query enforces workspace_id.
 */
import { getSupabase } from '../db/supabase.js';
/**
 * Lists all non-deleted workspaces (for template dropdown and switcher).
 */
export async function listWorkspaces() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
    if (error) {
        throw new Error(`Failed to list workspaces: ${error.message}`);
    }
    return (data ?? []);
}
/**
 * Returns a workspace by id if it exists and is not deleted.
 */
export async function getWorkspaceById(id) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) {
        throw new Error(`Failed to fetch workspace: ${error.message}`);
    }
    return data;
}
/**
 * Fetches workspace_settings for the given workspace.
 */
export async function getWorkspaceSettings(workspaceId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (error) {
        throw new Error(`Failed to fetch workspace settings: ${error.message}`);
    }
    if (data === null) {
        return null;
    }
    const row = data;
    return {
        workspace_id: row.workspace_id,
        audit_rules_json: row.audit_rules_json ?? '{}',
        client_primary_color: row.client_primary_color ?? null,
        client_name: row.client_name ?? null,
        client_logo_url: row.client_logo_url ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
export async function updateWorkspace(workspaceId, updates) {
    const supabase = getSupabase();
    if (updates.name !== undefined) {
        const { data, error } = await supabase
            .from('workspaces')
            .update({ name: updates.name.trim(), updated_at: new Date().toISOString() })
            .eq('id', workspaceId)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(`Failed to update workspace: ${error.message}`);
        return data;
    }
    return getWorkspaceById(workspaceId);
}
export async function updateWorkspaceSettings(workspaceId, updates) {
    const supabase = getSupabase();
    const payload = { updated_at: new Date().toISOString() };
    if (updates.client_primary_color !== undefined)
        payload.client_primary_color = updates.client_primary_color;
    if (updates.client_name !== undefined)
        payload.client_name = updates.client_name;
    if (updates.client_logo_url !== undefined)
        payload.client_logo_url = updates.client_logo_url;
    const { error } = await supabase
        .from('workspace_settings')
        .update(payload)
        .eq('workspace_id', workspaceId);
    if (error)
        throw new Error(`Failed to update workspace settings: ${error.message}`);
}
export async function listWorkspaceMembers(workspaceId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, user_id, role, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('role');
    if (error)
        throw new Error(`Failed to list workspace members: ${error.message}`);
    return (data ?? []);
}
export async function addWorkspaceMember(workspaceId, userId, role = 'member') {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspace_members')
        .insert({ workspace_id: workspaceId, user_id: userId, role, updated_at: new Date().toISOString() })
        .select()
        .single();
    if (error)
        throw new Error(`Failed to add workspace member: ${error.message}`);
    return data;
}
export async function getUserIdByEmail(email) {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('get_user_id_by_email', { user_email: email.trim() });
    if (error)
        return null;
    return typeof data === 'string' ? data : null;
}
export async function getWorkspaceMember(workspaceId, userId) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, user_id, role, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error)
        return null;
    return data;
}
