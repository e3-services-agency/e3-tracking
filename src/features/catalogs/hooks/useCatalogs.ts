/**
 * Catalogs API hook. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 */
import { useState, useCallback, useEffect } from 'react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type {
  CatalogFieldDataType,
  CatalogFieldFamily,
  CatalogFieldItemLevel,
  CatalogFieldRow,
  CatalogFieldSourceMapping,
  CatalogRow,
  CatalogType,
} from '@/src/types/schema';

export type CatalogCreateInput = {
  name: string;
  description?: string | null;
  owner: string;
  source_system: string;
  sync_method: string;
  update_frequency: string;
  catalog_type?: CatalogType;
};

export type CatalogFieldCreateInput = {
  name: string;
  description?: string | null;
  data_type: CatalogFieldDataType;
  is_lookup_key?: boolean;
  field_family: CatalogFieldFamily;
  item_level: CatalogFieldItemLevel;
  source_mapping_json?: CatalogFieldSourceMapping | null;
};

export function useCatalogs() {
  const { activeWorkspaceId: workspaceId } = useWorkspaceShell();
  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalogs = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/catalogs`, {
        headers: { 'x-workspace-id': workspaceId },
      });
      if (!res.ok) {
        setError(res.statusText || 'Failed to fetch catalogs');
        setCatalogs([]);
        return;
      }
      const data = (await res.json()) as CatalogRow[];
      setCatalogs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setCatalogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  const createCatalog = useCallback(
    async (
      input: CatalogCreateInput
    ): Promise<{ success: true; data: CatalogRow } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs`, {
          method: 'POST',
          headers: { 'x-workspace-id': workspaceId },
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 201 && data?.id) {
          setCatalogs((prev) => [...prev, data as CatalogRow].sort((a, b) => a.name.localeCompare(b.name)));
          return { success: true, data: data as CatalogRow };
        }
        return { success: false, error: (data?.error as string) || res.statusText || 'Create failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const updateCatalog = useCallback(
    async (
      catalogId: string,
      input: Partial<CatalogCreateInput>
    ): Promise<{ success: true; data: CatalogRow } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': workspaceId },
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) {
          setCatalogs((prev) =>
            prev.map((c) => (c.id === catalogId ? (data as CatalogRow) : c)).sort((a, b) => a.name.localeCompare(b.name))
          );
          return { success: true, data: data as CatalogRow };
        }
        return { success: false, error: (data?.error as string) || res.statusText || 'Update failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const deleteCatalog = useCallback(
    async (catalogId: string): Promise<{ success: true } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': workspaceId },
        });
        if (res.status === 204 || res.ok) {
          setCatalogs((prev) => prev.filter((c) => c.id !== catalogId));
          return { success: true };
        }
        const data = await res.json().catch(() => ({}));
        return { success: false, error: (data?.error as string) || res.statusText || 'Delete failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const fetchCatalogFields = useCallback(
    async (catalogId: string): Promise<CatalogFieldRow[]> => {
      if (!workspaceId) return [];
      const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}/fields`, {
        headers: { 'x-workspace-id': workspaceId },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    [workspaceId]
  );

  const createCatalogField = useCallback(
    async (
      catalogId: string,
      input: CatalogFieldCreateInput
    ): Promise<{ success: true; data: CatalogFieldRow } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}/fields`, {
          method: 'POST',
          headers: { 'x-workspace-id': workspaceId },
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 201 && data?.id) {
          return { success: true, data: data as CatalogFieldRow };
        }
        return { success: false, error: (data?.error as string) || res.statusText || 'Create failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const setFieldLookupKey = useCallback(
    async (
      catalogId: string,
      fieldId: string
    ): Promise<{ success: true; data: CatalogFieldRow } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}/fields/${fieldId}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': workspaceId },
          body: JSON.stringify({ is_lookup_key: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) {
          return { success: true, data: data as CatalogFieldRow };
        }
        return { success: false, error: (data?.error as string) || res.statusText || 'Update failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const updateCatalogField = useCallback(
    async (
      catalogId: string,
      fieldId: string,
      input: Partial<CatalogFieldCreateInput>
    ): Promise<{ success: true; data: CatalogFieldRow } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}/fields/${fieldId}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': workspaceId },
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.id) {
          return { success: true, data: data as CatalogFieldRow };
        }
        return { success: false, error: (data?.error as string) || res.statusText || 'Update failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  const deleteCatalogField = useCallback(
    async (catalogId: string, fieldId: string): Promise<{ success: true } | { success: false; error: string }> => {
      if (!workspaceId) return { success: false, error: 'No workspace' };
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/catalogs/${catalogId}/fields/${fieldId}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': workspaceId },
        });
        if (res.status === 204 || res.ok) return { success: true };
        const data = await res.json().catch(() => ({}));
        return { success: false, error: (data?.error as string) || res.statusText || 'Delete failed' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Network error' };
      }
    },
    [workspaceId]
  );

  return {
    catalogs,
    isLoading,
    error,
    fetchCatalogs,
    createCatalog,
    updateCatalog,
    deleteCatalog,
    fetchCatalogFields,
    createCatalogField,
    setFieldLookupKey,
    updateCatalogField,
    deleteCatalogField,
  };
}
