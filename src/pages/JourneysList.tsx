import React, { useState } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Search, Plus, GitMerge, Trash2 } from 'lucide-react';

interface JourneysListProps {
  onSelectJourney: (id: string) => void;
}

export function JourneysList({ onSelectJourney }: JourneysListProps) {
  const data = useActiveData();
  const { addJourney, deleteJourney } = useStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredJourneys = data.journeys.filter(j => 
    j.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNew = () => {
    const newId = `j-${Date.now()}`;
    addJourney({
      id: newId,
      name: 'New Journey',
      nodes: [],
      edges: [],
      qaRuns: []
    });
    onSelectJourney(newId);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journeys</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and audit your tracking plan journeys.</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2 bg-[#3E52FF] hover:bg-blue-600 text-white">
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
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">Nodes</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">QA Runs</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJourneys.map(journey => (
                <tr key={journey.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <GitMerge className="w-4 h-4 text-[#3E52FF]" />
                      <span 
                        className="font-medium text-blue-600 cursor-pointer hover:underline"
                        onClick={() => onSelectJourney(journey.id)}
                      >
                        {journey.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {journey.nodes?.length || 0} nodes
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {journey.qaRuns?.length || 0} runs
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteJourney(journey.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredJourneys.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
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
