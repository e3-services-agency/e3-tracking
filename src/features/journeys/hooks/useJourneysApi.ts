/**
 * Journey API helpers. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 * Shared journey by token uses plain fetch (public endpoint).
 */
import { useStore } from '@/src/store';
import { MOCK_WORKSPACE_ID } from '@/src/features/events/hooks/useEvents';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

/** Hook to use when calling journey APIs so they target the active workspace. */
export function useActiveWorkspaceId(): string {
  return useStore((s) => s.activeWorkspaceId) ?? MOCK_WORKSPACE_ID;
}

export interface ValidatePayloadResult {
  valid: boolean;
  missing_keys?: string[];
}

/**
 * Saves canvas nodes and edges to the backend. PUT /api/journeys/:id/canvas.
 */
export async function saveJourneyCanvasApi(
  journeyId: string,
  journeyName: string,
  nodes: unknown,
  edges: unknown,
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/canvas`, {
      method: 'PUT',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ name: journeyName, nodes, edges }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Save failed',
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Creates a journey row in the backend. POST /api/journeys.
 * Returns the created journey id.
 */
export async function createJourneyApi(
  journeyId: string,
  name: string,
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys`, {
      method: 'POST',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ id: journeyId, name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Create failed',
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Validates payload JSON against the event's always_sent properties.
 * POST /api/journeys/:id/events/:eventId/qa/validate.
 */
export async function validatePayloadApi(
  journeyId: string,
  eventId: string,
  actualJson: string,
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<
  | { success: true; result: ValidatePayloadResult }
  | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(
      `${API_BASE}/api/journeys/${journeyId}/events/${eventId}/qa/validate`,
      {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId },
        body: JSON.stringify({ actualJson }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Validation failed',
      };
    }
    const result = (await res.json()) as ValidatePayloadResult;
    return { success: true, result };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Generate or retrieve share token. POST /api/journeys/:id/share.
 * Returns { token: string }.
 */
export async function getJourneyShareTokenApi(
  journeyId: string,
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/share`, {
      method: 'POST',
      headers: { 'x-workspace-id': workspaceId },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to get share link',
      };
    }
    const data = (await res.json()) as { token: string };
    return { success: true, token: data.token ?? '' };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Fetch shared journey by token (public). GET /api/shared/journeys/:token.
 */
export async function getSharedJourneyByTokenApi(
  token: string
): Promise<
  | { success: true; journey: { id: string; name: string; description: string | null; testing_instructions_markdown: string | null; nodes: unknown; edges: unknown } }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/shared/journeys/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to load shared journey',
      };
    }
    const data = await res.json();
    return { success: true, journey: data };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Downloads the standalone HTML implementation brief for a journey.
 * GET /api/journeys/:id/export/html. Triggers browser download.
 */
export async function downloadJourneyHtmlExportApi(
  journeyId: string,
  filename: string = 'journey-export.html',
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(
      `${API_BASE}/api/journeys/${journeyId}/export/html`,
      { headers: { 'x-workspace-id': workspaceId } }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Export failed',
      };
    }
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Updates journey testing instructions. PATCH /api/journeys/:id.
 */
export async function updateJourneyTestingInstructionsApi(
  journeyId: string,
  testing_instructions_markdown: string | null,
  workspaceId: string = MOCK_WORKSPACE_ID
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}`, {
      method: 'PATCH',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ testing_instructions_markdown }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Update failed',
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}
