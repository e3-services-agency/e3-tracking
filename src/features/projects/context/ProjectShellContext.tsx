/**
 * Single project list fetch + derived gate: the active project must exist in the API list.
 * Replaces the pre-D-15 scope shell context. Also loads `GET /api/projects/:id` for shell branding
 * (client name, logo, primary color) when context is valid.
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
import { useProjects, type ProjectItem } from '@/src/features/projects/hooks/useProjects';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { DEFAULT_NAMING_CONVENTION, NAMING_CONVENTIONS, type NamingConvention } from '@/src/domain/enums';

type CreateProjectFn = ReturnType<typeof useProjects>['createProject'];

export type ProjectShellSettings = {
  client_primary_color: string | null;
  client_logo_path: string | null;
  client_name: string | null;
  /** D-65 (T-4-22): drives the inline naming warnings in the event and property editors. */
  naming_convention: NamingConvention;
};

export type ProjectShellContextValue = {
  projects: ProjectItem[];
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: CreateProjectFn;
  hasValidProjectContext: boolean;
  gateMessage: string | null;
  activeProjectId: string;
  activeProjectDisplayName: string | null;
  projectShellSettings: ProjectShellSettings | null;
};

const ProjectShellContext = createContext<ProjectShellContextValue | null>(null);

export function ProjectShellProvider({ children }: { children: React.ReactNode }) {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const hook = useProjects();

  const [settingsByProject, setSettingsByProject] = useState<{
    projectId: string;
    settings: ProjectShellSettings | null;
  } | null>(null);

  const { hasValidProjectContext, gateMessage } = useMemo(() => {
    if (hook.isLoading) return { hasValidProjectContext: false, gateMessage: null as string | null };
    if (hook.error && hook.projects.length === 0) {
      return {
        hasValidProjectContext: false,
        gateMessage: `Could not load projects (${hook.error}). Refresh the page or try again.`,
      };
    }
    if (hook.projects.length === 0) {
      return {
        hasValidProjectContext: false,
        gateMessage: 'No project is available. Create a client and a project from the project switcher.',
      };
    }
    if (!activeProjectId?.trim()) {
      return {
        hasValidProjectContext: false,
        gateMessage: 'Select a project from the header menu to open its tracking plan.',
      };
    }
    if (!hook.projects.some((p) => p.id === activeProjectId)) {
      return {
        hasValidProjectContext: false,
        gateMessage: 'The active project is unavailable. Choose a project from the header menu.',
      };
    }
    return { hasValidProjectContext: true, gateMessage: null };
  }, [hook.isLoading, hook.error, hook.projects, activeProjectId]);

  const activeProjectIdTrimmed = activeProjectId?.trim() ?? '';

  const activeProjectDisplayName = useMemo(() => {
    if (!activeProjectIdTrimmed) return null;
    return hook.projects.find((p) => p.id === activeProjectIdTrimmed)?.name ?? null;
  }, [hook.projects, activeProjectIdTrimmed]);

  const projectShellSettings = useMemo(() => {
    if (!activeProjectIdTrimmed) return null;
    if (!settingsByProject || settingsByProject.projectId !== activeProjectIdTrimmed) return null;
    return settingsByProject.settings;
  }, [activeProjectIdTrimmed, settingsByProject]);

  const activeRef = useRef(activeProjectIdTrimmed);
  activeRef.current = activeProjectIdTrimmed;

  useEffect(() => {
    if (!hasValidProjectContext || !activeProjectIdTrimmed) {
      setSettingsByProject(null);
      return;
    }
    let cancelled = false;
    const id = activeProjectIdTrimmed;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/projects/${id}`, {
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          setSettingsByProject({ projectId: id, settings: null });
          return;
        }
        setSettingsByProject({
          projectId: id,
          settings: {
            client_primary_color: (data.client_primary_color as string | null) ?? null,
            client_logo_path: (data.client_logo_path as string | null) ?? null,
            client_name: ((data.client as { name?: string } | null)?.name as string | undefined) ?? null,
            naming_convention: (NAMING_CONVENTIONS as readonly unknown[]).includes(data.naming_convention)
              ? (data.naming_convention as NamingConvention)
              : DEFAULT_NAMING_CONVENTION,
          },
        });
      } catch {
        if (!cancelled) setSettingsByProject({ projectId: id, settings: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  // `hook.projects` changes after Settings saves (it calls `fetchProjects`), so a changed naming
  // convention reaches the editors without a reload.
  }, [hasValidProjectContext, activeProjectIdTrimmed, hook.projects]);

  const value = useMemo<ProjectShellContextValue>(
    () => ({
      projects: hook.projects,
      isLoading: hook.isLoading,
      error: hook.error,
      fetchProjects: hook.fetchProjects,
      createProject: hook.createProject,
      hasValidProjectContext,
      gateMessage,
      activeProjectId,
      activeProjectDisplayName,
      projectShellSettings,
    }),
    [
      hook.projects,
      hook.isLoading,
      hook.error,
      hook.fetchProjects,
      hook.createProject,
      hasValidProjectContext,
      gateMessage,
      activeProjectId,
      activeProjectDisplayName,
      projectShellSettings,
    ]
  );

  return <ProjectShellContext.Provider value={value}>{children}</ProjectShellContext.Provider>;
}

export function useProjectShell(): ProjectShellContextValue {
  const ctx = useContext(ProjectShellContext);
  if (!ctx) throw new Error('useProjectShell must be used within ProjectShellProvider');
  return ctx;
}
