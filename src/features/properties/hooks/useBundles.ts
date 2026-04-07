/**
 * Workspace property bundles from GET /api/bundles; mutations invalidate/refetch and sync the Zustand catalog.
 */
import { useState, useCallback, useEffect } from 'react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { PropertyBundleRow } from '@/src/types/schema';
import type { PropertyBundle } from '@/src/types';
import { useStore, useActiveData } from '@/src/store';

export type BundleApiRow = PropertyBundleRow & { property_ids: string[] };

function apiRowToBundle(row: BundleApiRow): PropertyBundle {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    propertyIds: row.property_ids ?? [],
  };
}

export interface UseBundlesResult {
  bundles: PropertyBundle[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createBundle: (input: {
    name: string;
    description?: string | null;
    property_ids?: string[];
  }) => Promise<{ success: true; data: PropertyBundle } | { success: false; error: string }>;
  updateBundle: (
    id: string,
    input: { name?: string; description?: string | null; property_ids?: string[] | null }
  ) => Promise<{ success: true; data: PropertyBundle } | { success: false; error: string }>;
  deleteBundle: (id: string) => Promise<{ success: true } | { success: false; error: string }>;
}

export function useBundles(workspaceIdOverride?: string): UseBundlesResult {
  const { activeWorkspaceId, hasValidWorkspaceContext } = useWorkspaceShell();
  const syncPropertyBundlesFromApi = useStore((s) => s.syncPropertyBundlesFromApi);
  const bundlesFromStore = useActiveData().propertyBundles;
  const effectiveWorkspaceId = workspaceIdOverride ?? activeWorkspaceId ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!hasValidWorkspaceContext || !effectiveWorkspaceId.trim()) {
      setError(null);
      setIsLoading(false);
      syncPropertyBundlesFromApi([]);
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/bundles`, {
        headers: { 'x-workspace-id': effectiveWorkspaceId },
      });
      const body = await res.json().catch(() => []);
      if (!res.ok) {
        const msg =
          typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to load bundles.';
        setError(msg);
        syncPropertyBundlesFromApi([]);
        return;
      }
      const rows = Array.isArray(body) ? (body as BundleApiRow[]) : [];
      const mapped = rows.map(apiRowToBundle);
      syncPropertyBundlesFromApi(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load bundles.';
      setError(msg);
      syncPropertyBundlesFromApi([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveWorkspaceId, hasValidWorkspaceContext, syncPropertyBundlesFromApi]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const createBundle = useCallback(
    async (input: {
      name: string;
      description?: string | null;
      property_ids?: string[];
    }): Promise<{ success: true; data: PropertyBundle } | { success: false; error: string }> => {
      if (!effectiveWorkspaceId.trim()) {
        return { success: false, error: 'No workspace selected.' };
      }
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/bundles`, {
          method: 'POST',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify({
            name: input.name,
            description: input.description ?? null,
            property_ids: input.property_ids ?? [],
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            success: false,
            error: typeof body?.error === 'string' ? body.error : res.statusText || 'Create failed.',
          };
        }
        const data = apiRowToBundle(body as BundleApiRow);
        await refetch();
        return { success: true, data };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Create failed.',
        };
      }
    },
    [effectiveWorkspaceId, refetch]
  );

  const updateBundle = useCallback(
    async (
      id: string,
      input: { name?: string; description?: string | null; property_ids?: string[] | null }
    ): Promise<{ success: true; data: PropertyBundle } | { success: false; error: string }> => {
      if (!effectiveWorkspaceId.trim()) {
        return { success: false, error: 'No workspace selected.' };
      }
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/bundles/${id}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify(input),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            success: false,
            error: typeof body?.error === 'string' ? body.error : res.statusText || 'Update failed.',
          };
        }
        const data = apiRowToBundle(body as BundleApiRow);
        await refetch();
        return { success: true, data };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Update failed.',
        };
      }
    },
    [effectiveWorkspaceId, refetch]
  );

  const deleteBundle = useCallback(
    async (id: string): Promise<{ success: true } | { success: false; error: string }> => {
      if (!effectiveWorkspaceId.trim()) {
        return { success: false, error: 'No workspace selected.' };
      }
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/bundles/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            success: false,
            error: typeof body?.error === 'string' ? body.error : res.statusText || 'Delete failed.',
          };
        }
        await refetch();
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Delete failed.',
        };
      }
    },
    [effectiveWorkspaceId, refetch]
  );

  return {
    bundles: bundlesFromStore,
    isLoading,
    error,
    refetch,
    createBundle,
    updateBundle,
    deleteBundle,
  };
}
