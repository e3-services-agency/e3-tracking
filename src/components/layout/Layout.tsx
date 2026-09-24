import React, { useRef, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ProjectGateBanner } from './ProjectGateBanner';
import { ProjectShellProvider, useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { Events } from '@/src/pages/Events';
import { Properties } from '@/src/pages/Properties';
import { Sources } from '@/src/pages/Sources';
import { Journeys } from '@/src/pages/Journeys';
import { Settings } from '@/src/pages/Settings';
import { Documentation } from '@/src/pages/Documentation';
import { Clients } from '@/src/pages/Clients';

import { JourneysList } from '@/src/pages/JourneysList';
import { Catalogs } from '@/src/pages/Catalogs';
import { TrackingPlanAuditConfig } from '@/src/pages/TrackingPlanAuditConfig';

const DEFAULT_BRAND_PRIMARY = 'var(--e3-emerald)';
const SIDEBAR_COLLAPSED_KEY = 'e3-tracking.sidebarCollapsed';
const BASE =
  typeof import.meta !== 'undefined' && (import.meta.env?.BASE_URL != null)
    ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
    : '';

function getPathWithoutBase(pathname: string): string {
  if (!BASE) return pathname;
  return pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
}

/** URL prefix `/p/<key>` (D-15, replaces `/w/<workspace_key>`). */
function parseProjectFromPath(pathname: string): { projectKey: string | null; restPath: string } {
  const path = getPathWithoutBase(pathname);
  const m = path.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!m) return { projectKey: null, restPath: path };
  return { projectKey: m[1] ?? null, restPath: m[2] ?? '/' };
}

/** Maps the path after optional `/p/:projectKey` to the main shell tab. */
function mainRouteStateFromRestPath(restPath: string): { tab: string; journeyId: string | null } {
  const raw = (restPath.replace(/\/$/, '') || '/').trim() || '/';
  const journeyMatch = raw.match(/^\/journeys(?:\/([^/]+))?\/?$/);
  if (journeyMatch) {
    return journeyMatch[1]
      ? { tab: 'journeys', journeyId: journeyMatch[1] }
      : { tab: 'journeysList', journeyId: null };
  }
  switch (raw) {
    case '/':
    case '/events':
      return { tab: 'events', journeyId: null };
    case '/properties':
      return { tab: 'properties', journeyId: null };
    case '/catalogs':
      return { tab: 'catalogs', journeyId: null };
    case '/sources':
      return { tab: 'sources', journeyId: null };
    case '/clients':
      return { tab: 'clients', journeyId: null };
    case '/settings':
      return { tab: 'settings', journeyId: null };
    case '/documentation':
      return { tab: 'documentation', journeyId: null };
    case '/audit-config':
      return { tab: 'auditConfig', journeyId: null };
    default:
      return { tab: 'events', journeyId: null };
  }
}

function getInitialMainRouteState(): { tab: string; journeyId: string | null } {
  if (typeof window === 'undefined') return { tab: 'events', journeyId: null };
  const { restPath } = parseProjectFromPath(window.location.pathname);
  return mainRouteStateFromRestPath(restPath);
}

/** `projectKeyForUrl` is the short project key segment (not UUID). Pass null to drop /p/... from the path. */
function pushPath(nextPath: string, projectKeyForUrl?: string | null): void {
  try {
    const prefix = projectKeyForUrl ? `/p/${projectKeyForUrl}` : '';
    const full = `${BASE}${prefix}${nextPath.startsWith('/') ? nextPath : `/${nextPath}`}`;
    if (typeof window !== 'undefined' && window.location.pathname !== full) {
      window.history.pushState({}, '', full);
    }
  } catch {
    // ignore
  }
}

export function Layout() {
  return (
    <ProjectShellProvider>
      <LayoutInner />
    </ProjectShellProvider>
  );
}

function LayoutInner() {
  const { isLoading, hasValidProjectContext, gateMessage, activeProjectId, projectShellSettings, projects } =
    useProjectShell();

  const [activeTab, setActiveTab] = useState(() => getInitialMainRouteState().tab);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(
    () => getInitialMainRouteState().journeyId,
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeProjectKey = useStore((s) => s.activeProjectKey);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const dirtyRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  const selectedJourneyIdRef = useRef(selectedJourneyId);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    selectedJourneyIdRef.current = selectedJourneyId;
  }, [selectedJourneyId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (raw === null) return;
      setIsSidebarCollapsed(raw === '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const root = document.documentElement;
    const primary = projectShellSettings?.client_primary_color?.trim() || DEFAULT_BRAND_PRIMARY;
    root.style.setProperty('--brand-primary', primary);
    return () => {
      root.style.removeProperty('--brand-primary');
    };
  }, [activeProjectId, projectShellSettings?.client_primary_color]);

  // Resolve the active project from `/p/:key` (D-15) and the shell tab from the rest of the path.
  // The URL wins over whatever store.tsx restored from localStorage on mount; an unknown/invalid
  // project key (or a localStorage id for a project that no longer exists) clears the active
  // project instead of leaving a dead reference. Runs once the project list settles and again on
  // every browser back/forward (agent-setup Layout.tsx:190-241 did the equivalent resolution
  // against Supabase; this does it against the already-loaded local project list instead).
  useEffect(() => {
    const applyFromLocation = () => {
      const { projectKey, restPath } = parseProjectFromPath(window.location.pathname);
      if (!isLoading) {
        const state = useStore.getState();
        if (projectKey) {
          const match = projects.find((p) => p.key === projectKey);
          if (match) {
            if (state.activeProjectId !== match.id || state.activeProjectKey !== match.key) {
              setActiveProject({ id: match.id, key: match.key });
            }
          } else {
            if (state.activeProjectId) state.clearActiveProject();
            const dest = restPath === '/' || restPath === '' ? '/events' : restPath;
            pushPath(dest, null);
          }
        } else if (state.activeProjectId && !projects.some((p) => p.id === state.activeProjectId)) {
          state.clearActiveProject();
        }
      }
      const route = mainRouteStateFromRestPath(restPath);
      setActiveTab(route.tab);
      setSelectedJourneyId(route.journeyId);
    };
    applyFromLocation();
    window.addEventListener('popstate', applyFromLocation);
    return () => window.removeEventListener('popstate', applyFromLocation);
  }, [isLoading, projects, setActiveProject]);

  // Keep project prefix in URL in sync (always use short project key in URL).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { projectKey: keyInUrl, restPath } = parseProjectFromPath(window.location.pathname);
    const desiredKey = activeProjectKey;
    if (!desiredKey) return;
    if (keyInUrl === desiredKey) return;
    pushPath(restPath, desiredKey);
  }, [activeProjectKey]);

  // Keep URL in sync when navigating inside the app.
  useEffect(() => {
    if (!activeProjectKey) return;

    if (activeTab === 'journeysList') {
      pushPath('/journeys', activeProjectKey);
      return;
    }
    if (activeTab === 'journeys' && selectedJourneyId) {
      pushPath(`/journeys/${selectedJourneyId}`, activeProjectKey);
    }
    if (activeTab === 'events') pushPath('/events', activeProjectKey);
    if (activeTab === 'properties') pushPath('/properties', activeProjectKey);
    if (activeTab === 'catalogs') pushPath('/catalogs', activeProjectKey);
    if (activeTab === 'sources') pushPath('/sources', activeProjectKey);
    if (activeTab === 'clients') pushPath('/clients', activeProjectKey);
    if (activeTab === 'settings') pushPath('/settings', activeProjectKey);
    if (activeTab === 'documentation') pushPath('/documentation', activeProjectKey);
    if (activeTab === 'auditConfig') pushPath('/audit-config', activeProjectKey);
  }, [activeTab, selectedJourneyId, activeProjectKey]);

  const showFullPageProjectGate = !isLoading && !hasValidProjectContext;

  // Clients (and, further down, the header's "Create New Project" modal) are reachable with zero
  // projects (fix round finding #1): a fresh install has no client and no project, and the only
  // way to create the first project is to create a client first, so Clients cannot sit behind the
  // project gate. Settings/Catalogs/etc. stay gated — they operate on the active project.
  const mainContent =
    activeTab === 'clients' ? (
      <Clients />
    ) : isLoading ? (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500" role="status">
        Loading projects…
      </div>
    ) : !hasValidProjectContext ? (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto" role="alert">
        <p className="text-base font-semibold text-gray-900 mb-3">Project required</p>
        <p className="text-sm text-gray-600 leading-relaxed">{gateMessage}</p>
      </div>
    ) : (
      <>
        {activeTab === 'events' && <Events />}
        {activeTab === 'properties' && <Properties />}
        {activeTab === 'catalogs' && <Catalogs />}
        {activeTab === 'sources' && <Sources />}
        {activeTab === 'journeysList' && (
          <JourneysList
            onSelectJourney={(id) => {
              setSelectedJourneyId(id);
              setActiveTab('journeys');
              pushPath(`/journeys/${id}`, activeProjectKey);
            }}
          />
        )}
        {activeTab === 'journeys' && (
          <Journeys
            selectedJourneyId={selectedJourneyId}
            onBack={() => {
              setActiveTab('journeysList');
              pushPath('/journeys', activeProjectKey);
            }}
          />
        )}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'documentation' && <Documentation />}
        {activeTab === 'auditConfig' && <TrackingPlanAuditConfig />}
      </>
    );

  return (
    <div className="flex h-screen font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => setActiveTab(tab)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((v) => !v)}
      />
      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface-default)] text-gray-900">
        <Header />
        <ProjectGateBanner suppress={showFullPageProjectGate} />
        <main className="flex-1 overflow-hidden flex flex-col">{mainContent}</main>
      </div>
    </div>
  );
}
