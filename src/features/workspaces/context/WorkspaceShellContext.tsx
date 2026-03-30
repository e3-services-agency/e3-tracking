/**
 * Single workspace list fetch + derived gate: active workspace must exist in DB and appear in the user's list.
 * Prevents treating the Zustand placeholder UUID or stale IDs as usable context after the list has loaded.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useStore } from '@/src/store';
import { useWorkspaces, type WorkspaceItem } from '@/src/features/workspaces/hooks/useWorkspaces';

type CreateWorkspaceFn = ReturnType<typeof useWorkspaces>['createWorkspace'];

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
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

export function WorkspaceShellProvider({ children }: { children: React.ReactNode }) {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const hook = useWorkspaces();

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

  const value = useMemo<WorkspaceShellContextValue>(
    () => ({
      workspaces: hook.workspaces,
      isLoading: hook.isLoading,
      error: hook.error,
      fetchWorkspaces: hook.fetchWorkspaces,
      createWorkspace: hook.createWorkspace,
      hasValidWorkspaceContext,
      gateMessage,
    }),
    [
      hook.workspaces,
      hook.isLoading,
      hook.error,
      hook.fetchWorkspaces,
      hook.createWorkspace,
      hasValidWorkspaceContext,
      gateMessage,
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
