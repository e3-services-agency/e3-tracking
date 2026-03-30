/**
 * Single workspace list fetch + derived gate: active workspace must exist in DB and appear in the user's list.
 * Prevents treating the Zustand placeholder UUID or stale IDs as usable context after the list has loaded.
 *
 * Also loads GET /api/workspaces/:id for shell branding/theme (client_name, client_logo_url, client_primary_color)
 * when context is valid — keyed by workspace id so switches never show stale Plan-less shell data from another workspace.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from '@/src/store';
import { useWorkspaces, type WorkspaceItem } from '@/src/features/workspaces/hooks/useWorkspaces';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

type CreateWorkspaceFn = ReturnType<typeof useWorkspaces>['createWorkspace'];

/** Workspace `workspace_settings` row fields used by the app shell (API-backed). */
export type WorkspaceShellSettingsRow = {
  client_primary_color: string | null;
  client_name: string | null;
  client_logo_url: string | null;
};

function parseWorkspaceShellSettings(raw: unknown): WorkspaceShellSettingsRow | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' ? v : v === null ? null : null;
  return {
    client_primary_color: strOrNull(o.client_primary_color),
    client_name: strOrNull(o.client_name),
    client_logo_url: strOrNull(o.client_logo_url),
  };
}

export type WorkspaceShellContextValue = {
  workspaces: WorkspaceItem[];
  isLoading: boolean;
  error: string | null;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: CreateWorkspaceFn;
  /** After list load: false while loading, on fetch error with empty list, when there are no workspaces, or when active id is not in the accessible list. */
  hasValidWorkspaceContext: boolean;
  /** Shown when list has loaded and workspace context is unusable (null while loading). */
  gateMessage: string | null;
  /**
   * Active workspace row id for API `x-workspace-id`. Still persisted in Zustand for header switcher sync;
   * Workspace surfaces should read this from the shell instead of importing the store.
   */
  activeWorkspaceId: string;
  /** `workspaces.name` for the active id (from the member list). Safe label while workspace settings are loading. */
  activeWorkspaceDisplayName: string | null;
  /**
   * Settings for `activeWorkspaceId` only; null if id mismatches an in-flight/stale fetch result (e.g. after switching workspace).
   * Not Plan/Zustand-backed.
   */
  workspaceShellSettings: WorkspaceShellSettingsRow | null;
  workspaceShellSettingsLoading: boolean;
  /**
   * After a successful PATCH from Workspace Settings, merges API `settings` into shell state for Header/Layout.
   * No-op if `workspaceId` is not the current active workspace (avoids overwriting after a mid-save switch).
   */
  applyWorkspaceShellSettingsFromSave: (workspaceId: string, rawSettings: unknown) => void;
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

export function WorkspaceShellProvider({ children }: { children: React.ReactNode }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const hook = useWorkspaces();

  const [shellSettingsByWorkspace, setShellSettingsByWorkspace] = useState<{
    workspaceId: string;
    settings: WorkspaceShellSettingsRow | null;
  } | null>(null);
  const [workspaceShellSettingsLoading, setWorkspaceShellSettingsLoading] = useState(false);

  const { hasValidWorkspaceContext, gateMessage } = useMemo(() => {
    if (hook.isLoading) {
      return { hasValidWorkspaceContext: false, gateMessage: null as string | null };
    }
    if (hook.error && hook.workspaces.length === 0) {
      return {
        hasValidWorkspaceContext: false,
        gateMessage: `Could not load workspaces (${hook.error}). Refresh the page or try again; you must have a loaded, valid workspace selected before continuing.`,
      };
    }
    if (hook.workspaces.length === 0) {
      return {
        hasValidWorkspaceContext: false,
        gateMessage:
          'No workspace is available. Create one from the workspace menu in the header (or ask an admin for access), then select it before continuing.',
      };
    }
    const noActiveId = !activeWorkspaceId?.trim();
    if (noActiveId) {
      return {
        hasValidWorkspaceContext: false,
        gateMessage:
          'Select a workspace from the header menu to open your tracking plan. Nothing is loaded until a valid workspace is chosen.',
      };
    }
    const inList = hook.workspaces.some((w) => w.id === activeWorkspaceId);
    if (!inList) {
      return {
        hasValidWorkspaceContext: false,
        gateMessage:
          'The active workspace is unavailable or invalid for your account. Choose a workspace from the header menu before creating or editing tracking plan items.',
      };
    }
    return { hasValidWorkspaceContext: true, gateMessage: null };
  }, [hook.isLoading, hook.error, hook.workspaces, activeWorkspaceId]);

  const activeWorkspaceIdTrimmed = activeWorkspaceId?.trim() ?? '';

  const activeWorkspaceDisplayName = useMemo(() => {
    if (!activeWorkspaceIdTrimmed) return null;
    return hook.workspaces.find((w) => w.id === activeWorkspaceIdTrimmed)?.name ?? null;
  }, [hook.workspaces, activeWorkspaceIdTrimmed]);

  const workspaceShellSettings = useMemo(() => {
    if (!activeWorkspaceIdTrimmed) return null;
    if (!shellSettingsByWorkspace || shellSettingsByWorkspace.workspaceId !== activeWorkspaceIdTrimmed) {
      return null;
    }
    return shellSettingsByWorkspace.settings;
  }, [activeWorkspaceIdTrimmed, shellSettingsByWorkspace]);

  const activeWorkspaceIdForShellRef = useRef(activeWorkspaceIdTrimmed);
  activeWorkspaceIdForShellRef.current = activeWorkspaceIdTrimmed;

  const applyWorkspaceShellSettingsFromSave = useCallback(
    (workspaceId: string, rawSettings: unknown) => {
      const id = workspaceId.trim();
      if (!id || activeWorkspaceIdForShellRef.current !== id) return;
      const parsed = parseWorkspaceShellSettings(rawSettings);
      setShellSettingsByWorkspace({ workspaceId: id, settings: parsed });
    },
    [],
  );

  useEffect(() => {
    if (!hasValidWorkspaceContext || !activeWorkspaceIdTrimmed) {
      setShellSettingsByWorkspace(null);
      setWorkspaceShellSettingsLoading(false);
      return;
    }

    let cancelled = false;
    const id = activeWorkspaceIdTrimmed;
    setWorkspaceShellSettingsLoading(true);

    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/workspaces/${id}`, {
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          console.error('[WorkspaceShell] Failed to load workspace for shell settings', {
            workspaceId: id,
            status: res.status,
            error: typeof data?.error === 'string' ? data.error : undefined,
          });
          setShellSettingsByWorkspace({ workspaceId: id, settings: null });
          return;
        }
        const parsed = parseWorkspaceShellSettings(data.settings);
        setShellSettingsByWorkspace({ workspaceId: id, settings: parsed });
      } catch (e) {
        if (cancelled) return;
        console.error('[WorkspaceShell] Network error loading workspace settings', {
          workspaceId: id,
          message: e instanceof Error ? e.message : String(e),
        });
        setShellSettingsByWorkspace({ workspaceId: id, settings: null });
      } finally {
        if (!cancelled) setWorkspaceShellSettingsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasValidWorkspaceContext, activeWorkspaceIdTrimmed]);

  const value = useMemo<WorkspaceShellContextValue>(
    () => ({
      workspaces: hook.workspaces,
      isLoading: hook.isLoading,
      error: hook.error,
      fetchWorkspaces: hook.fetchWorkspaces,
      createWorkspace: hook.createWorkspace,
      hasValidWorkspaceContext,
      gateMessage,
      activeWorkspaceId,
      activeWorkspaceDisplayName,
      workspaceShellSettings,
      workspaceShellSettingsLoading,
      applyWorkspaceShellSettingsFromSave,
    }),
    [
      hook.workspaces,
      hook.isLoading,
      hook.error,
      hook.fetchWorkspaces,
      hook.createWorkspace,
      hasValidWorkspaceContext,
      gateMessage,
      activeWorkspaceId,
      activeWorkspaceDisplayName,
      workspaceShellSettings,
      workspaceShellSettingsLoading,
      applyWorkspaceShellSettingsFromSave,
    ]
  );

  return (
    <WorkspaceShellContext.Provider value={value}>{children}</WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShell(): WorkspaceShellContextValue {
  const ctx = useContext(WorkspaceShellContext);
  if (!ctx) {
    throw new Error('useWorkspaceShell must be used within WorkspaceShellProvider');
  }
  return ctx;
}
