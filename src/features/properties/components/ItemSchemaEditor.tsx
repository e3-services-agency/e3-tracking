/**
 * `Property.item_schema_json` editor (D-30 ItemSchema, T-2-07): rows of `{field, data_type,
 * data_formats, required}`, shown only when the property's own `data_type` is `array` (the DAL's
 * 400 `ITEM_SCHEMA_REQUIRES_ARRAY`, `property.dal.ts`). Backs the rules layer's `list_field`/
 * `haystack` operands and `runItemSchemaChecks` (`item_schema_violation`).
 */
import React from 'react';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { PROPERTY_DATA_TYPES, PROPERTY_DATA_FORMATS } from '@/src/domain/enums';

export interface ItemSchemaFieldRow {
  field: string;
  data_type: string;
  data_formats?: string[];
  required?: boolean;
}

export function ItemSchemaEditor({
  fields,
  onChange,
}: {
  fields: ItemSchemaFieldRow[];
  onChange: (next: ItemSchemaFieldRow[]) => void;
}) {
  const addRow = () => onChange([...fields, { field: '', data_type: 'string', data_formats: [], required: false }]);
  const removeRow = (index: number) => onChange(fields.filter((_, i) => i !== index));
  const updateRow = (index: number, patch: Partial<ItemSchemaFieldRow>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const toggleFormat = (index: number, fmt: string) => {
    const current = fields[index].data_formats ?? [];
    updateRow(index, { data_formats: current.includes(fmt) ? current.filter((f) => f !== fmt) : [...current, fmt] });
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Item schema (array items)</FieldLabel>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
          <Plus className="w-3 h-3" /> Add field
        </Button>
      </div>
      {fields.length === 0 && <div className="text-xs text-gray-500">No item schema fields — a list rule/check cannot reference this property's items.</div>}
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="border rounded-md p-2 space-y-1 bg-gray-50">
            <div className="flex flex-wrap gap-2 items-center">
              <Input value={f.field} onChange={(e) => updateRow(i, { field: e.target.value })} placeholder="field name" className="h-8 w-36 text-xs" />
              <select value={f.data_type} onChange={(e) => updateRow(i, { data_type: e.target.value })} className="h-8 rounded border border-gray-300 px-2 text-xs">
                {PROPERTY_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <FieldLabel className="flex items-center gap-1 text-xs" hintScope="Properties">
                <input type="checkbox" checked={f.required ?? false} onChange={(e) => updateRow(i, { required: e.target.checked })} />
                required
              </FieldLabel>
              <button type="button" onClick={() => removeRow(i)} className="text-red-500 hover:text-red-700 ml-auto">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {PROPERTY_DATA_FORMATS.map((fmt) => (
                <FieldLabel key={fmt} className="flex items-center gap-1 text-[10px] bg-white border rounded px-1.5 py-0.5" hintScope="Properties">
                  <input type="checkbox" checked={(f.data_formats ?? []).includes(fmt)} onChange={() => toggleFormat(i, fmt)} />
                  {fmt}
                </FieldLabel>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
