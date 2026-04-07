import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { Source } from '@/src/types';
import { getSourceIcon } from '@/src/features/events/lib/sourcePresentation';

export type AddSourceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Workspace catalog of sources the user can attach. */
  availableSources: Source[];
  /** Already attached source ids (excluded from pick list). */
  attachedSourceIds: ReadonlyArray<string>;
  onAddSelected: (ids: string[]) => Promise<void> | void;
  adding?: boolean;
};

export function AddSourceModal({
  isOpen,
  onClose,
  availableSources,
  attachedSourceIds,
  onAddSelected,
  adding = false,
}: AddSourceModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    if (selected.size === 0 || adding) return;
    const ids = [...selected];
    await onAddSelected(ids);
    onClose();
  }, [adding, onAddSelected, onClose, selected]);

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
            className="mb-4 shrink-0"
            autoComplete="off"
          />
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
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={selected.size === 0 || adding}
            >
              {adding ? 'Adding…' : 'Add Selected Sources'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
