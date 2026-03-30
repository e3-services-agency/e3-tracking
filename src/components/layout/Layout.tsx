import React, { useRef, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { WorkspaceGateBanner } from './WorkspaceGateBanner';
import { WorkspaceShellProvider, useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { useActiveData, useStore } from '@/src/store';
import { getSupabaseClient } from '@/src/lib/supabase';
import { Events } from '@/src/pages/Events';
import { Properties } from '@/src/pages/Properties';
import { Sources } from '@/src/pages/Sources';
import { Journeys } from '@/src/pages/Journeys';
import { Settings } from '@/src/pages/Settings';
import { Documentation } from '@/src/pages/Documentation';

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

function parseWorkspaceFromPath(pathname: string): { workspaceKey: string | null; restPath: string } {
  const path = getPathWithoutBase(pathname);
  const m = path.match(/^\/w\/([^/]+)(\/.*)?$/);
  if (!m) return { workspaceKey: null, restPath: path };
  return { workspaceKey: m[1] ?? null, restPath: m[2] ?? '/' };
}

function syncJourneysRouteFromLocation(): { tab: string; journeyId: string | null } | null {
  if (typeof window === 'undefined') return null;
  const { restPath: path } = parseWorkspaceFromPath(window.location.pathname);
  const match = path.match(/^\/journeys(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return { tab: match[1] ? 'journeys' : 'journeysList', journeyId: match[1] ?? null };
}

/** `workspaceKeyForUrl` is the short workspace_key segment (not UUID). Pass null to drop /w/... from the path. */
function pushPath(nextPath: string, workspaceKeyForUrl?: string | null): void {
  try {
    const wsPrefix = workspaceKeyForUrl ? `/w/${workspaceKeyForUrl}` : '';
    const full = `${BASE}${wsPrefix}${nextPath.startsWith('/') ? nextPath : `/${nextPath}`}`;
    if (typeof window !== 'undefined' && window.location.pathname !== full) {
      window.history.pushState({}, '', full);
    }
  } catch {
    // ignore
  }
}

export function Layout() {
  return (
    <WorkspaceShellProvider>
      <LayoutInner />
    </WorkspaceShellProvider>
  );
}

function LayoutInner() {
  const { isLoading, hasValidWorkspaceContext, gateMessage } = useWorkspaceShell();
  const clearActiveWorkspace = useStore((s) => s.clearActiveWorkspace);

  const [activeTab, setActiveTab] = useState('events');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { settings } = useActiveData();
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeWorkspaceKey = useStore((s) => s.activeWorkspaceKey);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const journeyCanvasHasUnsavedChanges = useStore(
    (s) => s.journeyCanvasHasUnsavedChanges,
  );
  const resolveSeq = useRef(0);
  const activeTabRef = useRef(activeTab);
  const dirtyRef = useRef(journeyCanvasHasUnsavedChanges);
  const selectedJourneyIdRef = useRef(selectedJourneyId);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    dirtyRef.current = journeyCanvasHasUnsavedChanges;
  }, [journeyCanvasHasUnsavedChanges]);
  useEffect(() => {
    selectedJourneyIdRef.current = selectedJourneyId;
  }, [selectedJourneyId]);

  const confirmUnsavedAndNavigate = (nextTab: string) => {
    if (
      activeTabRef.current === 'journeys' &&
      dirtyRef.current &&
      nextTab !== activeTabRef.current
    ) {
      const ok = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?',
      );
      if (!ok) return false;
    }
    setActiveTab(nextTab);
    return true;
  };

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
    const primary =
      settings?.client_primary_color?.trim() || DEFAULT_BRAND_PRIMARY;
    root.style.setProperty('--brand-primary', primary);
    return () => {
      root.style.removeProperty('--brand-primary');
    };
  }, [settings?.client_primary_color]);

  // After workspace list settles: drop invalid / unknown active ids and strip bogus /w/:key from the URL.
  useEffect(() => {
    if (isLoading) return;
    if (hasValidWorkspaceContext) return;
    if (!activeWorkspaceId) return;

    clearActiveWorkspace();
    const { workspaceKey, restPath } = parseWorkspaceFromPath(window.location.pathname);
    if (workspaceKey) {
      const dest = restPath === '/' || restPath === '' ? '/events' : restPath;
      pushPath(dest, null);
    }
  }, [isLoading, hasValidWorkspaceContext, activeWorkspaceId, clearActiveWorkspace]);

  // Deep-link support: /journeys and /journeys/:id; resolve /w/:workspaceKey via Supabase.
  useEffect(() => {
    const applyFromLocation = () => {
      const parsedWs = parseWorkspaceFromPath(window.location.pathname);
      if (parsedWs.workspaceKey) {
        const current = useStore.getState();
        if (current.activeWorkspaceKey !== parsedWs.workspaceKey) {
          const key = parsedWs.workspaceKey;
          const seq = ++resolveSeq.current;
          const supabase = getSupabaseClient();
          void supabase
            .from('workspaces')
            .select('id, workspace_key')
            .eq('workspace_key', key)
            .is('deleted_at', null)
            .maybeSingle()
            .then(({ data }) => {
              if (seq !== resolveSeq.current) return;
              const id = (data as { id?: string } | null)?.id;
              const wk = (data as { workspace_key?: string } | null)?.workspace_key;
              if (!id) {
                useStore.getState().clearActiveWorkspace();
                const rest = parsedWs.restPath === '/' || parsedWs.restPath === '' ? '/events' : parsedWs.restPath;
                pushPath(rest, null);
                return;
              }
              const latest = useStore.getState();
              if (id !== latest.activeWorkspaceId || (wk ?? key) !== latest.activeWorkspaceKey) {
                setActiveWorkspace({ id, key: wk ?? key });
              }
            })
            .catch(() => {});
        }
      }
      const parsed = syncJourneysRouteFromLocation();
      if (!parsed) return;
      if (
        activeTabRef.current === 'journeys' &&
        dirtyRef.current &&
        (parsed.tab !== 'journeys' || parsed.journeyId !== selectedJourneyIdRef.current)
      ) {
        const ok = window.confirm(
          'You have unsaved changes. Are you sure you want to leave?',
        );
        if (!ok) return;
      }
      setActiveTab(parsed.tab);
      setSelectedJourneyId(parsed.journeyId);
    };
    applyFromLocation();
    window.addEventListener('popstate', applyFromLocation);
    return () => window.removeEventListener('popstate', applyFromLocation);
  }, [setActiveWorkspace]);

  // Keep workspace prefix in URL in sync (always use short workspace key in URL).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { workspaceKey: keyInUrl, restPath } = parseWorkspaceFromPath(window.location.pathname);
    const desiredKey = activeWorkspaceKey;
    if (!desiredKey) return;
    if (keyInUrl === desiredKey) return;
    pushPath(restPath, desiredKey);
  }, [activeWorkspaceKey]);

  // Keep URL in sync when navigating inside the app.
  useEffect(() => {
    if (activeTab === 'journeysList') {
      pushPath('/journeys', activeWorkspaceKey);
      return;
    }
    if (activeTab === 'journeys' && selectedJourneyId) {
      pushPath(`/journeys/${selectedJourneyId}`, activeWorkspaceKey);
    }
    if (activeTab === 'events') pushPath('/events', activeWorkspaceKey);
    if (activeTab === 'properties') pushPath('/properties', activeWorkspaceKey);
    if (activeTab === 'catalogs') pushPath('/catalogs', activeWorkspaceKey);
    if (activeTab === 'sources') pushPath('/sources', activeWorkspaceKey);
    if (activeTab === 'settings') pushPath('/settings', activeWorkspaceKey);
    if (activeTab === 'documentation') pushPath('/documentation', activeWorkspaceKey);
    if (activeTab === 'auditConfig') pushPath('/audit-config', activeWorkspaceKey);
  }, [activeTab, selectedJourneyId, activeWorkspaceKey]);

  const showFullPageWorkspaceGate = !isLoading && !hasValidWorkspaceContext;

  const mainContent =
    isLoading ? (
      <div
        className="flex-1 flex items-center justify-center text-sm text-gray-500"
        role="status"
      >
        Loading workspaces…
      </div>
    ) : !hasValidWorkspaceContext ? (
      <div
        className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto"
        role="alert"
      >
        <p className="text-base font-semibold text-gray-900 mb-3">Workspace required</p>
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
              pushPath(`/journeys/${id}`, activeWorkspaceKey);
            }}
          />
        )}
        {activeTab === 'journeys' && (
          <Journeys
            selectedJourneyId={selectedJourneyId}
            onBack={() => {
              if (activeTabRef.current === 'journeys' && dirtyRef.current) {
                const ok = window.confirm(
                  'You have unsaved changes. Are you sure you want to leave?',
                );
                if (!ok) return;
              }
              setActiveTab('journeysList');
              pushPath('/journeys', activeWorkspaceKey);
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
        setActiveTab={confirmUnsavedAndNavigate}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((v) => !v)}
      />
      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface-default)] text-gray-900">
        <Header />
        <WorkspaceGateBanner suppress={showFullPageWorkspaceGate} />
        <main className="flex-1 overflow-hidden flex flex-col">{mainContent}</main>
      </div>
    </div>
  );
}
