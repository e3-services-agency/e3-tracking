/**
 * `Property.allowed_values_json` editor (D-16, T-1-04): rows of `{value, label, description,
 * standard_event}`. `standard_event` is a select seeded from `src/domain/bloomreach.ts`
 * (`STANDARD_EVENTS`) plus the project's `standard_event_additions_json` (D-26) — a UI hint for
 * which Bloomreach standard event a discriminator value maps to (D-03 rule 5).
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { mergeStandardEvents, type StandardEventSeed } from '@/src/domain/bloomreach';

export interface AllowedValueRow {
  value: string;
  label?: string | null;
  description?: string | null;
  standard_event?: string | null;
}

export function AllowedValuesEditor({
  values,
  onChange,
  standardEventAdditions,
  showStandardEvent = true,
}: {
  values: AllowedValueRow[];
  onChange: (next: AllowedValueRow[]) => void;
  /** `projects.standard_event_additions_json` (D-26); merged with the seed for the select. */
  standardEventAdditions?: StandardEventSeed[] | null;
  /** T-4-23: the binding only makes sense for a discriminator (or an existing binding); hidden otherwise. */
  showStandardEvent?: boolean;
}) {
  const standardEvents = mergeStandardEvents(standardEventAdditions);

  const addRow = () => onChange([...values, { value: '', label: '', description: '', standard_event: '' }]);
  const removeRow = (index: number) => onChange(values.filter((_, i) => i !== index));
  const updateRow = (index: number, patch: Partial<AllowedValueRow>) =>
    onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Allowed values</label>
        <span className="text-xs text-gray-500">{values.length} value(s)</span>
      </div>
      {values.length > 0 && (
        <div className="space-y-2">
          {values.map((row, index) => (
            <div key={index} className="border rounded-md p-2 bg-gray-50 grid grid-cols-12 gap-2 items-center">
              <Input
                value={row.value}
                onChange={(e) => updateRow(index, { value: e.target.value })}
                placeholder="value"
                className="col-span-3 h-8 text-xs font-mono"
              />
              <Input
                value={row.label ?? ''}
                onChange={(e) => updateRow(index, { label: e.target.value })}
                placeholder="label"
                className="col-span-3 h-8 text-xs"
              />
              <Input
                value={row.description ?? ''}
                onChange={(e) => updateRow(index, { description: e.target.value })}
                placeholder="description"
                className={showStandardEvent ? "col-span-3 h-8 text-xs" : "col-span-5 h-8 text-xs"}
              />
              {showStandardEvent && (
              <select
                value={row.standard_event ?? ''}
                onChange={(e) => updateRow(index, { standard_event: e.target.value || null })}
                title="Binds this discriminator value to a Bloomreach standard event (for example add to cart), so the variant maps to it in the standard event mappings."
                className="col-span-2 h-8 rounded border border-gray-300 px-1 text-xs"
              >
                <option value="">standard event —</option>
                {standardEvents.map((se) => (
                  <option key={se.key} value={se.key}>{se.key}</option>
                ))}
              </select>
              )}
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="col-span-1 text-red-500 hover:text-red-700 flex justify-center"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
        <Plus className="w-3 h-3" /> Add value
      </Button>
    </div>
  );
}
