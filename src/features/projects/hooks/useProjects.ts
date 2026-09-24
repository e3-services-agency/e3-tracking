/**
 * Projects list + create (D-15, replaces useWorkspaces.ts). Local auth mode (D-13): no user-scoped
 * membership filter — `GET /api/projects` returns every project with its client embedded.
 */
import { useState, useCallback, useEffect } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export interface ClientSummary {
  id: string;
  key: string;
  name: string;
}

export interface ProjectItem {
  id: string;
  key: string;
  name: string;
  client_id: string;
  client: ClientSummary | null;
  client_primary_color: string | null;
  client_logo_path: string | null;
  bloomreach_api_customer_id_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to fetch projects');
        setProjects([]);
        return;
      }
      setProjects(Array.isArray(data) ? (data as ProjectItem[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(
    async (input: { client_id: string; key: string; name: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false as const,
          error: typeof data?.error === 'string' ? data.error : res.statusText || 'Failed to create project',
        };
      }
      const project = data as ProjectItem;
      setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true as const, project };
    },
    []
  );

  return { projects, isLoading, error, fetchProjects, createProject };
}
