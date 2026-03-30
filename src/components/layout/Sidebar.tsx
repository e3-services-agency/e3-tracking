import React, { useMemo, useState } from 'react';
import {
  Activity,
  Database,
  GitMerge,
  LayoutDashboard,
  LayoutList,
  Check,
  Settings,
  BookOpen,
  AlertCircle,
  Download,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useStore, useActiveData } from '@/src/store';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/src/components/ui/Button';
import { Sheet } from '@/src/components/ui/Sheet';
import { runAudit } from '@/src/lib/audit';
import { downloadHandoffFile } from '@/src/lib/handoff/downloadHandoffFile';
import { generateHandoffHtml } from '@/src/lib/handoff/generateHandoff';

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
  const {
    branches,
    activeBranchId,
    setActiveBranch,
    createBranch,
    setSelectedItemIdToEdit,
    auditConfig,
  } = useStore();
  const activeData = useActiveData();

  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  const violations = useMemo(() => runAudit(activeData, auditConfig), [activeData, auditConfig]);

  const navItems = [
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'properties', label: 'Properties', icon: Database },
    { id: 'catalogs', label: 'Catalogs', icon: LayoutList },
    { id: 'sources', label: 'Sources', icon: LayoutDashboard },
    { id: 'journeysList', label: 'Journeys', icon: GitMerge },
  ];

  const bottomNavItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'documentation', label: 'Documentation', icon: BookOpen },
  ];
  const BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ? String((import.meta as { env: { BASE_URL: string } }).env.BASE_URL).replace(/\/$/, '') : '';

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;

    createBranch(newBranchName.trim());
    setNewBranchName('');
    setIsCreatingBranch(false);
  };

  const handleDownloadHandoff = () => {
    const htmlString = generateHandoffHtml(activeData, auditConfig, violations);
    downloadHandoffFile(htmlString, 'Bloomreach_Tracking_Plan');
  };

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

        <div className="flex items-center gap-2">
          {violations.length > 0 && (
            <button
              onClick={() => setIsAuditOpen(true)}
              className="relative text-yellow-500 hover:text-yellow-600 transition-colors"
              type="button"
              title="Open audit report"
            >
              <AlertCircle className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] text-white font-bold">
                {violations.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="text-gray-400 hover:text-gray-900 transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-4 mb-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Current Branch
          </div>

          <select
            value={activeBranchId}
            onChange={(e) => {
              if (e.target.value === 'new') {
                setIsCreatingBranch(true);
                return;
              }

              setActiveBranch(e.target.value);
            }}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-md focus:ring-[var(--color-info)] focus:border-[var(--color-info)] block p-2"
          >
            <option value="main">main</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
            <option value="new">+ Create new branch...</option>
          </select>

          {isCreatingBranch && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Branch name"
                className="flex-1 border rounded px-2 py-1 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBranch();
                }}
              />
              <Button size="sm" onClick={handleCreateBranch}>
                Add
              </Button>
            </div>
          )}
        </div>
      )}

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

      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t space-y-2 mt-auto`}>
        {isCollapsed ? (
          <>
            <button
              type="button"
              onClick={handleDownloadHandoff}
              className="w-full flex items-center justify-center rounded-md py-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Download Handoff"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => signOut().then(() => { window.location.href = `${BASE}/login`; })}
              className="w-full flex items-center justify-center rounded-md py-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="w-full gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleDownloadHandoff}
            >
              <Download className="w-4 h-4" />
              Download Handoff
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              onClick={() => signOut().then(() => { window.location.href = `${BASE}/login`; })}
            >
              <LogOut className="w-4 h-4" />
              Log out
            </Button>
          </>
        )}
      </div>

      <Sheet isOpen={isAuditOpen} onClose={() => setIsAuditOpen(false)} title="Audit Report">
        <div className="p-6 flex flex-col h-full">
          <div className="flex-1 overflow-y-auto space-y-4">
            {violations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Check className="w-12 h-12 mx-auto text-green-500 mb-2" />
                <p>All checks passed! Your tracking plan looks great.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {violations.map((violation) => (
                  <div
                    key={violation.id}
                    className={`p-3 rounded-lg border ${
                      violation.severity === 'error'
                        ? 'bg-red-50 border-red-100'
                        : 'bg-yellow-50 border-yellow-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        className={`w-4 h-4 mt-0.5 ${
                          violation.severity === 'error' ? 'text-red-500' : 'text-yellow-500'
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-sm text-gray-900">
                          {violation.itemName}
                          <span className="text-xs font-normal text-gray-500 uppercase ml-1">
                            ({violation.type})
                          </span>
                        </div>

                        <div className="text-sm text-gray-700 mt-1">{violation.message}</div>

                        <button
                          className="text-xs font-medium text-[var(--color-info)] mt-2 hover:underline"
                          onClick={() => {
                            setActiveTab(violation.type === 'event' ? 'events' : 'properties');
                            // Events/Properties pages open the API editor when this id appears in the workspace list
                            // (after load). Stale ids are cleared with no silent fallback.
                            setSelectedItemIdToEdit(violation.itemId);
                            setIsAuditOpen(false);
                          }}
                          type="button"
                        >
                          Fix issue &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t mt-4 shrink-0">
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => {
                setActiveTab('auditConfig');
                setIsAuditOpen(false);
              }}
            >
              <Settings className="w-4 h-4" />
              Configure Audit Rules
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}