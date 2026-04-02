/**
 * API hooks for Properties. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 */
import { useState, useCallback, useEffect } from 'react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { PropertyRow, CreatePropertyInput, PropertyMappingType } from '@/src/types/schema';

/** Mock workspace ID until auth/workspace context exists. Replace with useWorkspace() or similar. */
export const MOCK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: string;
}

export type PropertyUpdatePayload = Partial<Pick<
  PropertyRow,
  'context' | 'name' | 'description' | 'category' | 'pii' | 'data_type' | 'data_formats'
  | 'value_schema_json' | 'object_child_property_refs_json' | 'example_values_json' | 'name_mappings_json'
  | 'mapped_catalog_id' | 'mapped_catalog_field_id' | 'mapping_type'
>> & {
  /**
   * When this key is present on PATCH, server replaces property_sources (deduped).
   * Omit the key to leave links unchanged. `[]` clears all links.
   */
  source_ids?: string[] | null;
  /**
   * When present, server replaces `property_bundle_items` for this property (membership in named bundles).
   */
  bundle_ids?: string[] | null;
};

export interface UsePropertiesResult {
  properties: PropertyRow[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
  createProperty: (payload: CreatePropertyInput) => Promise<{ success: true; data: PropertyRow } | { success: false; error: ApiError }>;
  updateProperty: (id: string, payload: PropertyUpdatePayload) => Promise<{ success: true; data: PropertyRow } | { success: false; error: ApiError }>;
  deleteProperty: (id: string) => Promise<{ success: true } | { success: false; error: ApiError }>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const message = typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed';
  return {
    status: res.status,
    code: body?.code ?? 'UNKNOWN',
    message,
    details: body?.details,
  };
}

export function useProperties(workspaceId?: string): UsePropertiesResult {
  const { activeWorkspaceId } = useWorkspaceShell();
  const effectiveWorkspaceId = workspaceId ?? activeWorkspaceId ?? MOCK_WORKSPACE_ID;

  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/properties`, {
        headers: { 'x-workspace-id': effectiveWorkspaceId },
      });
      if (!res.ok) {
        setError(await parseErrorResponse(res));
        setProperties([]);
        return;
      }
      const data = (await res.json()) as PropertyRow[];
      setProperties(Array.isArray(data) ? data : []);
    } catch (err) {
      setError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Failed to fetch properties.',
      });
      setProperties([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createProperty = useCallback(
    async (
      payload: CreatePropertyInput
    ): Promise<{ success: true; data: PropertyRow } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/properties`, {
          method: 'POST',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 201 && body?.id) {
          const created = body as PropertyRow;
          setProperties((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
          return { success: true, data: created };
        }

        const apiError: ApiError = {
          status: res.status,
          code: body?.code ?? 'UNKNOWN',
          message: typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
          details: body?.details,
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create property.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const updateProperty = useCallback(
    async (
      id: string,
      payload: PropertyUpdatePayload
    ): Promise<{ success: true; data: PropertyRow } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/properties/${id}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.id) {
          const updated = body as PropertyRow;
          setProperties((prev) =>
            prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
          );
          return { success: true, data: updated };
        }
        const apiError: ApiError = {
          status: res.status,
          code: body?.code ?? 'UNKNOWN',
          message: typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
          details: body?.details,
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to update property.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const deleteProperty = useCallback(
    async (
      id: string
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/properties/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
        });
        if (res.ok) {
          setProperties((prev) => prev.filter((p) => p.id !== id));
          return { success: true };
        }
        const apiError = await parseErrorResponse(res);
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Failed to delete property.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const clearMutationError = useCallback(() => setMutationError(null), []);

  return {
    properties,
    isLoading,
    error,
    refetch,
    createProperty,
    updateProperty,
    deleteProperty,
    mutationError,
    clearMutationError,
  };
}
