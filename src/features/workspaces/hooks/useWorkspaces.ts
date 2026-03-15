/**
 * Workspaces: list via Supabase (RLS), create via API. Uses fetchWithAuth for create (401 → redirect to login).
 */
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { getSupabaseClient } from '@/src/lib/supabase';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export interface WorkspaceItem {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function useWorkspaces() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: wsData, error: err } = await supabase
        .from('workspaces')
        .select('id, name, created_at, updated_at, deleted_at')
        .is('deleted_at', null)
        .order('name');
      if (err) {
        setError(err.message || 'Failed to fetch workspaces');
        setWorkspaces([]);
        return;
      }
      const list = (wsData ?? []) as Omit<WorkspaceItem, 'client_name'>[];
      if (list.length === 0) {
        setWorkspaces([]);
        return;
      }
      const ids = list.map((w) => w.id);
      const { data: settingsData } = await supabase
        .from('workspace_settings')
        .select('workspace_id, client_name')
        .in('workspace_id', ids);
      const clientNameByWorkspaceId = new Map<string, string | null>();
      for (const row of settingsData ?? []) {
        const r = row as { workspace_id: string; client_name: string | null };
        clientNameByWorkspaceId.set(r.workspace_id, r.client_name ?? null);
      }
      const workspacesWithClient: WorkspaceItem[] = list.map((w) => ({
        ...w,
        client_name: clientNameByWorkspaceId.get(w.id) ?? null,
      }));
      setWorkspaces(workspacesWithClient);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setWorkspaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const createWorkspace = useCallback(
    async (
      name: string,
      cloneFromWorkspaceId?: string | null,
      clientName?: string | null
    ) => {
      const res = await fetchWithAuth(`${API_BASE}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cloneFromWorkspaceId: cloneFromWorkspaceId || undefined,
          client_name: clientName?.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false as const,
          error: typeof data?.error === 'string' ? data.error : res.statusText || 'Failed to create workspace',
        };
      }
      const raw = data as WorkspaceItem & { client_name?: string | null };
      const workspace: WorkspaceItem = {
        id: raw.id,
        name: raw.name,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        deleted_at: raw.deleted_at ?? null,
        client_name: raw.client_name ?? clientName?.trim() ?? null,
      };
      setWorkspaces((prev) => [...prev, workspace].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true as const, workspace };
    },
    []
  );

  return { workspaces, isLoading, error, fetchWorkspaces, createWorkspace };
}
