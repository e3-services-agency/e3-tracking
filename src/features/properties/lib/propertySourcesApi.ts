import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export async function fetchPropertySourceIds(
  workspaceId: string,
  propertyId: string
): Promise<{ success: true; source_ids: string[] } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/properties/${propertyId}/sources`, {
      headers: { 'x-workspace-id': workspaceId },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error:
          typeof (body as { error?: unknown })?.error === 'string'
            ? (body as { error: string }).error
            : res.statusText || 'Failed to load property sources.',
      };
    }
    const ids = (body as { source_ids?: unknown }).source_ids;
    return {
      success: true,
      source_ids: Array.isArray(ids) ? (ids as string[]) : [],
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to load property sources.',
    };
  }
}
