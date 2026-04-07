/**
 * Single source of truth: searchable property list + optional bundles tab, checkboxes, preview, bulk "Add selected".
 * Does not call APIs directly; parent owns attach flow.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { PropertyRow } from '@/src/types/schema';
import type { PropertyBundle } from '@/src/types';
import { Check, Loader2, Plus } from 'lucide-react';

export interface EventAttachPropertyPickerProps {
  availableProperties: PropertyRow[];
  /** Full workspace catalog for resolving bundle member names (includes ids not in `availableProperties`). */
  allProperties: PropertyRow[];
  attachedIds: ReadonlySet<string>;
  addRequired: boolean;
  onAddRequiredChange: (required: boolean) => void;
  /** Attach each id with current Required setting; return true if all succeeded. */
  onAddSelected: (propertyIds: string[]) => Promise<boolean>;
  adding: boolean;
  workspaceActionsDisabled: boolean;
  bundles?: PropertyBundle[];
  /** When true, bundles tab is hidden (e.g. bundle editor). */
  hideBundlesTab?: boolean;
  /** When true, hides the "Required" checkbox (e.g. bundle editor, legacy event modal). */
  hideAddRequiredToggle?: boolean;
}

export function EventAttachPropertyPicker({
  availableProperties,
  allProperties,
  attachedIds,
  addRequired,
  onAddRequiredChange,
  onAddSelected,
  adding,
  workspaceActionsDisabled,
  bundles = [],
  hideBundlesTab = false,
  hideAddRequiredToggle = false,
}: EventAttachPropertyPickerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'properties' | 'bundles'>('properties');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [checkedBundleIds, setCheckedBundleIds] = useState<Set<string>>(() => new Set());
  const [focusedBundleId, setFocusedBundleId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addingBatchSize, setAddingBatchSize] = useState(0);

  const busyAdding = isAdding || adding;

  const showBundlesTab = !hideBundlesTab && bundles.length > 0;

  const q = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q
        ? availableProperties.filter((p) => p.name.toLowerCase().includes(q))
        : availableProperties,
    [availableProperties, q],
  );

  const filteredBundles = useMemo(() => {
    if (!bundles.length) return [];
    if (!q) return bundles;
    return bundles.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q),
    );
  }, [bundles, q]);

  useEffect(() => {
    if (activeTab !== 'properties') return;
    if (filtered.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !filtered.some((p) => p.id === focusedId)) {
      setFocusedId(filtered[0].id);
    }
  }, [activeTab, filtered, focusedId]);

  useEffect(() => {
    if (activeTab !== 'bundles') return;
    if (filteredBundles.length === 0) {
      setFocusedBundleId(null);
      return;
    }
    if (!focusedBundleId || !filteredBundles.some((b) => b.id === focusedBundleId)) {
      setFocusedBundleId(filteredBundles[0].id);
    }
  }, [activeTab, filteredBundles, focusedBundleId]);

  useEffect(() => {
    if (hideBundlesTab && activeTab === 'bundles') {
      setActiveTab('properties');
    }
  }, [hideBundlesTab, activeTab]);

  const focusedProperty = useMemo(
    () => filtered.find((p) => p.id === focusedId) ?? null,
    [filtered, focusedId],
  );

  const focusedBundle = useMemo(
    () =>
      activeTab === 'bundles' && focusedBundleId
        ? bundles.find((b) => b.id === focusedBundleId) ?? null
        : null,
    [activeTab, focusedBundleId, bundles],
  );

  /** Unique property ids that would be added (not already attached), from direct checks + selected bundles. */
  const mergedIdsToAdd = useMemo(() => {
    const out = new Set<string>();
    for (const id of checkedIds) {
      if (!attachedIds.has(id)) out.add(id);
    }
    for (const bid of checkedBundleIds) {
      const b = bundles.find((x) => x.id === bid);
      if (!b) continue;
      for (const pid of b.propertyIds) {
        if (!attachedIds.has(pid)) out.add(pid);
      }
    }
    return out;
  }, [checkedIds, checkedBundleIds, bundles, attachedIds]);

  const selectableCheckedCount = mergedIdsToAdd.size;

  const toggleChecked = (id: string) => {
    if (attachedIds.has(id)) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBundleChecked = (bundleId: string) => {
    setCheckedBundleIds((prev) => {
      const next = new Set(prev);
      if (next.has(bundleId)) next.delete(bundleId);
      else next.add(bundleId);
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

  const handleBundleRowClick = (e: React.MouseEvent, bundle: PropertyBundle) => {
    const target = e.target as HTMLElement;
    if (target.closest('input[type="checkbox"]')) {
      setFocusedBundleId(bundle.id);
      return;
    }
    setFocusedBundleId(bundle.id);
    if (!workspaceActionsDisabled && !busyAdding) {
      toggleBundleChecked(bundle.id);
    }
  };

  const handleAddSelected = async () => {
    if (isAdding) return;
    const ids = [...mergedIdsToAdd];
    if (ids.length === 0) return;
    setAddingBatchSize(ids.length);
    setIsAdding(true);
    try {
      const ok = await onAddSelected(ids);
      if (ok) {
        setCheckedIds(new Set());
        setCheckedBundleIds(new Set());
      }
    } finally {
      setIsAdding(false);
      setAddingBatchSize(0);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-3">
      <div className="flex flex-wrap items-end gap-2 shrink-0">
        <div className="flex-1 min-w-[160px] space-y-1">
          <label className="text-xs font-medium text-gray-600" htmlFor="event-property-picker-search">
            {activeTab === 'properties' ? 'Search properties' : 'Search bundles'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {showBundlesTab && (
              <div
                className="flex rounded-md border border-gray-200 p-0.5 bg-gray-50/80 shrink-0"
                role="tablist"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'properties'}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'properties'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('properties')}
                >
                  Properties
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'bundles'}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'bundles'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('bundles')}
                >
                  Bundles
                </button>
              </div>
            )}
            <Input
              id="event-property-picker-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'properties' ? 'Filter by name…' : 'Filter bundles…'}
              disabled={workspaceActionsDisabled}
              className="h-9 text-sm flex-1 min-w-0"
            />
          </div>
        </div>
        {!hideAddRequiredToggle && (
          <div className="space-y-1">
            <label className="flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background text-sm">
              <input
                type="checkbox"
                checked={addRequired}
                onChange={(e) => onAddRequiredChange(e.target.checked)}
                disabled={workspaceActionsDisabled}
                className="rounded border-gray-300"
              />
              <span className="text-xs font-medium text-gray-700">Required</span>
            </label>
          </div>
        )}
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

      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden flex">
        <div className="w-[350px] shrink-0 border-r border-gray-200 overflow-y-auto bg-white flex flex-col divide-y divide-gray-100">
          {activeTab === 'properties' && (
            <>
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
            </>
          )}
          {activeTab === 'bundles' && showBundlesTab && (
            <>
              {filteredBundles.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500 text-center">
                  {bundles.length === 0
                    ? 'No bundles in this workspace.'
                    : 'No bundles match your search.'}
                </div>
              ) : (
                filteredBundles.map((b) => {
                  const isChecked = checkedBundleIds.has(b.id);
                  const isFocused = focusedBundleId === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`flex items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                        workspaceActionsDisabled || busyAdding ? 'cursor-default' : 'cursor-pointer'
                      } ${isFocused ? 'bg-gray-50' : 'hover:bg-gray-50/80'}`}
                      onClick={(e) => handleBundleRowClick(e, b)}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300 shrink-0"
                        checked={isChecked}
                        disabled={workspaceActionsDisabled || busyAdding}
                        onChange={() => toggleBundleChecked(b.id)}
                        aria-label={`Select bundle ${b.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs text-gray-900 truncate">{b.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {b.propertyIds.length} propert{b.propertyIds.length === 1 ? 'y' : 'ies'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto p-8 bg-gray-50/60 text-sm">
          {activeTab === 'properties' && focusedProperty && (
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
          )}
          {activeTab === 'properties' && !focusedProperty && (
            <p className="text-sm text-gray-500 py-4">Select a property to see details.</p>
          )}
          {activeTab === 'bundles' && focusedBundle && (
            <div className="space-y-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</h4>
                <p className="font-mono text-sm font-medium text-gray-900 break-all mt-1">
                  {focusedBundle.name}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Description</span>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-0.5">
                  {focusedBundle.description?.trim()
                    ? focusedBundle.description
                    : 'No description.'}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Properties in bundle</span>
                <ul className="mt-1 flex flex-col gap-1 list-none text-sm">
                  {focusedBundle.propertyIds.map((pid) => {
                    const resolved = allProperties.find((p) => p.id === pid);
                    const isAttached = attachedIds.has(pid);
                    if (resolved) {
                      return (
                        <li
                          key={pid}
                          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs"
                        >
                          <span
                            className={
                              isAttached ? 'text-gray-400' : 'text-gray-600'
                            }
                          >
                            {resolved.name}
                          </span>
                          {isAttached ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                              <Check className="h-3 w-3 shrink-0" aria-hidden />
                              <span>(added)</span>
                            </span>
                          ) : null}
                        </li>
                      );
                    }
                    return (
                      <li
                        key={pid}
                        className="font-mono text-xs text-amber-600 break-all"
                        title="Property id not in workspace catalog (orphaned reference or loading race)"
                      >
                        Missing: {pid}
                      </li>
                    );
                  })}
                </ul>
                {focusedBundle.propertyIds.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No properties in this bundle.</p>
                )}
              </div>
            </div>
          )}
          {activeTab === 'bundles' && !focusedBundle && (
            <p className="text-sm text-gray-500 py-4">Select a bundle to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
}
