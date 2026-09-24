import React from 'react';
import {
  Activity,
  Database,
  LayoutDashboard,
  LayoutList,
  Settings,
  BookOpen,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  ShieldCheck,
  GitBranch,
  ListChecks,
  Grid3x3,
} from 'lucide-react';
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
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'properties', label: 'Properties', icon: Database },
    { id: 'catalogs', label: 'Catalogs', icon: LayoutList },
    { id: 'identityRules', label: 'Identity rules', icon: Fingerprint },
    { id: 'consentCategories', label: 'Consent categories', icon: ShieldCheck },
    { id: 'standardEvents', label: 'Standard events', icon: GitBranch },
    { id: 'useCases', label: 'Use cases', icon: ListChecks },
    { id: 'requirementsMatrix', label: 'Requirements matrix', icon: Grid3x3 },
    { id: 'sources', label: 'Sources', icon: LayoutDashboard },
  ];

  const bottomNavItems = [
    { id: 'clients', label: 'Clients', icon: Database },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'documentation', label: 'Documentation', icon: BookOpen },
  ];
  const BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ? String((import.meta as { env: { BASE_URL: string } }).env.BASE_URL).replace(/\/$/, '') : '';

  return (
    <div
      className={`bg-white border-r h-screen flex flex-col transition-[width] duration-200 ${
        isCollapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      <div className={`flex items-center justify-between ${isCollapsed ? 'p-4' : 'p-6'}`}>
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

      <nav className={`${isCollapsed ? 'flex-1 px-2 space-y-1' : 'flex-1 px-4 space-y-1'}`}>
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

      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t space-y-1`}>
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

      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t mt-auto`}>
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
