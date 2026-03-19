import React, { useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Search, Plus, GitMerge, Trash2 } from 'lucide-react';
import { createJourneyApi, deleteJourneyApi, useActiveWorkspaceId } from '@/src/features/journeys/hooks/useJourneysApi';
import { useJourneys } from '@/src/features/journeys/hooks/useJourneys';
import { computeQARunStatusForRun } from '@/src/features/journeys/lib/qaRunUtils';

interface JourneysListProps {
  onSelectJourney: (id: string) => void;
}

export function JourneysList({ onSelectJourney }: JourneysListProps) {
  const data = useActiveData();
  const { addJourney, deleteJourney } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const activeWorkspaceId = useActiveWorkspaceId();
  useJourneys();

  const filteredJourneys = data.journeys.filter(j => 
    j.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNew = async () => {
    const name = 'New Journey';
    const newId = addJourney({
      name,
      nodes: [],
      edges: [],
      qaRuns: [],
    });
    await createJourneyApi(newId, name, activeWorkspaceId);
    onSelectJourney(newId);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journeys</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and audit your tracking plan journeys.</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="w-4 h-4" /> New Journey
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
        <div className="mb-4 flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search journeys..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="bg-white border rounded-lg shadow-sm flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">Journey Name</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">Scope</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">Nodes</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">QA Runs</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">QA Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJourneys.map(journey => {
                const tc = journey.type_counts ?? (() => {
                  const c = { new: 0, enrichment: 0, fix: 0 };
                  (journey.nodes ?? []).forEach((n: { type?: string; data?: { implementationType?: string } }) => {
                    if (n?.type !== 'journeyStepNode') return;
                    const t = n?.data?.implementationType;
                    if (t === 'new' || t === 'enrichment' || t === 'fix') c[t] += 1;
                  });
                  return c;
                })();
                const scopeParts = [
                  tc.new ? { n: tc.new, label: 'New', cls: 'text-emerald-600' } : null,
                  tc.enrichment ? { n: tc.enrichment, label: 'Enr', cls: 'text-blue-600' } : null,
                  tc.fix ? { n: tc.fix, label: 'Fix', cls: 'text-amber-600' } : null,
                ].filter(Boolean) as { n: number; label: string; cls: string }[];
                return (
                <tr key={journey.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <GitMerge className="w-4 h-4 text-[var(--color-info)]" />
                      <span 
                        className="font-medium text-[var(--color-info)] cursor-pointer hover:underline"
                        onClick={() => onSelectJourney(journey.id)}
                      >
                        {journey.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {scopeParts.length ? (
                      <span className="flex items-center gap-2 flex-wrap">
                        {scopeParts.map(({ n, label, cls }) => (
                          <span key={label} className={`font-medium ${cls}`} title={label === 'Enr' ? 'Enrichment' : label}>
                            {n}<span className="text-gray-400 font-normal"> {label}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {journey.nodes?.length || 0} nodes
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {journey.qaRunsCount ?? journey.qaRuns?.length ?? 0} runs
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {journey.qaRunsCount && journey.latestQARun ? (
                      (() => {
                        const status = computeQARunStatusForRun(journey.latestQARun);
                        const cls =
                          status === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : status === 'FAILED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200';
                        return (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${cls}`}>
                            {status}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const ok = window.confirm(`Delete journey "${journey.name}"?`);
                        if (!ok) return;
                        const result = await deleteJourneyApi(journey.id, activeWorkspaceId);
                        if (!result.success) {
                          alert(result.error ?? 'Delete failed');
                          return;
                        }
                        deleteJourney(journey.id);
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );})}
              {filteredJourneys.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No journeys found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
