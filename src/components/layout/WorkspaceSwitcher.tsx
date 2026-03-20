import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useStore } from '@/src/store';
import { useWorkspaces } from '@/src/features/workspaces/hooks/useWorkspaces';
import type { WorkspaceItem } from '@/src/features/workspaces/hooks/useWorkspaces';
import { NewWorkspaceModal } from '@/src/features/workspaces/components/NewWorkspaceModal';

const SPACE_BLUE = 'var(--e3-space-blue)';
const E3_WHITE = 'var(--e3-white)';

const FALLBACK_GROUP = 'Internal Projects';

function groupWorkspacesByClient(workspaces: WorkspaceItem[]): { groupLabel: string; workspaces: WorkspaceItem[] }[] {
  const byClient = new Map<string, WorkspaceItem[]>();
  for (const w of workspaces) {
    const label = (w.client_name?.trim() || FALLBACK_GROUP).trim() || FALLBACK_GROUP;
    if (!byClient.has(label)) byClient.set(label, []);
    byClient.get(label)!.push(w);
  }
  const sorted = Array.from(byClient.entries()).sort(([a], [b]) => {
    if (a === FALLBACK_GROUP) return 1;
    if (b === FALLBACK_GROUP) return -1;
    return a.localeCompare(b);
  });
  return sorted.map(([groupLabel, list]) => ({ groupLabel, workspaces: list }));
}

export function WorkspaceSwitcher() {
  const { activeWorkspaceId, setActiveWorkspace } = useStore();
  const { workspaces, fetchWorkspaces } = useWorkspaces();
  const [isOpen, setIsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupWorkspacesByClient(workspaces), [workspaces]);

  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const currentDisplayName = currentWorkspace
    ? (currentWorkspace.client_name?.trim()
        ? `${currentWorkspace.client_name.trim()} › ${currentWorkspace.name}`
        : currentWorkspace.name)
    : 'Workspace';

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateSuccess = (newId: string, _newName: string, workspaceKey: string) => {
    setActiveWorkspace({ id: newId, key: workspaceKey });
    fetchWorkspaces();
    setModalOpen(false);
  };

  return (
    <div className="relative font-sans" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors min-w-[140px] justify-between"
        style={{ color: E3_WHITE }}
      >
        <span className="truncate">{currentDisplayName}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 py-1 rounded-lg border border-gray-200 shadow-lg z-50 min-w-[220px] max-h-[70vh] overflow-y-auto"
          style={{ backgroundColor: E3_WHITE }}
        >
          {grouped.map(({ groupLabel, workspaces: groupList }) => (
            <div key={groupLabel}>
              <div
                className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider"
                style={{ color: SPACE_BLUE, opacity: 0.75 }}
              >
                {groupLabel}
              </div>
              {groupList.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace({ id: w.id, key: w.workspace_key ?? null });
                    setIsOpen(false);
                  }}
                  className={`w-full text-left pl-5 pr-4 py-2 text-sm transition-colors ${
                    w.id === activeWorkspaceId
                      ? 'bg-[var(--brand-primary)]/15 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-gray-200 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Workspace
            </button>
          </div>
        </div>
      )}

      <NewWorkspaceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={(id, name, workspaceKey) => handleCreateSuccess(id, name, workspaceKey)}
      />
    </div>
  );
}
