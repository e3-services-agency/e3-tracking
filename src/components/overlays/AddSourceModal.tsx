import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { Source } from '@/src/types';
import { getSourceIcon } from '@/src/features/events/lib/sourcePresentation';

const COLOR_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Gray', value: 'bg-gray-100 text-gray-800' },
  { label: 'Blue', value: 'bg-blue-100 text-blue-800' },
  { label: 'Green', value: 'bg-green-100 text-green-800' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-800' },
  { label: 'Orange', value: 'bg-orange-100 text-orange-800' },
  { label: 'Pink', value: 'bg-pink-100 text-pink-800' },
];
const DEFAULT_COLOR = COLOR_OPTIONS[0].value;

export type AddSourceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Workspace catalog of sources the user can attach. */
  availableSources: Source[];
  /** Already attached source ids (excluded from pick list). */
  attachedSourceIds: ReadonlyArray<string>;
  onAddSelected: (ids: string[]) => Promise<void> | void;
  adding?: boolean;
  /**
   * Optional. When provided, the modal renders an inline "Create new source"
   * form. Resolve to `{ success: true, id }` to auto-select the new source,
   * or `{ success: false, error }` to display the error inline.
   */
  onCreate?: (input: { name: string; color: string | null }) =>
    Promise<{ success: true; id: string } | { success: false; error: string }>;
};

export function AddSourceModal({
  isOpen,
  onClose,
  availableSources,
  attachedSourceIds,
  onAddSelected,
  adding = false,
  onCreate,
}: AddSourceModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState<string>(DEFAULT_COLOR);
  const [creatingSource, setCreatingSource] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const attached = useMemo(
    () => new Set(attachedSourceIds),
    [attachedSourceIds],
  );

  const pickable = useMemo(
    () => availableSources.filter((s) => !attached.has(s.id)),
    [availableSources, attached],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter((s) => s.name.toLowerCase().includes(q));
  }, [pickable, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelected(new Set());
      setIsCreating(false);
      setCreateName('');
      setCreateColor(DEFAULT_COLOR);
      setCreateError(null);
      setCreatingSource(false);
    }
  }, [isOpen]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selected.size === 0 || adding || creatingSource) return;
    const ids = [...selected];
    await onAddSelected(ids);
    onClose();
  }, [adding, creatingSource, onAddSelected, onClose, selected]);

  const handleCreate = useCallback(async () => {
    if (!onCreate || creatingSource) return;
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Source name is required.');
      return;
    }
    setCreatingSource(true);
    setCreateError(null);
    try {
      const result = await onCreate({
        name: trimmed,
        color: createColor || null,
      });
      if (result.success) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(result.id);
          return next;
        });
        setCreateName('');
        setCreateColor(DEFAULT_COLOR);
        setIsCreating(false);
      } else {
        // tsconfig is non-strict; cast the failure branch explicitly so we
        // can read `error` without TS complaining about the union shape.
        const failure = result as { success: false; error: string };
        setCreateError(failure.error);
      }
    } finally {
      setCreatingSource(false);
    }
  }, [createColor, createName, creatingSource, onCreate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-xl shadow-2xl w-[1000px] max-w-[95vw] h-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Add Sources</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-6 overflow-hidden">
          <Input
            type="search"
            placeholder="Search sources…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-3 shrink-0"
            autoComplete="off"
          />

          {onCreate && (
            <div className="mb-4 shrink-0">
              {!isCreating ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setIsCreating(true);
                    setCreateError(null);
                  }}
                  disabled={adding || creatingSource}
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  Create new source
                </Button>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="add-source-modal-create-name"
                      className="text-xs font-semibold text-gray-700"
                    >
                      Source name
                    </label>
                    <Input
                      id="add-source-modal-create-name"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. iOS App"
                      disabled={creatingSource}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-gray-700">
                      Color tag
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={creatingSource}
                          onClick={() => setCreateColor(opt.value)}
                          className={`flex items-center justify-center py-1.5 rounded-md border text-xs font-medium transition-all ${
                            createColor === opt.value
                              ? 'ring-2 ring-[var(--color-info)] ring-offset-1'
                              : 'hover:bg-white'
                          } ${opt.value}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {createError && (
                    <div
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                      role="alert"
                    >
                      {createError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsCreating(false);
                        setCreateName('');
                        setCreateColor(DEFAULT_COLOR);
                        setCreateError(null);
                      }}
                      disabled={creatingSource}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleCreate()}
                      disabled={creatingSource || !createName.trim()}
                    >
                      {creatingSource ? 'Creating…' : 'Create source'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                {pickable.length === 0
                  ? 'All available sources are already attached.'
                  : 'No sources match your search.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 bg-white">
                {filtered.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 text-left">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[var(--color-info)] focus:ring-[var(--color-info)]"
                          checked={checked}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                          {getSourceIcon(s.name)}
                        </span>
                        <span className="text-[14px] font-medium text-gray-900">
                          {s.name}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={adding || creatingSource}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={selected.size === 0 || adding || creatingSource}
            >
              {adding ? 'Adding…' : 'Add Selected Sources'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
