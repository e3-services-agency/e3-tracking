/**
 * Journey API helpers. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 * Shared journey by token uses plain fetch (public endpoint).
 */
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

/**
 * Active workspace UUID for authenticated journey routes (requires WorkspaceShellProvider).
 * Public shared journey views must not use this hook; pass `workspaceId={null}` into JourneyCanvas instead.
 */
export function useActiveWorkspaceId(): string {
  const { activeWorkspaceId } = useWorkspaceShell();
  const t = activeWorkspaceId?.trim();
  if (!t) {
    throw new Error('useActiveWorkspaceId requires a non-empty active workspace from WorkspaceShellProvider');
  }
  return t;
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
  workspaceId: string
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
 * Persists QA runs for a journey.
 * PUT /api/journeys/:id/qa
 */
export async function saveJourneyQARunsApi(
  journeyId: string,
  qaRuns: Array<{ id: string; verifications?: Record<string, any> } & Record<string, any>>,
  workspaceId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/qa`, {
      method: 'PUT',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ qaRuns }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Save QA failed',
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
 * Fetch QA runs for a journey.
 * GET /api/journeys/:id/qa
 */
export async function getJourneyQARunsApi(
  journeyId: string,
  workspaceId: string
): Promise<
  | { success: true; qaRuns: any[] }
  | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/qa`, {
      headers: { 'x-workspace-id': workspaceId },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to load QA runs',
      };
    }
    const data = (await res.json()) as { qaRuns?: any[] };
    return { success: true, qaRuns: Array.isArray(data.qaRuns) ? data.qaRuns : [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/**
 * Creates a journey row in the backend. POST /api/journeys.
 * Returns the created journey id.
 */
export async function createJourneyApi(
  journeyId: string,
  name: string,
  workspaceId: string
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
 * Deletes a journey. DELETE /api/journeys/:id.
 */
export async function deleteJourneyApi(
  journeyId: string,
  workspaceId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}`, {
      method: 'DELETE',
      headers: { 'x-workspace-id': workspaceId },
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Delete failed',
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
 * Renames a journey. PATCH /api/journeys/:id. Body: { name }.
 */
export async function renameJourneyApi(
  journeyId: string,
  name: string,
  workspaceId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}`, {
      method: 'PATCH',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Rename failed',
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
 * Validates payload JSON against effective required properties (base event or variant).
 * POST /api/journeys/:id/events/:eventId/qa/validate.
 */
export async function validatePayloadApi(
  journeyId: string,
  eventId: string,
  actualJson: string,
  workspaceId: string,
  variantId?: string | null
): Promise<
  | { success: true; result: ValidatePayloadResult }
  | { success: false; error: string }
> {
  try {
    const body: { actualJson: string; variant_id?: string | null } = { actualJson };
    if (variantId !== undefined) {
      body.variant_id = variantId;
    }
    const res = await fetchWithAuth(
      `${API_BASE}/api/journeys/${journeyId}/events/${eventId}/qa/validate`,
      {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId },
        body: JSON.stringify(body),
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
  workspaceId: string
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
 * Enable/disable public sharing (stable public URL by journey id).
 * PATCH /api/journeys/:id/share. Body: { enabled }.
 */
export async function setJourneyShareEnabledApi(
  journeyId: string,
  enabled: boolean,
  workspaceId: string
): Promise<{ success: true; enabled: boolean; token?: string } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}/share`, {
      method: 'PATCH',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Update failed',
      };
    }
    const data = (await res.json().catch(() => ({}))) as { enabled?: boolean; token?: string };
    return { success: true, enabled: data.enabled === true, token: typeof data.token === 'string' ? data.token : undefined };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Fetch shared journey by journey id (public). GET /api/shared/journeys/journey/:id.
 */
export async function getSharedJourneyByIdApi(
  journeyId: string
): Promise<
  | { success: true; journey: { id: string; name: string; description: string | null; testing_instructions_markdown: string | null; codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null; nodes: unknown; edges: unknown; eventSnippets?: Record<string, { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }>; qaRuns?: unknown } }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}`);
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
 * Fetch shared journey by token (public). GET /api/shared/journeys/:token.
 */
/** Public hub list row — aligned with internal journeys table (GET /api/journeys enrichment). */
export interface SharedJourneysHubRow {
  id: string;
  name: string;
  updated_at: string;
  nodesCount: number;
  type_counts: { new?: number; enrichment?: number; fix?: number } | null;
  qaRunsCount: number;
  latestQARun: unknown | null;
}

/**
 * Workspace Shared Journey Hub settings. GET /api/journeys/share-hub.
 */
export async function getJourneysShareHubSettingsApi(
  workspaceId: string
): Promise<
  | { success: true; enabled: boolean; token: string | null }
  | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/share-hub`, {
      headers: { 'x-workspace-id': workspaceId },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to load hub settings',
      };
    }
    const data = await res.json();
    return {
      success: true,
      enabled: Boolean(data?.enabled),
      token: typeof data?.token === 'string' ? data.token : null,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Enable or disable the Shared Journey Hub. PATCH /api/journeys/share-hub.
 */
export async function setJourneysShareHubEnabledApi(
  workspaceId: string,
  enabled: boolean
): Promise<
  | { success: true; enabled: boolean; token: string | null }
  | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/share-hub`, {
      method: 'PATCH',
      headers: { 'x-workspace-id': workspaceId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to update hub',
      };
    }
    const data = await res.json();
    return {
      success: true,
      enabled: Boolean(data?.enabled),
      token: typeof data?.token === 'string' ? data.token : null,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/**
 * Public list of shared journeys for the hub. GET /api/shared/journeys-hub/:token.
 */
export async function getSharedJourneysHubListApi(
  token: string
): Promise<
  | { success: true; journeys: SharedJourneysHubRow[] }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/shared/journeys-hub/${encodeURIComponent(token)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body?.error === 'string' ? body.error : res.statusText || 'Failed to load hub',
      };
    }
    const data = await res.json();
    const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
    return { success: true, journeys };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export async function getSharedJourneyByTokenApi(
  token: string
): Promise<
  | { success: true; journey: { id: string; name: string; description: string | null; testing_instructions_markdown: string | null; codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null; nodes: unknown; edges: unknown; eventSnippets?: Record<string, { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }>; qaRuns?: unknown } }
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
  workspaceId: string
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
  workspaceId: string
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

export async function updateJourneyCodegenPreferredStyleApi(
  journeyId: string,
  codegen_preferred_style: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null,
  workspaceId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/journeys/${journeyId}`, {
      method: 'PATCH',
      headers: { 'x-workspace-id': workspaceId },
      body: JSON.stringify({ codegen_preferred_style }),
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
