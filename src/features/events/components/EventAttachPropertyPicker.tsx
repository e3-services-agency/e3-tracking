/**
 * In-sheet property chooser: searchable list with checkboxes, detail preview, bulk "Add selected".
 * Does not call APIs directly; parent owns attach flow and presence.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { EventPropertyPresence, PropertyRow } from '@/src/types/schema';
import { Loader2, Plus } from 'lucide-react';

const PRESENCE_OPTIONS: { value: EventPropertyPresence; label: string }[] = [
  { value: 'always_sent', label: 'Always' },
  { value: 'sometimes_sent', label: 'Sometimes' },
  { value: 'never_sent', label: 'Never' },
];

export interface EventAttachPropertyPickerProps {
  availableProperties: PropertyRow[];
  attachedIds: ReadonlySet<string>;
  addPresence: EventPropertyPresence;
  onAddPresenceChange: (presence: EventPropertyPresence) => void;
  /** Attach each id with current `addPresence`; return true if all succeeded. */
  onAddSelected: (propertyIds: string[]) => Promise<boolean>;
  adding: boolean;
  workspaceActionsDisabled: boolean;
}

export function EventAttachPropertyPicker({
  availableProperties,
  attachedIds,
  addPresence,
  onAddPresenceChange,
  onAddSelected,
  adding,
  workspaceActionsDisabled,
}: EventAttachPropertyPickerProps) {
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  /** Local: set synchronously on click so the button disables before parent re-renders. */
  const [isAdding, setIsAdding] = useState(false);
  const [addingBatchSize, setAddingBatchSize] = useState(0);

  const busyAdding = isAdding || adding;

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? availableProperties.filter((p) => p.name.toLowerCase().includes(q))
        : availableProperties,
    [availableProperties, q],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !filtered.some((p) => p.id === focusedId)) {
      setFocusedId(filtered[0].id);
    }
  }, [filtered, focusedId]);

  const focusedProperty = useMemo(
    () => filtered.find((p) => p.id === focusedId) ?? null,
    [filtered, focusedId],
  );

  const selectableCheckedCount = useMemo(() => {
    let n = 0;
    for (const id of checkedIds) {
      if (!attachedIds.has(id)) n += 1;
    }
    return n;
  }, [checkedIds, attachedIds]);

  const toggleChecked = (id: string) => {
    if (attachedIds.has(id)) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowClick = (e: React.MouseEvent, p: PropertyRow) => {
    const target = e.target as HTMLElement;
    if (target.closest('input[type="checkbox"]')) {
      setFocusedId(p.id);
      return;
    }
    setFocusedId(p.id);
    if (!attachedIds.has(p.id) && !workspaceActionsDisabled && !busyAdding) {
      toggleChecked(p.id);
    }
  };

  const handleAddSelected = async () => {
    if (isAdding) return;
    const ids = [...checkedIds].filter((id) => !attachedIds.has(id));
    if (ids.length === 0) return;
    setAddingBatchSize(ids.length);
    setIsAdding(true);
    try {
      const ok = await onAddSelected(ids);
      if (ok) setCheckedIds(new Set());
    } finally {
      setIsAdding(false);
      setAddingBatchSize(0);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px] space-y-1">
          <label className="text-xs font-medium text-gray-600" htmlFor="event-property-picker-search">
            Search properties
          </label>
          <Input
            id="event-property-picker-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name…"
            disabled={workspaceActionsDisabled}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-gray-600 block">Presence for new attachments</span>
          <select
            value={addPresence}
            onChange={(e) => onAddPresenceChange(e.target.value as EventPropertyPresence)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={workspaceActionsDisabled}
          >
            {PRESENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 shrink-0 min-w-[8.5rem]"
          onClick={() => void handleAddSelected()}
          disabled={
            selectableCheckedCount === 0 || busyAdding || workspaceActionsDisabled
          }
          aria-busy={busyAdding}
          title={
            workspaceActionsDisabled
              ? 'Select a valid workspace from the header before changing attachments.'
              : undefined
          }
        >
          {busyAdding ? (
            <>
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
              <span>
                Adding
                {addingBatchSize > 0 ? ` (${addingBatchSize})` : ''}…
              </span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 shrink-0" aria-hidden />
              <span>
                Add selected
                {selectableCheckedCount > 0 ? ` (${selectableCheckedCount})` : ''}
              </span>
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-col min-[420px]:flex-row border rounded-lg overflow-hidden min-h-[220px] max-h-[320px]">
        <div className="min-[420px]:w-[45%] min-[420px]:min-w-0 min-[420px]:border-r border-gray-200 overflow-y-auto divide-y divide-gray-100 bg-white">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500 text-center">
              {availableProperties.length === 0
                ? 'No properties left to attach.'
                : 'No matches for your search.'}
            </div>
          ) : (
            filtered.map((p) => {
              const isAttached = attachedIds.has(p.id);
              const isChecked = checkedIds.has(p.id);
              const isFocused = focusedId === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                    isAttached || workspaceActionsDisabled || busyAdding
                      ? 'cursor-default'
                      : 'cursor-pointer'
                  } ${isFocused ? 'bg-gray-50' : 'hover:bg-gray-50/80'} ${isAttached ? 'opacity-60' : ''}`}
                  onClick={(e) => handleRowClick(e, p)}
                >
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 shrink-0"
                    checked={isChecked && !isAttached}
                    disabled={isAttached || workspaceActionsDisabled || busyAdding}
                    onChange={() => toggleChecked(p.id)}
                    aria-label={isAttached ? `${p.name} (already attached)` : `Select ${p.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-gray-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-gray-500">{p.data_type}</div>
                    {isAttached && (
                      <span className="text-[10px] font-medium text-amber-700">Already attached</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto p-3 bg-gray-50/60 text-sm">
          {focusedProperty ? (
            <div className="space-y-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</h4>
                <p className="font-mono text-sm font-medium text-gray-900 break-all mt-1">
                  {focusedProperty.name}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Type</span>
                <p className="text-sm text-gray-800">{focusedProperty.data_type}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Description</span>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">
                  {focusedProperty.description?.trim()
                    ? focusedProperty.description
                    : 'No description.'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4">Select a property to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
}
