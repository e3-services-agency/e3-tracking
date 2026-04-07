import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { PropertyBundle } from '@/src/types';

export type AddBundleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  availableBundles: PropertyBundle[];
  attachedBundleIds: ReadonlyArray<string>;
  onAddSelected: (ids: string[]) => Promise<void> | void;
  adding?: boolean;
};

export function AddBundleModal({
  isOpen,
  onClose,
  availableBundles,
  attachedBundleIds,
  onAddSelected,
  adding = false,
}: AddBundleModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const attached = useMemo(
    () => new Set(attachedBundleIds),
    [attachedBundleIds],
  );

  const pickable = useMemo(
    () => availableBundles.filter((b) => !attached.has(b.id)),
    [availableBundles, attached],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)),
    );
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
          <h2 className="text-xl font-bold text-gray-900">Add to Bundles</h2>
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
            placeholder="Search bundles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-4 shrink-0"
            autoComplete="off"
          />
          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                {pickable.length === 0
                  ? 'This property is already in all available bundles, or there are no bundles yet.'
                  : 'No bundles match your search.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 bg-white">
                {filtered.map((b) => {
                  const checked = selected.has(b.id);
                  return (
                    <li key={b.id}>
                      <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 text-left">
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-gray-300 text-[var(--color-info)] focus:ring-[var(--color-info)] shrink-0"
                          checked={checked}
                          onChange={() => toggle(b.id)}
                        />
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700">
                          <Package className="w-4 h-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-gray-900">
                            {b.name}
                          </span>
                          {b.description?.trim() ? (
                            <span className="mt-0.5 block text-xs text-gray-500 line-clamp-2">
                              {b.description}
                            </span>
                          ) : null}
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
              {adding ? 'Adding…' : 'Add to Selected Bundles'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
