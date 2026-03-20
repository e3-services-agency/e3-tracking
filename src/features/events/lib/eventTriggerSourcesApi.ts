import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { SourceRow } from '@/src/types/schema';

export async function listWorkspaceSources(workspaceId: string): Promise<
  { success: true; data: SourceRow[] } | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/sources`, {
      headers: { 'x-workspace-id': workspaceId },
    });
    const body = await res.json().catch(() => []);
    if (!res.ok) {
      return {
        success: false,
        error:
          typeof (body as { error?: unknown })?.error === 'string'
            ? (body as { error: string }).error
            : res.statusText || 'Failed to load sources.',
      };
    }
    return {
      success: true,
      data: Array.isArray(body) ? (body as SourceRow[]) : [],
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to load sources.',
    };
  }
}

export async function createWorkspaceSource(args: {
  workspaceId: string;
  name: string;
  color?: string | null;
}): Promise<
  { success: true; data: SourceRow } | { success: false; error: string }
> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/api/sources`, {
      method: 'POST',
      headers: { 'x-workspace-id': args.workspaceId },
      body: JSON.stringify({
        name: args.name.trim(),
        color: args.color ?? null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error:
          typeof body?.error === 'string'
            ? body.error
            : res.statusText || 'Failed to create source.',
      };
    }
    return {
      success: true,
      data: body as SourceRow,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to create source.',
    };
  }
}
