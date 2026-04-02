import React, { useState, useEffect } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Source } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { Search, Plus, Trash2, Loader2 } from 'lucide-react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import {
  createWorkspaceSource,
  getWorkspaceSourceUsage,
  listWorkspaceSources,
  type SourceUsageSummary,
} from '@/src/features/events/lib/eventTriggerSourcesApi';

export function Sources() {
  const data = useActiveData();
  const { syncSourcesFromApi } = useStore();
  const { activeWorkspaceId, hasValidWorkspaceContext } = useWorkspaceShell();
  const [usageBySourceId, setUsageBySourceId] = useState<Record<string, SourceUsageSummary>>({});

  useEffect(() => {
    if (!hasValidWorkspaceContext || !activeWorkspaceId?.trim()) return;
    void listWorkspaceSources(activeWorkspaceId).then((r) => {
      if (r.success) syncSourcesFromApi(r.data);
    });
    void getWorkspaceSourceUsage(activeWorkspaceId).then((r) => {
      if (!r.success) return;
      const next: Record<string, SourceUsageSummary> = {};
      for (const row of r.data) {
        next[row.source_id] = row;
      }
      setUsageBySourceId(next);
    });
  }, [hasValidWorkspaceContext, activeWorkspaceId, syncSourcesFromApi]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const filteredSources = data.sources.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenSource = (id: string) => {
    setSelectedSourceId(id);
    setIsCreating(false);
    setIsSheetOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedSourceId(null);
    setIsCreating(true);
    setIsSheetOpen(true);
  };

  const selectedSource = selectedSourceId ? data.sources.find(s => s.id === selectedSourceId) : null;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
          <p className="text-sm text-gray-500 mt-1">Platforms where events are tracked.</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Source
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        <div className="mb-6 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md bg-white"
          />
        </div>

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Color Tag</th>
                <th className="px-6 py-3 font-medium text-gray-500">Used In</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSources.map(source => {
                const usage = usageBySourceId[source.id];
                const propertyCount = usage?.property_count ?? 0;
                const eventCount = usage?.event_count ?? 0;
                return (
                  <tr
                    key={source.id}
                    onClick={() => handleOpenSource(source.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">{source.name}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${source.color || 'bg-gray-100 text-gray-800'}`}>
                        {source.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      Properties: {propertyCount} · Events: {eventCount}
                    </td>
                  </tr>
                );
              })}
              {filteredSources.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                    No sources found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={isCreating ? "Create Source" : "Edit Source"}
      >
        <SourceEditor
          key={isCreating ? 'create' : selectedSourceId ?? 'none'}
          source={selectedSource}
          isCreating={isCreating}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function SourceEditor({ source, isCreating, onClose }: { source: Source | null | undefined, isCreating: boolean, onClose: () => void }) {
  const { upsertSourceFromApi, updateSource, deleteSource } = useStore();
  const { activeWorkspaceId, hasValidWorkspaceContext } = useWorkspaceShell();

  const [name, setName] = useState(source?.name || '');
  const [color, setColor] = useState(source?.color || 'bg-gray-100 text-gray-800');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(source?.name || '');
    setColor(source?.color || 'bg-gray-100 text-gray-800');
    setSaveError(null);
  }, [source?.id, isCreating]);

  const colorOptions = [
    { label: 'Gray', value: 'bg-gray-100 text-gray-800' },
    { label: 'Blue', value: 'bg-blue-100 text-blue-800' },
    { label: 'Green', value: 'bg-green-100 text-green-800' },
    { label: 'Purple', value: 'bg-purple-100 text-purple-800' },
    { label: 'Orange', value: 'bg-orange-100 text-orange-800' },
    { label: 'Pink', value: 'bg-pink-100 text-pink-800' },
  ];

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaveError(null);

    if (isCreating) {
      if (!hasValidWorkspaceContext || !activeWorkspaceId?.trim()) {
        setSaveError('Select a workspace before creating a source.');
        return;
      }
      setIsSaving(true);
      try {
        const result = await createWorkspaceSource({
          workspaceId: activeWorkspaceId,
          name: name.trim(),
          color: color || null,
        });
        if (!result.success) {
          setSaveError(result.error);
          return;
        }
        upsertSourceFromApi(result.data);
        onClose();
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // No PATCH /api/sources/:id yet — updates are local-only until backend exposes update.
    if (source) {
      updateSource(source.id, { name, color });
      onClose();
    }
  };

  const handleDelete = () => {
    // No DELETE /api/sources/:id yet — removal is local-only until backend supports it.
    if (source) {
      deleteSource(source.id);
      onClose();
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Source Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. iOS App"
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Color Tag</label>
        <div className="grid grid-cols-3 gap-2">
          {colorOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              disabled={isSaving}
              onClick={() => setColor(opt.value)}
              className={`flex items-center justify-center py-2 rounded-md border text-sm font-medium transition-all ${
                color === opt.value ? 'ring-2 ring-[var(--color-info)] ring-offset-1' : 'hover:bg-gray-50'
              } ${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {saveError}
        </div>
      )}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && source ? (
          <Button variant="destructive" onClick={handleDelete} disabled={isSaving} className="gap-2">
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Source'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
