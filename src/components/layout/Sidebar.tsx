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
  Bookmark,
  AlertCircle,
  Download,
  LogOut,
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
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
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
    { id: 'docs', label: 'Docs', icon: BookOpen },
    { id: 'documentation', label: 'Documentation', icon: Bookmark },
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
    <div className="w-64 bg-white border-r h-screen flex flex-col">
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <div className="w-6 h-6 bg-[#3E52FF] rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          Tracking Plan
        </h1>

        {violations.length > 0 && (
          <button
            onClick={() => setIsAuditOpen(true)}
            className="relative text-yellow-500 hover:text-yellow-600 transition-colors"
            type="button"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] text-white font-bold">
              {violations.length}
            </span>
          </button>
        )}
      </div>

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
          className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-md focus:ring-[#3E52FF] focus:border-[#3E52FF] block p-2"
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

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-[#3E52FF]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              type="button"
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t space-y-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-[#3E52FF]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              type="button"
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t space-y-2 mt-auto">
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
                          className="text-xs font-medium text-[#3E52FF] mt-2 hover:underline"
                          onClick={() => {
                            setActiveTab(violation.type === 'event' ? 'events' : 'properties');
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