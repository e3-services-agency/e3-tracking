/**
 * `Event.derived_metrics_json` editor: `[{name, expression, description}]` (T-1-04), e.g.
 * `revenue = purchase.total_price where purchase_status = success`.
 */
import React from 'react';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';

export interface DerivedMetricRow {
  name: string;
  expression: string;
  description?: string | null;
}

export function DerivedMetricsEditor({
  values,
  onChange,
}: {
  values: DerivedMetricRow[];
  onChange: (next: DerivedMetricRow[]) => void;
}) {
  const addRow = () => onChange([...values, { name: '', expression: '', description: '' }]);
  const removeRow = (index: number) => onChange(values.filter((_, i) => i !== index));
  const updateRow = (index: number, patch: Partial<DerivedMetricRow>) =>
    onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <div className="space-y-2 border-t pt-4">
      <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Events">Derived metrics</FieldLabel>
      {values.map((row, index) => (
        <div key={index} className="border rounded-md p-2 bg-gray-50 grid grid-cols-12 gap-2 items-center">
          <Input
            value={row.name}
            onChange={(e) => updateRow(index, { name: e.target.value })}
            placeholder="name, e.g. revenue"
            className="col-span-3 h-8 text-xs font-mono"
          />
          <Input
            value={row.expression}
            onChange={(e) => updateRow(index, { expression: e.target.value })}
            placeholder="expression, e.g. total_price where purchase_status = success"
            className="col-span-6 h-8 text-xs"
          />
          <Input
            value={row.description ?? ''}
            onChange={(e) => updateRow(index, { description: e.target.value })}
            placeholder="description"
            className="col-span-2 h-8 text-xs"
          />
          <button type="button" onClick={() => removeRow(index)} className="col-span-1 text-red-500 hover:text-red-700 flex justify-center">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
        <Plus className="w-3 h-3" /> Add metric
      </Button>
    </div>
  );
}
