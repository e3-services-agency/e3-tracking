/**
 * Single-select property picker (search + preview) using the same interaction pattern
 * as the event attach property picker modal.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import type { PropertyRow } from '@/src/types/schema';
import { Check } from 'lucide-react';

export type PropertySingleSelectPickerProps = {
  availableProperties: PropertyRow[];
  selectedId: string | null;
  onSelect: (propertyId: string | null) => void;
  disabled?: boolean;
};

export function PropertySingleSelectPicker({
  availableProperties,
  selectedId,
  onSelect,
  disabled,
}: PropertySingleSelectPickerProps) {
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? availableProperties.filter((p) => p.name.toLowerCase().includes(q)) : availableProperties),
    [availableProperties, q]
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !filtered.some((p) => p.id === focusedId)) {
      setFocusedId(selectedId && filtered.some((p) => p.id === selectedId) ? selectedId : filtered[0].id);
    }
  }, [filtered, focusedId, selectedId]);

  const focused = useMemo(() => filtered.find((p) => p.id === focusedId) ?? null, [filtered, focusedId]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600" htmlFor="property-single-picker-search">
          Search properties
        </label>
        <Input
          id="property-single-picker-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name…"
          disabled={disabled}
          className="h-9 text-sm"
        />
      </div>

      <div className="flex flex-col min-[420px]:flex-row border rounded-lg overflow-hidden min-h-[220px] max-h-[320px]">
        <div className="min-[420px]:w-[55%] min-[420px]:min-w-0 min-[420px]:border-r border-gray-200 overflow-y-auto divide-y divide-gray-100 bg-white">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500 text-center">No matches.</div>
          ) : (
            filtered.map((p) => {
              const isSelected = selectedId === p.id;
              const isFocused = focusedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full flex items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                    disabled ? 'cursor-default opacity-70' : 'cursor-pointer'
                  } ${isFocused ? 'bg-gray-50' : 'hover:bg-gray-50/80'}`}
                  onClick={() => {
                    if (disabled) return;
                    setFocusedId(p.id);
                    onSelect(p.id);
                  }}
                >
                  <div className="mt-1 w-4 h-4 rounded border border-gray-300 flex items-center justify-center shrink-0 bg-white">
                    {isSelected && <Check className="w-3 h-3 text-[var(--brand-primary)]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-gray-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-gray-500">{p.data_type}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="min-[420px]:w-[45%] min-[420px]:min-w-0 bg-gray-50 p-3 overflow-y-auto">
          {focused ? (
            <div className="space-y-2">
              <div className="font-mono text-xs font-semibold text-gray-900 break-words">{focused.name}</div>
              <div className="text-[11px] text-gray-600">Type: {focused.data_type}</div>
              <div className="text-[11px] text-gray-600">
                {focused.description?.trim() ? focused.description : 'No description.'}
              </div>
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect(null)}
                  disabled={disabled || !selectedId}
                >
                  Clear selection
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Select a property to preview.</div>
          )}
        </div>
      </div>
    </div>
  );
}

