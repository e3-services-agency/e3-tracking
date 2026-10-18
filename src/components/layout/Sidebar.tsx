import React from 'react';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { NAV_ICONS } from './navIcons';
import { useAuth } from '@/src/contexts/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const { signOut } = useAuth();

  const navItems = [
    { id: 'events', label: 'Events', icon: NAV_ICONS.events },
    { id: 'properties', label: 'Properties', icon: NAV_ICONS.properties },
    { id: 'catalogs', label: 'Catalogs', icon: NAV_ICONS.catalogs },
    { id: 'identityRules', label: 'Identity rules', icon: NAV_ICONS.identityRules },
    { id: 'consentCategories', label: 'Consent categories', icon: NAV_ICONS.consentCategories },
    { id: 'standardEvents', label: 'Standard events', icon: NAV_ICONS.standardEvents },
    { id: 'useCases', label: 'Use cases', icon: NAV_ICONS.useCases },
    { id: 'decisions', label: 'Decision inbox', icon: NAV_ICONS.decisions },
    { id: 'useCaseTemplates', label: 'Use case templates', icon: NAV_ICONS.useCaseTemplates },
    { id: 'requirementsMatrix', label: 'Requirements matrix', icon: NAV_ICONS.requirementsMatrix },
    { id: 'sources', label: 'Sources', icon: NAV_ICONS.sources },
    { id: 'import', label: 'Import', icon: NAV_ICONS.import },
    { id: 'qaRuns', label: 'QA runs', icon: NAV_ICONS.qaRuns },
    { id: 'findings', label: 'Findings', icon: NAV_ICONS.findings },
    { id: 'history', label: 'History', icon: NAV_ICONS.history },
    { id: 'comments', label: 'Comments', icon: NAV_ICONS.comments },
  ];

  const bottomNavItems = [
    { id: 'gettingStarted', label: 'Getting started', icon: NAV_ICONS.gettingStarted },
    { id: 'clients', label: 'Clients', icon: NAV_ICONS.clients },
    { id: 'settings', label: 'Settings', icon: NAV_ICONS.settings },
    { id: 'help', label: 'Help', icon: NAV_ICONS.help },
  ];
  const BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ? String((import.meta as { env: { BASE_URL: string } }).env.BASE_URL).replace(/\/$/, '') : '';

  return (
    <div
      className={`bg-white border-r h-screen flex-shrink-0 overflow-hidden flex flex-col transition-[width] duration-200 ${
        isCollapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      <div className={`flex-shrink-0 flex items-center justify-between ${isCollapsed ? 'p-4' : 'p-6'}`}>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <div className="w-6 h-6 bg-[var(--color-info)] rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          {!isCollapsed && 'Tracking Plan'}
        </h1>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="text-gray-400 hover:text-gray-900 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className={`${isCollapsed ? 'flex-1 px-2 space-y-1' : 'flex-1 px-4 space-y-1'} min-h-0 overflow-y-auto`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              type="button"
            >
              <Icon className="w-4 h-4" />
              {!isCollapsed && item.label}
            </button>
          );
        })}
      </nav>

      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t space-y-1 flex-shrink-0`}>
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              type="button"
            >
              <Icon className="w-4 h-4" />
              {!isCollapsed && item.label}
            </button>
          );
        })}
      </div>

      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t mt-auto flex-shrink-0`}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => signOut().then(() => { window.location.href = `${BASE}/login`; })}
            className="w-full flex items-center justify-center rounded-md py-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => signOut().then(() => { window.location.href = `${BASE}/login`; })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        )}
      </div>
    </div>
  );
}
