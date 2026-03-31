/**
 * Structured editors for property JSON fields (value_schema_json, example_values_json, name_mappings_json).
 * Shapes match src/types/schema.ts and backend property.dal / routes/properties validation.
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  forwardRef,
  useRef,
  useState,
} from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import type { EventPropertyPresence, PropertyNameMapping } from '@/src/types/schema';
import {
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
  PROPERTY_NAME_MAPPING_ROLES,
  type PropertyDataFormat,
  type PropertyDataType,
  type PropertyExampleValue,
  type PropertyNameMappingRole,
  type PropertyValueSchema,
  type PropertyValueSchemaNode,
} from '@/src/types/schema';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { PropertySingleSelectPicker } from '@/src/features/properties/components/PropertySingleSelectPicker';

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
  /** Maps object field keys to workspace property ids (object parent only). */
  objectChildRefs?: Record<string, string>;
  onObjectChildRefsChange?: (next: Record<string, string>) => void;
  linkPropertyOptions?: {
    id: string;
    name: string;
    data_type: PropertyDataType;
    name_mappings_json?: PropertyNameMapping[] | null;
  }[];
  /** When editing, exclude this property id from link targets (no self-reference). */
  excludePropertyId?: string | null;
};

export function PropertyValueSchemaEditor({
  dataType,
  value,
  onChange,
  disabled,
  objectChildRefs = {},
  onObjectChildRefsChange,
  linkPropertyOptions = [],
  excludePropertyId = null,
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
                  Nested properties
                </span>
                {Object.keys(value?.properties ?? {}).length === 0 && (
                  <p className="text-xs text-gray-500 italic">
                    No nested properties yet — add canonical properties below.
                  </p>
                )}
                {Object.entries(objectChildRefs ?? {}).map(([key, propertyId]) => (
                  <NestedAttachedChildRow
                    key={key}
                    fieldKey={key}
                    propertyId={propertyId}
                    schemaNode={
                      value?.type === 'object' && value.properties ? value.properties[key] : null
                    }
                    onSchemaNodeChange={(nextNode) => {
                      if (!value || value.type !== 'object') return;
                      const props = { ...(value.properties ?? {}) };
                      props[key] = nextNode;
                      onChange({ ...value, properties: props });
                    }}
                    onRemove={() => {
                      if (!onObjectChildRefsChange) return;
                      const nextRefs = { ...(objectChildRefs ?? {}) };
                      delete nextRefs[key];
                      onObjectChildRefsChange(nextRefs);
                      if (value?.type === 'object') {
                        const nextProps = { ...(value.properties ?? {}) };
                        delete nextProps[key];
                        onChange({ ...value, properties: nextProps });
                      }
                    }}
                    resolveProperty={(id) => linkPropertyOptions.find((p) => p.id === id) ?? null}
                    disabled={disabled}
                  />
                ))}
                <NestedAttachControls
                  value={value}
                  onChange={onChange}
                  objectChildRefs={objectChildRefs}
                  onObjectChildRefsChange={onObjectChildRefsChange}
                  linkPropertyOptions={linkPropertyOptions}
                  excludePropertyId={excludePropertyId}
                  disabled={disabled}
                />
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

function resolvePayloadKeyFromNameMappingsJson(
  name: string,
  nameMappings: PropertyNameMapping[] | null | undefined
): string {
  if (Array.isArray(nameMappings)) {
    const payloadKey = nameMappings.find((m) => m?.role === 'payload_key') ?? nameMappings[0];
    const mapped = payloadKey?.name ? String(payloadKey.name).trim() : '';
    if (mapped) return mapped;
  }
  return name;
}

function ensureUniqueKey(base: string, existing: Set<string>): string {
  const trimmed = base.trim();
  const safe = trimmed ? trimmed : 'property';
  if (!existing.has(safe)) return safe;
  let i = 2;
  while (existing.has(`${safe}_${i}`)) i += 1;
  return `${safe}_${i}`;
}

function NestedAttachControls({
  value,
  onChange,
  objectChildRefs,
  onObjectChildRefsChange,
  linkPropertyOptions,
  excludePropertyId,
  disabled,
}: {
  value: PropertyValueSchema | null;
  onChange: (value: PropertyValueSchema | null) => void;
  objectChildRefs: Record<string, string>;
  onObjectChildRefsChange?: (next: Record<string, string>) => void;
  linkPropertyOptions: Array<{
    id: string;
    name: string;
    data_type: PropertyDataType;
    name_mappings_json?: PropertyNameMapping[] | null;
  }>;
  excludePropertyId: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [addPresence, setAddPresence] = useState<EventPropertyPresence>('always_sent');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());

  const selectable = useMemo(() => {
    const attachedIds = new Set(Object.values(objectChildRefs ?? {}));
    return linkPropertyOptions.filter((p) => {
      if (excludePropertyId && p.id === excludePropertyId) return false;
      if (p.data_type === 'object' || p.data_type === 'array') return false;
      if (attachedIds.has(p.id)) return false;
      return true;
    });
  }, [linkPropertyOptions, objectChildRefs, excludePropertyId]);

  if (!onObjectChildRefsChange) return null;
  if (!value || value.type !== 'object') return null;

  const attachedIds = new Set(Object.values(objectChildRefs ?? {}));

  const onAddSelected = async (propertyIds: string[]): Promise<boolean> => {
    const base = value && value.type === 'object' ? value : defaultObjectSchema();
    const nextProps: Record<string, PropertyValueSchemaNode> = { ...(base.properties ?? {}) };
    const nextRefs: Record<string, string> = { ...(objectChildRefs ?? {}) };
    const existingKeys = new Set(Object.keys(nextProps));

    for (const pid of propertyIds) {
      const pr = linkPropertyOptions.find((p) => p.id === pid);
      if (!pr) continue;
      const key = ensureUniqueKey(
        resolvePayloadKeyFromNameMappingsJson(pr.name, pr.name_mappings_json),
        existingKeys
      );
      existingKeys.add(key);
      nextRefs[key] = pid;
      nextProps[key] = {
        type: pr.data_type,
        required: true,
        presence: addPresence,
      };
    }

    onObjectChildRefsChange(nextRefs);
    onChange({ ...base, type: 'object', properties: nextProps });
    return true;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Add nested properties
      </Button>
      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          setCheckedIds(new Set());
        }}
        title="Add nested properties"
        backdropClassName="z-[80]"
        className="z-[90] max-w-[min(720px,calc(100vw-1.5rem))] max-h-[min(90vh,720px)] flex flex-col"
        bodyClassName="p-4 min-h-0 flex-1 overflow-y-auto"
      >
        <EventLikeAttachPicker
          availableProperties={selectable}
          attachedIds={attachedIds}
          addPresence={addPresence}
          onAddPresenceChange={setAddPresence}
          checkedIds={checkedIds}
          onCheckedIdsChange={setCheckedIds}
          onAddSelected={onAddSelected}
          disabled={disabled}
        />
      </Modal>
    </>
  );
}

function EventLikeAttachPicker({
  availableProperties,
  attachedIds,
  addPresence,
  onAddPresenceChange,
  checkedIds,
  onCheckedIdsChange,
  onAddSelected,
  disabled,
}: {
  availableProperties: Array<{ id: string; name: string; data_type: PropertyDataType }>;
  attachedIds: ReadonlySet<string>;
  addPresence: EventPropertyPresence;
  onAddPresenceChange: (p: EventPropertyPresence) => void;
  checkedIds: Set<string>;
  onCheckedIdsChange: (s: Set<string>) => void;
  onAddSelected: (ids: string[]) => Promise<boolean>;
  disabled?: boolean;
}) {
  // Lightweight inline reuse of the event picker mental model: search + checkboxes + preview + add.
  // (We keep it here to avoid touching event flows.)
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
      setFocusedId(filtered[0].id);
    }
  }, [filtered, focusedId]);
  const focused = useMemo(() => filtered.find((p) => p.id === focusedId) ?? null, [filtered, focusedId]);

  const toggleChecked = (id: string) => {
    if (attachedIds.has(id)) return;
    onCheckedIdsChange((() => {
      const next = new Set(checkedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    })());
  };

  const selectableCheckedCount = useMemo(() => {
    let n = 0;
    for (const id of checkedIds) {
      if (!attachedIds.has(id)) n += 1;
    }
    return n;
  }, [checkedIds, attachedIds]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px] space-y-1">
          <label className="text-xs font-medium text-gray-600">Search properties</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name…"
            disabled={disabled}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-gray-600 block">Presence for new nested</span>
          <select
            value={addPresence}
            onChange={(e) => onAddPresenceChange(e.target.value as EventPropertyPresence)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            disabled={disabled}
          >
            <option value="always_sent">Always</option>
            <option value="sometimes_sent">Sometimes</option>
            <option value="never_sent">Never</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 shrink-0 min-w-[8.5rem]"
          onClick={() => void onAddSelected([...checkedIds].filter((id) => !attachedIds.has(id)))}
          disabled={selectableCheckedCount === 0 || disabled}
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden />
          <span>Add selected{selectableCheckedCount > 0 ? ` (${selectableCheckedCount})` : ''}</span>
        </Button>
      </div>

      <div className="flex flex-col min-[420px]:flex-row border rounded-lg overflow-hidden min-h-[220px] max-h-[320px]">
        <div className="min-[420px]:w-[55%] min-[420px]:min-w-0 min-[420px]:border-r border-gray-200 overflow-y-auto divide-y divide-gray-100 bg-white">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500 text-center">No matches.</div>
          ) : (
            filtered.map((p) => {
              const isChecked = checkedIds.has(p.id);
              const isFocused = focusedId === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-start gap-2 px-2 py-1.5 text-left transition-colors ${
                    disabled ? 'cursor-default' : 'cursor-pointer'
                  } ${isFocused ? 'bg-gray-50' : 'hover:bg-gray-50/80'}`}
                  onClick={() => {
                    setFocusedId(p.id);
                    if (!disabled) toggleChecked(p.id);
                  }}
                >
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 shrink-0"
                    checked={isChecked}
                    disabled={disabled}
                    onChange={() => toggleChecked(p.id)}
                    aria-label={`Select ${p.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-gray-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-gray-500">{p.data_type}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="min-[420px]:w-[45%] min-[420px]:min-w-0 bg-gray-50 p-3 overflow-y-auto">
          {focused ? (
            <div className="space-y-2">
              <div className="font-mono text-xs font-semibold text-gray-900 break-words">{focused.name}</div>
              <div className="text-[11px] text-gray-600">Type: {focused.data_type}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Select a property to preview.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function NestedAttachedChildRow({
  fieldKey,
  propertyId,
  schemaNode,
  onSchemaNodeChange,
  onRemove,
  resolveProperty,
  disabled,
}: {
  fieldKey: string;
  propertyId: string;
  schemaNode: PropertyValueSchemaNode | null;
  onSchemaNodeChange: (next: PropertyValueSchemaNode) => void;
  onRemove: () => void;
  resolveProperty: (id: string) => { id: string; name: string; data_type: PropertyDataType } | null;
  disabled?: boolean;
}) {
  const pr = resolveProperty(propertyId);
  const required = schemaNode?.required !== false;
  const presence = (schemaNode as any)?.presence as EventPropertyPresence | undefined;
  return (
    <div className="rounded border border-gray-200 bg-white p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-gray-500">Object key</div>
          <div className="font-mono text-xs text-gray-900 truncate">{fieldKey}</div>
          <div className="text-[10px] text-gray-500 mt-1">Canonical property</div>
          <div className="font-mono text-xs text-gray-900 truncate">
            {pr ? pr.name : '(missing)'} {pr ? `· ${pr.data_type}` : ''}
          </div>
        </div>
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
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) =>
              onSchemaNodeChange({ ...(schemaNode ?? { type: pr?.data_type ?? 'string' }), required: e.target.checked ? true : false })
            }
            disabled={disabled}
            className="rounded border-gray-300"
          />
          Required
        </label>
        <div className="flex items-center gap-2 text-xs text-gray-700">
          <span className="text-[11px] text-gray-600">Presence</span>
          <select
            value={presence ?? 'always_sent'}
            onChange={(e) =>
              onSchemaNodeChange({ ...(schemaNode ?? { type: pr?.data_type ?? 'string' }), presence: e.target.value as any })
            }
            disabled={disabled}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs"
          >
            <option value="always_sent">Always</option>
            <option value="sometimes_sent">Sometimes</option>
            <option value="never_sent">Never</option>
          </select>
        </div>
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
  objectChildRefId,
  onObjectChildRefChange,
  linkPropertyOptions,
  excludePropertyId,
  disabled,
}: {
  fieldKey: string;
  child: PropertyValueSchemaNode;
  onRename: (next: string) => void;
  onChildChange: (n: PropertyValueSchemaNode) => void;
  onRemove: () => void;
  objectChildRefId?: string;
  onObjectChildRefChange?: (id: string | null) => void;
  linkPropertyOptions?: { id: string; name: string; data_type: PropertyDataType }[];
  excludePropertyId?: string | null;
  disabled?: boolean;
}) {
  const pickerOptions = useMemo(
    () =>
      (linkPropertyOptions ?? []).filter((o) => {
        if (excludePropertyId && o.id === excludePropertyId) return false;
        if (o.data_type === 'object' || o.data_type === 'array') return false;
        return true;
      }),
    [linkPropertyOptions, excludePropertyId]
  );
  const linked = useMemo(
    () => (objectChildRefId ? pickerOptions.find((o) => o.id === objectChildRefId) ?? null : null),
    [objectChildRefId, pickerOptions]
  );
  const [pickerOpen, setPickerOpen] = useState(false);
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
      {onObjectChildRefChange && pickerOptions.length > 0 && (
        <div>
          <label className="text-[10px] text-gray-500">Canonical property (nested field)</label>
          <div className="flex items-center gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              disabled={disabled}
            >
              {linked ? 'Change…' : 'Choose…'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-700"
              onClick={() => onObjectChildRefChange(null)}
              disabled={disabled || !objectChildRefId}
            >
              Clear
            </Button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {linked ? (
              <>
                Linked: <span className="font-mono">{linked.name}</span> ({linked.data_type})
              </>
            ) : objectChildRefId ? (
              <>Linked: <span className="font-mono">(missing)</span></>
            ) : (
              'Linked: —'
            )}
          </p>
          <Modal
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title="Select canonical property"
            backdropClassName="z-[80]"
            className="z-[90] max-w-[min(720px,calc(100vw-1.5rem))] max-h-[min(90vh,720px)] flex flex-col"
            bodyClassName="p-4 min-h-0 flex-1 overflow-y-auto"
          >
            <PropertySingleSelectPicker
              availableProperties={pickerOptions as any}
              selectedId={objectChildRefId ?? null}
              onSelect={(id) => {
                onObjectChildRefChange(id);
                setPickerOpen(false);
              }}
              disabled={disabled}
            />
          </Modal>
        </div>
      )}
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

/** JSON textarea for object/array property types, or legacy object/array-shaped example values. */
export function shouldUseJsonValueEditor(
  propertyDataType: PropertyDataType,
  value: unknown
): boolean {
  if (propertyDataType === 'object' || propertyDataType === 'array') return true;
  if (value !== null && typeof value === 'object') return true;
  return false;
}

function isoToDatetimeLocal(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function numberToDisplayString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return String(v);
}

export type ExampleValueRowHandle = {
  flushValue: () => { ok: true; value: unknown } | { ok: false; error: string };
};

type ExampleValueRowProps = {
  index: number;
  entry: PropertyExampleValue;
  propertyDataType: PropertyDataType;
  onChange: (next: PropertyExampleValue) => void;
  onRemove: () => void;
  disabled?: boolean;
};

const ExampleValueRow = forwardRef<ExampleValueRowHandle, ExampleValueRowProps>(
  function ExampleValueRow(
    { index, entry, propertyDataType, onChange, onRemove, disabled },
    ref
  ) {
    const jsonMode = shouldUseJsonValueEditor(propertyDataType, entry.value);
    const [valueText, setValueText] = useState(() => stringifyExampleValue(entry.value));
    const [valueError, setValueError] = useState<string | null>(null);
    const [numberText, setNumberText] = useState(() => numberToDisplayString(entry.value));
    const [numberError, setNumberError] = useState<string | null>(null);
    const vk = valueKey(entry.value);

    useEffect(() => {
      if (jsonMode) {
        setValueText(stringifyExampleValue(entry.value));
        setValueError(null);
      }
      if (propertyDataType === 'number' && !jsonMode) {
        setNumberText(numberToDisplayString(entry.value));
        setNumberError(null);
      }
    }, [jsonMode, vk, propertyDataType]);

    useImperativeHandle(
      ref,
      () => ({
        flushValue: (): { ok: true; value: unknown } | { ok: false; error: string } => {
          if (jsonMode) {
            const t = valueText.trim();
            if (t === '') return { ok: true, value: null };
            try {
              return { ok: true, value: JSON.parse(t) as unknown };
            } catch {
              return { ok: false, error: 'Invalid JSON in value field.' };
            }
          }
          if (propertyDataType === 'number') {
            const t = numberText.trim();
            if (t === '') return { ok: true, value: null };
            const n = Number(t);
            if (Number.isNaN(n)) {
              return { ok: false, error: 'Enter a valid number.' };
            }
            return { ok: true, value: n };
          }
          return { ok: true, value: entry.value };
        },
      }),
      [jsonMode, valueText, numberText, entry.value, propertyDataType]
    );

    const commitJson = () => {
      const t = valueText.trim();
      if (t === '') {
        setValueError(null);
        onChange({ ...entry, value: null });
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

    const renderValueControl = () => {
      if (jsonMode) {
        return (
          <div>
            <label className="text-[11px] text-gray-600">Value (JSON)</label>
            <textarea
              value={valueText}
              onChange={(e) => {
                setValueText(e.target.value);
                setValueError(null);
              }}
              onBlur={commitJson}
              rows={4}
              className="mt-0.5 w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs font-mono"
              placeholder='e.g. {"a":1} or [1,2]'
              disabled={disabled}
            />
            {valueError && <p className="text-[11px] text-red-600 mt-1">{valueError}</p>}
            <p className="text-[10px] text-gray-500 mt-0.5">
              Use JSON for objects, arrays, or nested values. Blur applies edits.
            </p>
          </div>
        );
      }

      if (propertyDataType === 'string') {
        const str =
          entry.value === null || entry.value === undefined
            ? ''
            : typeof entry.value === 'string'
              ? entry.value
              : String(entry.value);
        return (
          <div>
            <label className="text-[11px] text-gray-600">Value</label>
            <Input
              value={str}
              onChange={(e) => onChange({ ...entry, value: e.target.value })}
              className="mt-0.5 text-xs h-9"
              placeholder="e.g. cart_abandoned"
              disabled={disabled}
            />
          </div>
        );
      }

      if (propertyDataType === 'number') {
        return (
          <div>
            <label className="text-[11px] text-gray-600">Value</label>
            <Input
              type="text"
              inputMode="decimal"
              value={numberText}
              onChange={(e) => {
                const t = e.target.value;
                setNumberText(t);
                const trimmed = t.trim();
                if (trimmed === '') {
                  setNumberError(null);
                  onChange({ ...entry, value: null });
                  return;
                }
                const n = Number(trimmed);
                if (Number.isNaN(n)) {
                  setNumberError('Enter a valid number.');
                  return;
                }
                setNumberError(null);
                onChange({ ...entry, value: n });
              }}
              className="mt-0.5 text-xs h-9 font-mono"
              placeholder="e.g. 42"
              disabled={disabled}
            />
            {numberError && <p className="text-[11px] text-red-600 mt-1">{numberError}</p>}
          </div>
        );
      }

      if (propertyDataType === 'boolean') {
        const v = entry.value;
        const sel =
          v === true || v === 'true'
            ? 'true'
            : v === false || v === 'false'
              ? 'false'
              : '';
        return (
          <div>
            <label className="text-[11px] text-gray-600">Value</label>
            <select
              value={sel}
              onChange={(e) => {
                const t = e.target.value;
                if (t === '') onChange({ ...entry, value: null });
                else onChange({ ...entry, value: t === 'true' });
              }}
              className="mt-0.5 w-full rounded-md border border-input bg-white px-2 py-2 text-xs"
              disabled={disabled}
            >
              <option value="">(unset)</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        );
      }

      if (propertyDataType === 'timestamp') {
        const local = isoToDatetimeLocal(entry.value);
        return (
          <div>
            <label className="text-[11px] text-gray-600">Value (date &amp; time)</label>
            <Input
              type="datetime-local"
              value={local}
              onChange={(e) => {
                const t = e.target.value;
                if (!t.trim()) {
                  onChange({ ...entry, value: null });
                  return;
                }
                const d = new Date(t);
                if (Number.isNaN(d.getTime())) {
                  return;
                }
                onChange({ ...entry, value: d.toISOString() });
              }}
              className="mt-0.5 text-xs h-9"
              disabled={disabled}
            />
            <p className="text-[10px] text-gray-500 mt-0.5">
              Stored as ISO 8601 string (e.g. in <span className="font-mono">example_values_json</span>).
            </p>
          </div>
        );
      }

      return null;
    };

    return (
      <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-2">
        {renderValueControl()}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 h-8"
            onClick={onRemove}
            disabled={disabled}
          >
            Clear example
          </Button>
        </div>
      </div>
    );
  }
);

export type PropertyExampleValuesEditorHandle = {
  /** Merge pending JSON textarea edits into entries (primitives are already live). */
  flushPendingForSave: () =>
    | { ok: true; entries: PropertyExampleValue[] }
    | { ok: false; error: string };
};

export type PropertyExampleValuesEditorProps = {
  propertyDataType: PropertyDataType;
  entries: PropertyExampleValue[];
  onChange: (entries: PropertyExampleValue[]) => void;
  disabled?: boolean;
};

export const PropertyExampleValuesEditor = forwardRef<
  PropertyExampleValuesEditorHandle,
  PropertyExampleValuesEditorProps
>(function PropertyExampleValuesEditor(
  { propertyDataType, entries, onChange, disabled },
  ref
) {
  const rowRefs = useRef<Array<ExampleValueRowHandle | null>>([]);

  useImperativeHandle(
    ref,
    () => ({
      flushPendingForSave: () => {
        const next: PropertyExampleValue[] = entries.map((row, i) => ({ ...row }));
        for (let i = 0; i < next.length; i++) {
          const handle = rowRefs.current[i];
          if (!handle) continue;
          const r = handle.flushValue();
          if (r.ok === false) {
            return { ok: false, error: `Example value: ${r.error}` };
          }
          next[i] = { ...next[i], value: r.value };
        }
        return { ok: true, entries: next };
      },
    }),
    [entries, propertyDataType]
  );

  const entry = entries[0] ?? { value: null };
  const setEntry = (next: PropertyExampleValue) => {
    // Single canonical example: store as 1-entry array (or empty when value is null).
    if (next.value === null || next.value === undefined) {
      onChange([]);
      return;
    }
    onChange([next]);
  };

  return (
    <div className="space-y-3">
      <ExampleValueRow
        key="single-example"
        ref={(el) => {
          rowRefs.current[0] = el;
        }}
        index={0}
        entry={entry}
        propertyDataType={propertyDataType}
        onChange={setEntry}
        onRemove={() => onChange([])}
        disabled={disabled}
      />
      <p className="text-xs text-gray-500">
        One canonical example value is supported. Clear the value to remove the example.
      </p>
    </div>
  );
});

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
  const row = rows[0];
  if (!row) return { ok: true };
  if (!Object.prototype.hasOwnProperty.call(row, 'value')) {
    return { ok: false, error: `Example value is missing a value.` };
  }
  return { ok: true };
}

export function serializeExampleValuesForSave(rows: PropertyExampleValue[]): PropertyExampleValue[] | null {
  const first = rows[0];
  if (!first || !Object.prototype.hasOwnProperty.call(first, 'value')) return null;
  if (first.value === null || first.value === undefined) return null;
  // Product decision: exactly one canonical example value; label/notes are not persisted from this editor UI.
  return [{ value: first.value }];
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
