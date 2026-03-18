import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useActiveData } from '@/src/store';
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

function syncJourneysRouteFromLocation(): { tab: string; journeyId: string | null } | null {
  if (typeof window === 'undefined') return null;
  const path = getPathWithoutBase(window.location.pathname);
  const match = path.match(/^\/journeys(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return { tab: match[1] ? 'journeys' : 'journeysList', journeyId: match[1] ?? null };
}

function pushPath(nextPath: string): void {
  try {
    const full = `${BASE}${nextPath.startsWith('/') ? nextPath : `/${nextPath}`}`;
    if (typeof window !== 'undefined' && window.location.pathname !== full) {
      window.history.pushState({}, '', full);
    }
  } catch {
    // ignore
  }
}

export function Layout() {
  const [activeTab, setActiveTab] = useState('events');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { settings } = useActiveData();

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

  // Deep-link support: /journeys and /journeys/:id.
  useEffect(() => {
    const applyFromLocation = () => {
      const parsed = syncJourneysRouteFromLocation();
      if (!parsed) return;
      setActiveTab(parsed.tab);
      setSelectedJourneyId(parsed.journeyId);
    };
    applyFromLocation();
    window.addEventListener('popstate', applyFromLocation);
    return () => window.removeEventListener('popstate', applyFromLocation);
  }, []);

  // Keep URL in sync when navigating inside the app.
  useEffect(() => {
    if (activeTab === 'journeysList') {
      pushPath('/journeys');
      return;
    }
    if (activeTab === 'journeys' && selectedJourneyId) {
      pushPath(`/journeys/${selectedJourneyId}`);
    }
  }, [activeTab, selectedJourneyId]);

  return (
    <div className="flex h-screen font-sans">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((v) => !v)}
      />
      <div className="flex-1 overflow-hidden flex flex-col bg-[var(--surface-default)] text-gray-900">
        <Header />
        <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'events' && <Events />}
        {activeTab === 'properties' && <Properties />}
        {activeTab === 'catalogs' && <Catalogs />}
        {activeTab === 'sources' && <Sources />}
        {activeTab === 'journeysList' && (
          <JourneysList
            onSelectJourney={(id) => {
              setSelectedJourneyId(id);
              setActiveTab('journeys');
              pushPath(`/journeys/${id}`);
            }}
          />
        )}
        {activeTab === 'journeys' && (
          <Journeys
            selectedJourneyId={selectedJourneyId}
            onBack={() => {
              setActiveTab('journeysList');
              pushPath('/journeys');
            }}
          />
        )}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'documentation' && <Documentation />}
        {activeTab === 'auditConfig' && <TrackingPlanAuditConfig />}
        </main>
      </div>
    </div>
  );
}
