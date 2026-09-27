import React, { useRef, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ProjectGateBanner } from './ProjectGateBanner';
import { ProjectShellProvider, useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { Events } from '@/src/pages/Events';
import { Properties } from '@/src/pages/Properties';
import { Sources } from '@/src/pages/Sources';
import { Settings } from '@/src/pages/Settings';
import { Documentation } from '@/src/pages/Documentation';
import { Clients } from '@/src/pages/Clients';
import { resolveInitialProject } from './resolveInitialProject';

import { Catalogs } from '@/src/pages/Catalogs';
import { IdentityRules } from '@/src/pages/IdentityRules';
import { ConsentCategories } from '@/src/pages/ConsentCategories';
import { StandardEvents } from '@/src/pages/StandardEvents';
import { UseCases } from '@/src/pages/UseCases';
import { RequirementsMatrix } from '@/src/pages/RequirementsMatrix';
import { Import } from '@/src/pages/Import';
import { QaRuns } from '@/src/pages/QaRuns';
import { Findings } from '@/src/pages/Findings';
import { EventCard } from '@/src/pages/EventCard';

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

/** Maps the path after optional `/p/:projectKey` to the main shell tab. `eventCardId` is set only
 * for `/events/:id/card` (T-2-09), read by `LayoutInner` to seed the store's `eventCardEventId`. */
function mainRouteStateFromRestPath(restPath: string): { tab: string; eventCardId?: string } {
  const raw = (restPath.replace(/\/$/, '') || '/').trim() || '/';
  const cardMatch = raw.match(/^\/events\/([^/]+)\/card$/);
  if (cardMatch) return { tab: 'eventCard', eventCardId: cardMatch[1] };
  switch (raw) {
    case '/':
    case '/events':
      return { tab: 'events' };
    case '/properties':
      return { tab: 'properties' };
    case '/catalogs':
      return { tab: 'catalogs' };
    case '/identity-rules':
      return { tab: 'identityRules' };
    case '/consent-categories':
      return { tab: 'consentCategories' };
    case '/standard-events':
      return { tab: 'standardEvents' };
    case '/use-cases':
      return { tab: 'useCases' };
    case '/requirements-matrix':
      return { tab: 'requirementsMatrix' };
    case '/sources':
      return { tab: 'sources' };
    case '/import':
      return { tab: 'import' };
    case '/qa-runs':
      return { tab: 'qaRuns' };
    case '/findings':
      return { tab: 'findings' };
    case '/clients':
      return { tab: 'clients' };
    case '/settings':
      return { tab: 'settings' };
    case '/documentation':
      return { tab: 'documentation' };
    default:
      return { tab: 'events' };
  }
}

function getInitialMainRouteState(): { tab: string } {
  if (typeof window === 'undefined') return { tab: 'events' };
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeProjectKey = useStore((s) => s.activeProjectKey);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const requestedTab = useStore((s) => s.requestedTab);
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const eventCardEventId = useStore((s) => s.eventCardEventId);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const activeTabRef = useRef(activeTab);

  // T-1-09: `Import.tsx`'s customer-events-export apply requests a tab switch to Findings via the
  // store instead of prop-drilling `setActiveTab` (see store.tsx's `requestedTab` comment).
  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    setRequestedTab(null);
  }, [requestedTab, setRequestedTab]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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
  // The URL wins over whatever store.tsx restored from localStorage on mount (resolveInitialProject
  // only falls back to the stored id when the URL carries no project key at all); an unknown/invalid
  // project key (or a stored id for a project that no longer exists) clears the active project
  // instead of leaving a dead reference. Runs once the project list settles and again on every
  // browser back/forward (agent-setup Layout.tsx:190-241 did the equivalent resolution against the
  // old backend; this does it against the already-loaded local project list instead).
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);

  useEffect(() => {
    const applyFromLocation = () => {
      const { projectKey, restPath } = parseProjectFromPath(window.location.pathname);
      if (!isLoading) {
        const state = useStore.getState();
        const resolution = resolveInitialProject(projectKey, state.activeProjectId || null, projects);
        if (resolution.type === 'select') {
          if (state.activeProjectId !== resolution.projectId || state.activeProjectKey !== resolution.projectKey) {
            setActiveProject({ id: resolution.projectId, key: resolution.projectKey });
          }
        } else if (resolution.type === 'clear') {
          if (state.activeProjectId) state.clearActiveProject();
          if (projectKey) {
            const dest = restPath === '/' || restPath === '' ? '/events' : restPath;
            pushPath(dest, null);
          }
        }
        setInitializedFromUrl(true);
      }
      const route = mainRouteStateFromRestPath(restPath);
      setActiveTab(route.tab);
      if (route.eventCardId) setEventCardEventId(route.eventCardId);
    };
    applyFromLocation();
    window.addEventListener('popstate', applyFromLocation);
    return () => window.removeEventListener('popstate', applyFromLocation);
  }, [isLoading, projects, setActiveProject, setEventCardEventId]);

  // Keep project prefix in URL in sync (always use short project key in URL). Gated on
  // `initializedFromUrl` (fix round 2, QA #1): `activeProjectKey` is already populated
  // synchronously from localStorage at store creation (store.tsx), so without this gate this
  // effect would run on the very first render and overwrite a freshly-navigated `/p/<key>` URL
  // with the stale localStorage key before the resolution effect above ever gets a chance to read
  // the original URL (isLoading is still true on that first pass). Once initialised, this effect
  // still only pushes when the URL and the (now correctly resolved) store disagree.
  useEffect(() => {
    if (!initializedFromUrl) return;
    if (typeof window === 'undefined') return;
    const { projectKey: keyInUrl, restPath } = parseProjectFromPath(window.location.pathname);
    const desiredKey = activeProjectKey;
    if (!desiredKey) return;
    if (keyInUrl === desiredKey) return;
    pushPath(restPath, desiredKey);
  }, [activeProjectKey, initializedFromUrl]);

  // Keep URL in sync when navigating inside the app. Gated on `initializedFromUrl` for the same
  // reason as the effect above: this also reacts to `activeProjectKey`, which already carries the
  // localStorage value on the very first render, so without the gate this effect independently
  // reproduces the same URL-vs-localStorage race on mount.
  useEffect(() => {
    if (!initializedFromUrl) return;
    if (!activeProjectKey) return;

    if (activeTab === 'events') pushPath('/events', activeProjectKey);
    if (activeTab === 'properties') pushPath('/properties', activeProjectKey);
    if (activeTab === 'catalogs') pushPath('/catalogs', activeProjectKey);
    if (activeTab === 'identityRules') pushPath('/identity-rules', activeProjectKey);
    if (activeTab === 'consentCategories') pushPath('/consent-categories', activeProjectKey);
    if (activeTab === 'standardEvents') pushPath('/standard-events', activeProjectKey);
    if (activeTab === 'useCases') pushPath('/use-cases', activeProjectKey);
    if (activeTab === 'requirementsMatrix') pushPath('/requirements-matrix', activeProjectKey);
    if (activeTab === 'sources') pushPath('/sources', activeProjectKey);
    if (activeTab === 'import') pushPath('/import', activeProjectKey);
    if (activeTab === 'qaRuns') pushPath('/qa-runs', activeProjectKey);
    if (activeTab === 'findings') pushPath('/findings', activeProjectKey);
    if (activeTab === 'clients') pushPath('/clients', activeProjectKey);
    if (activeTab === 'settings') pushPath('/settings', activeProjectKey);
    if (activeTab === 'documentation') pushPath('/documentation', activeProjectKey);
    if (activeTab === 'eventCard' && eventCardEventId) pushPath(`/events/${eventCardEventId}/card`, activeProjectKey);
  }, [activeTab, activeProjectKey, initializedFromUrl, eventCardEventId]);

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
        {activeTab === 'identityRules' && <IdentityRules />}
        {activeTab === 'consentCategories' && <ConsentCategories />}
        {activeTab === 'standardEvents' && <StandardEvents />}
        {activeTab === 'useCases' && <UseCases />}
        {activeTab === 'requirementsMatrix' && <RequirementsMatrix />}
        {activeTab === 'sources' && <Sources />}
        {activeTab === 'import' && <Import />}
        {activeTab === 'qaRuns' && <QaRuns />}
        {activeTab === 'findings' && <Findings />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'documentation' && <Documentation />}
        {activeTab === 'eventCard' && eventCardEventId && (
          <EventCard eventId={eventCardEventId} onBack={() => setActiveTab('events')} />
        )}
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
