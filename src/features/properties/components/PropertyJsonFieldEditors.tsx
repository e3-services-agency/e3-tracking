/**
 * Structured editors for property JSON fields (value_schema_json, example_values_json, name_mappings_json).
 * Shapes match src/types/schema.ts and backend property.dal / routes/properties validation.
 */
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
  PROPERTY_NAME_MAPPING_ROLES,
  type PropertyDataFormat,
  type PropertyDataType,
  type PropertyExampleValue,
  type PropertyNameMapping,
  type PropertyNameMappingRole,
  type PropertyValueSchema,
  type PropertyValueSchemaNode,
} from '@/src/types/schema';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

const DATA_FORMAT_LABELS: Record<PropertyDataFormat, string> = {
  uuid: 'UUID',
  iso8601_datetime: 'ISO 8601 datetime',
  iso8601_date: 'ISO 8601 date',
  unix_seconds: 'Unix seconds',
  unix_milliseconds: 'Unix milliseconds',
  email: 'Email',
  uri: 'URI',
  currency_code: 'Currency code',
  country_code: 'Country code',
  language_code: 'Language code',
};

const MAX_SCHEMA_DEPTH = 8;

function defaultObjectSchema(): PropertyValueSchema {
  return { type: 'object', properties: {} };
}

function defaultArraySchema(): PropertyValueSchema {
  return { type: 'array', items: { type: 'string' } };
}

function defaultLeafNode(type: PropertyDataType = 'string'): PropertyValueSchemaNode {
  return { type };
}

// ----- Value schema: nested node -----

type SchemaNodeEditorProps = {
  node: PropertyValueSchemaNode;
  onChange: (node: PropertyValueSchemaNode) => void;
  depth: number;
  disabled?: boolean;
};

function SchemaNodeEditor({ node, onChange, depth, disabled }: SchemaNodeEditorProps) {
  const baseId = useId();
  const objectProps = node.type === 'object' ? node.properties ?? {} : {};
  const propEntries = useMemo(() => Object.entries(objectProps), [objectProps]);

  if (depth > MAX_SCHEMA_DEPTH) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        Maximum nesting depth reached. Use Advanced JSON to edit deeper structures.
      </p>
    );
  }

  const setType = (t: PropertyDataType) => {
    if (t === 'object') {
      onChange({
        type: 'object',
        properties: node.type === 'object' && node.properties ? { ...node.properties } : {},
        ...(typeof node.required === 'boolean' ? { required: node.required } : {}),
        ...(node.data_formats ? { data_formats: node.data_formats } : {}),
        ...(typeof node.allow_additional_properties === 'boolean'
          ? { allow_additional_properties: node.allow_additional_properties }
          : {}),
      });
    } else if (t === 'array') {
      onChange({
        type: 'array',
        items:
          node.type === 'array' && node.items
            ? node.items
            : defaultLeafNode('string'),
        ...(typeof node.required === 'boolean' ? { required: node.required } : {}),
        ...(node.data_formats ? { data_formats: node.data_formats } : {}),
      });
    } else {
      onChange({
        type: t,
        ...(typeof node.required === 'boolean' ? { required: node.required } : {}),
        ...(node.data_formats ? { data_formats: node.data_formats } : {}),
      });
    }
  };

  const toggleFormat = (f: PropertyDataFormat) => {
    const cur = node.data_formats ?? [];
    const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
    onChange({
      ...node,
      data_formats: next.length > 0 ? next : undefined,
    });
  };

  const updatePropertyKey = (oldKey: string, newKey: string) => {
    if (node.type !== 'object' || !node.properties) return;
    const nk = newKey.trim();
    if (!nk || nk === oldKey) return;
    if (node.properties[nk] !== undefined) return;
    const { [oldKey]: val, ...rest } = node.properties;
    if (!val) return;
    onChange({
      ...node,
      properties: { ...rest, [nk]: val },
    });
  };

  const updateChildNode = (key: string, child: PropertyValueSchemaNode) => {
    if (node.type !== 'object' || !node.properties) return;
    onChange({
      ...node,
      properties: { ...node.properties, [key]: child },
    });
  };

  const removePropertyKey = (key: string) => {
    if (node.type !== 'object' || !node.properties) return;
    const { [key]: _, ...rest } = node.properties;
    onChange({ ...node, properties: Object.keys(rest).length > 0 ? rest : {} });
  };

  const addProperty = () => {
    if (node.type !== 'object') return;
    const props = { ...(node.properties ?? {}) };
    let k = 'field';
    let i = 1;
    while (props[k] !== undefined) {
      k = `field_${i++}`;
    }
    props[k] = defaultLeafNode('string');
    onChange({ ...node, properties: props });
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-3 text-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-medium text-gray-600">Type</label>
          <select
            className="mt-0.5 w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs font-mono"
            value={node.type}
            onChange={(e) => setType(e.target.value as PropertyDataType)}
            disabled={disabled}
            id={`${baseId}-type`}
          >
            {PROPERTY_DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700 pt-5 sm:pt-6">
          <input
            type="checkbox"
            checked={Boolean(node.required)}
            onChange={(e) =>
              onChange({ ...node, required: e.target.checked ? true : undefined })
            }
            disabled={disabled}
            className="rounded border-gray-300"
          />
          Required
        </label>
      </div>

      {['string', 'number', 'boolean', 'timestamp'].includes(node.type) && (
        <div>
          <span className="text-[11px] font-medium text-gray-600">Data formats (optional)</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {PROPERTY_DATA_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                disabled={disabled}
                onClick={() => toggleFormat(f)}
                className={`rounded px-2 py-0.5 text-[10px] border ${
                  (node.data_formats ?? []).includes(f)
                    ? 'bg-[var(--brand-primary)]/15 border-[var(--brand-primary)]/40 text-gray-900'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {DATA_FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {node.type === 'object' && (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(node.allow_additional_properties)}
              onChange={(e) =>
                onChange({
                  ...node,
                  allow_additional_properties: e.target.checked ? true : undefined,
                })
              }
              disabled={disabled}
              className="rounded border-gray-300"
            />
            Allow additional properties
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                Object properties
              </span>
              <Button type="button" size="sm" variant="outline" onClick={addProperty} disabled={disabled}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add field
              </Button>
            </div>
            {propEntries.length === 0 && (
              <p className="text-xs text-gray-500 italic">No fields defined.</p>
            )}
            {propEntries.map(([key, child]) => (
              <div
                key={key}
                className="rounded border border-gray-200 bg-white p-2 space-y-2"
              >
                <div className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] text-gray-500">Field name</label>
                    <Input
                      defaultValue={key}
                      key={key}
                      onBlur={(e) => updatePropertyKey(key, e.target.value)}
                      className="font-mono text-xs h-8"
                      disabled={disabled}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 mt-5 text-red-600"
                    onClick={() => removePropertyKey(key)}
                    disabled={disabled}
                    aria-label={`Remove ${key}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <SchemaNodeEditor
                  node={child}
                  onChange={(next) => updateChildNode(key, next)}
                  depth={depth + 1}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {node.type === 'array' && (
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            Array items schema
          </span>
          <SchemaNodeEditor
            node={node.items ?? defaultLeafNode('string')}
            onChange={(items) => onChange({ ...node, items })}
            depth={depth + 1}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

// ----- Top-level value schema -----

export type PropertyValueSchemaEditorProps = {
  dataType: PropertyDataType;
  value: PropertyValueSchema | null;
  onChange: (value: PropertyValueSchema | null) => void;
  disabled?: boolean;
};

export function PropertyValueSchemaEditor({
  dataType,
  value,
  onChange,
  disabled,
}: PropertyValueSchemaEditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedText, setAdvancedText] = useState('');
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const supportsSchema = dataType === 'object' || dataType === 'array';

  useEffect(() => {
    if (!advancedOpen) {
      setAdvancedText(value === null ? '' : JSON.stringify(value, null, 2));
      setAdvancedError(null);
    }
  }, [value, advancedOpen]);

  const applyAdvanced = useCallback(() => {
    const trimmed = advancedText.trim();
    if (!trimmed) {
      onChange(null);
      setAdvancedError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        (parsed as PropertyValueSchema).type !== dataType
      ) {
        setAdvancedError(`JSON must be an object with "type": "${dataType}".`);
        return;
      }
      setAdvancedError(null);
      onChange(parsed as PropertyValueSchema);
      setAdvancedOpen(false);
    } catch {
      setAdvancedError('Invalid JSON.');
    }
  }, [advancedText, dataType, onChange]);

  if (!supportsSchema) {
    return (
      <p className="text-xs text-gray-500">
        Value schema applies only when the property value type is <span className="font-mono">object</span> or{' '}
        <span className="font-mono">array</span>.
      </p>
    );
  }

  const ensureValue = () => {
    if (value !== null) return;
    onChange(dataType === 'object' ? defaultObjectSchema() : defaultArraySchema());
  };

  return (
    <div className="space-y-3">
      {value === null && (
        <Button type="button" variant="outline" size="sm" onClick={ensureValue} disabled={disabled}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Define {dataType} schema
        </Button>
      )}

      {value !== null && (
        <div className="space-y-2">
          {dataType === 'object' && (
            <>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(value?.allow_additional_properties)}
                  onChange={(e) =>
                    onChange({
                      ...(value ?? defaultObjectSchema()),
                      allow_additional_properties: e.target.checked ? true : undefined,
                    })
                  }
                  disabled={disabled}
                  className="rounded border-gray-300"
                />
                Allow additional properties (root)
              </label>
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  Properties
                </span>
                {Object.keys(value?.properties ?? {}).length === 0 && (
                  <p className="text-xs text-gray-500 italic">No fields yet — add a field below.</p>
                )}
                {Object.entries(value?.properties ?? {}).map(([key, child]) => (
                  <ObjectRootFieldRow
                    key={key}
                    fieldKey={key}
                    child={child}
                    onRename={(newKey) => {
                      if (!value || value.type !== 'object' || !value.properties) return;
                      const nk = newKey.trim();
                      if (!nk || nk === key || value.properties[nk] !== undefined) return;
                      const { [key]: v, ...rest } = value.properties;
                      if (!v) return;
                      onChange({
                        ...value,
                        properties: { ...rest, [nk]: v },
                      });
                    }}
                    onChildChange={(next) => {
                      if (!value || value.type !== 'object' || !value.properties) return;
                      onChange({
                        ...value,
                        properties: { ...value.properties, [key]: next },
                      });
                    }}
                    onRemove={() => {
                      if (!value || value.type !== 'object' || !value.properties) return;
                      const { [key]: _, ...rest } = value.properties;
                      onChange({
                        ...value,
                        properties: Object.keys(rest).length > 0 ? rest : {},
                      });
                    }}
                    disabled={disabled}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const base = value && value.type === 'object' ? value : defaultObjectSchema();
                    const props = { ...(base.properties ?? {}) };
                    let k = 'field';
                    let i = 1;
                    while (props[k] !== undefined) {
                      k = `field_${i++}`;
                    }
                    props[k] = defaultLeafNode('string');
                    onChange({ ...base, type: 'object', properties: props });
                  }}
                  disabled={disabled}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add field
                </Button>
              </div>
            </>
          )}

          {dataType === 'array' && value?.type === 'array' && (
            <div>
              <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                Element schema
              </span>
              <div className="mt-1">
                <SchemaNodeEditor
                  node={value.items ?? defaultLeafNode('string')}
                  onChange={(items) => onChange({ type: 'array', items })}
                  depth={0}
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {value !== null && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-700"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Clear schema
        </Button>
      )}

      <div className="border border-dashed border-gray-200 rounded-md">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Advanced: edit as JSON
        </button>
        {advancedOpen && (
          <div className="border-t border-gray-100 px-3 pb-3 space-y-2">
            <textarea
              value={advancedText}
              onChange={(e) => {
                setAdvancedText(e.target.value);
                setAdvancedError(null);
              }}
              rows={10}
              className="w-full rounded-md border border-input bg-white px-2 py-2 text-xs font-mono"
              placeholder={`{ "type": "${dataType}", ... }`}
              disabled={disabled}
            />
            {advancedError && <p className="text-xs text-red-600">{advancedError}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={applyAdvanced} disabled={disabled}>
                Apply JSON
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectRootFieldRow({
  fieldKey,
  child,
  onRename,
  onChildChange,
  onRemove,
  disabled,
}: {
  fieldKey: string;
  child: PropertyValueSchemaNode;
  onRename: (next: string) => void;
  onChildChange: (n: PropertyValueSchemaNode) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded border border-gray-200 bg-white p-2 space-y-2">
      <div className="flex gap-2 items-start">
        <div className="flex-1 min-w-0">
          <label className="text-[10px] text-gray-500">Field name</label>
          <Input
            key={fieldKey}
            defaultValue={fieldKey}
            onBlur={(e) => onRename(e.target.value)}
            className="font-mono text-xs h-8"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 mt-5 text-red-600"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <SchemaNodeEditor node={child} onChange={onChildChange} depth={0} disabled={disabled} />
    </div>
  );
}

// ----- Example values -----

function stringifyExampleValue(v: unknown): string {
  if (v === undefined) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function valueKey(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function ExampleValueRow({
  index,
  entry,
  onChange,
  onRemove,
  disabled,
}: {
  index: number;
  entry: PropertyExampleValue;
  onChange: (next: PropertyExampleValue) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [valueText, setValueText] = useState(() => stringifyExampleValue(entry.value));
  const [valueError, setValueError] = useState<string | null>(null);
  const vk = valueKey(entry.value);

  useEffect(() => {
    setValueText(stringifyExampleValue(entry.value));
    setValueError(null);
  }, [vk]);

  const commitValue = () => {
    const t = valueText.trim();
    if (t === '') {
      setValueError('Enter valid JSON (e.g. null, "text", 123, {}, []).');
      return;
    }
    try {
      const parsed = JSON.parse(t) as unknown;
      setValueError(null);
      onChange({ ...entry, value: parsed });
    } catch {
      setValueError('Invalid JSON. Fix the value or remove this row.');
    }
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-semibold text-gray-600">Example {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-red-600 h-8"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div>
        <label className="text-[11px] text-gray-600">Value (JSON)</label>
        <textarea
          value={valueText}
          onChange={(e) => {
            setValueText(e.target.value);
            setValueError(null);
          }}
          onBlur={commitValue}
          rows={3}
          className="mt-0.5 w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs font-mono"
          placeholder='e.g. "cart" or 123 or {"a":1}'
          disabled={disabled}
        />
        {valueError && <p className="text-[11px] text-red-600 mt-1">{valueError}</p>}
        <p className="text-[10px] text-gray-500 mt-0.5">
          Blur the field to apply. Use JSON syntax (double-quoted strings).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[11px] text-gray-600">Label (optional)</label>
          <Input
            value={entry.label ?? ''}
            onChange={(e) => onChange({ ...entry, label: e.target.value || undefined })}
            className="text-xs h-8"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-600">Notes (optional)</label>
          <Input
            value={entry.notes ?? ''}
            onChange={(e) => onChange({ ...entry, notes: e.target.value || undefined })}
            className="text-xs h-8"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export type PropertyExampleValuesEditorProps = {
  entries: PropertyExampleValue[];
  onChange: (entries: PropertyExampleValue[]) => void;
  disabled?: boolean;
};

export function PropertyExampleValuesEditor({
  entries,
  onChange,
  disabled,
}: PropertyExampleValuesEditorProps) {
  const addRow = () => {
    onChange([...entries, { value: null }]);
  };

  const updateRow = (index: number, next: PropertyExampleValue) => {
    onChange(entries.map((e, i) => (i === index ? next : e)));
  };

  const removeRow = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-xs text-gray-500 italic">No examples. Add one to document sample values.</p>
      )}
      {entries.map((row, i) => (
        <ExampleValueRow
          key={i}
          index={i}
          entry={row}
          onChange={(next) => updateRow(i, next)}
          onRemove={() => removeRow(i)}
          disabled={disabled}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Add example
      </Button>
    </div>
  );
}

// ----- Name mappings -----

export type PropertyNameMappingsEditorProps = {
  entries: PropertyNameMapping[];
  onChange: (entries: PropertyNameMapping[]) => void;
  disabled?: boolean;
};

export function PropertyNameMappingsEditor({
  entries,
  onChange,
  disabled,
}: PropertyNameMappingsEditorProps) {
  const addRow = () => {
    onChange([
      ...entries,
      { system: '', name: '', role: 'payload_key' },
    ]);
  };

  const updateRow = (index: number, patch: Partial<PropertyNameMapping>) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const removeRow = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-gray-500 italic">No mappings. Add rows for system-specific names.</p>
      )}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-600">
              <th className="px-2 py-2 font-semibold">System</th>
              <th className="px-2 py-2 font-semibold">Name</th>
              <th className="px-2 py-2 font-semibold">Role</th>
              <th className="px-2 py-2 font-semibold">Notes</th>
              <th className="px-1 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {entries.map((row, i) => (
              <tr key={i} className="border-t border-gray-100 bg-white">
                <td className="px-2 py-1 align-top">
                  <Input
                    value={row.system}
                    onChange={(e) => updateRow(i, { system: e.target.value })}
                    className="h-8 text-xs font-mono"
                    placeholder="e.g. gtm"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1 align-top">
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    className="h-8 text-xs font-mono"
                    placeholder="mapped key"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1 align-top">
                  <select
                    value={row.role}
                    onChange={(e) =>
                      updateRow(i, { role: e.target.value as PropertyNameMappingRole })
                    }
                    className="w-full rounded-md border border-input bg-white px-1 py-1.5 text-xs"
                    disabled={disabled}
                  >
                    {PROPERTY_NAME_MAPPING_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1 align-top">
                  <Input
                    value={row.notes ?? ''}
                    onChange={(e) => updateRow(i, { notes: e.target.value || undefined })}
                    className="h-8 text-xs"
                    placeholder="optional"
                    disabled={disabled}
                  />
                </td>
                <td className="px-1 py-1 align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 h-8 px-1"
                    onClick={() => removeRow(i)}
                    disabled={disabled}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Add mapping
      </Button>
    </div>
  );
}

// ----- Serialize helpers for save -----

/** Validates example rows for API contract; returns error if any row is invalid for save. */
export function validateExampleValuesForSave(rows: PropertyExampleValue[]): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Object.prototype.hasOwnProperty.call(row, 'value')) {
      return { ok: false, error: `Example ${i + 1} is missing a value.` };
    }
    if (
      row.label !== undefined &&
      row.label !== null &&
      typeof row.label !== 'string'
    ) {
      return { ok: false, error: `Example ${i + 1}: label must be a string when set.` };
    }
    if (
      row.notes !== undefined &&
      row.notes !== null &&
      typeof row.notes !== 'string'
    ) {
      return { ok: false, error: `Example ${i + 1}: notes must be a string when set.` };
    }
  }
  return { ok: true };
}

export function serializeExampleValuesForSave(rows: PropertyExampleValue[]): PropertyExampleValue[] | null {
  const out: PropertyExampleValue[] = [];
  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(row, 'value')) continue;
    const entry: PropertyExampleValue = { value: row.value };
    if (typeof row.label === 'string' && row.label.trim()) entry.label = row.label.trim();
    if (typeof row.notes === 'string' && row.notes.trim()) entry.notes = row.notes.trim();
    out.push(entry);
  }
  return out.length > 0 ? out : null;
}

export function serializeNameMappingsForSave(rows: PropertyNameMapping[]): PropertyNameMapping[] | null {
  const out: PropertyNameMapping[] = [];
  for (const row of rows) {
    const system = typeof row.system === 'string' ? row.system.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!system || !name) continue;
    const entry: PropertyNameMapping = {
      system,
      name,
      role: row.role,
    };
    if (typeof row.notes === 'string' && row.notes.trim()) entry.notes = row.notes.trim();
    out.push(entry);
  }
  return out.length > 0 ? out : null;
}
