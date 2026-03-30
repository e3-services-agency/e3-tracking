/**
 * Event-scoped property overrides (event_property_definitions).
 *
 * Display uses API "effective" merge (global property + optional override). Edits only touch override fields
 * sent via PUT; never send merged/effective payloads. PropertyContext is not used for per-event semantics—this
 * section binds overrides to (event_id, property_id) explicitly.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import type {
  EffectiveEventPropertyDefinition,
  EventPropertyDefinitionRow,
  EventPropertyDefinitionUpsertPayload,
  PropertyRow,
} from '@/src/types/schema';
import type { ApiError, EventPropertyWithDetails } from '@/src/features/events/hooks/useEvents';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

type LocalDraft = {
  description: string;
  enumCsv: string;
  requiredChoice: 'inherit' | 'true' | 'false';
  exampleJson: string;
};

function draftFromOverrideRow(
  override: EffectiveEventPropertyDefinition['override']
): LocalDraft {
  if (!override) {
    return {
      description: '',
      enumCsv: '',
      requiredChoice: 'inherit',
      exampleJson: '',
    };
  }
  return {
    description: override.description_override ?? '',
    enumCsv: override.enum_values?.join(', ') ?? '',
    requiredChoice:
      override.required === true ? 'true' : override.required === false ? 'false' : 'inherit',
    exampleJson:
      override.example_values != null ? JSON.stringify(override.example_values, null, 2) : '',
  };
}

function formatEffectiveExample(v: unknown): string {
  if (v === null || v === undefined) return '—';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export interface EventPropertyOverridesSectionProps {
  eventId: string;
  attached: EventPropertyWithDetails[];
  allProperties: PropertyRow[];
  getEffectivePropertyDefinitions: (
    eventId: string,
    options?: { variantId?: string | null }
  ) => Promise<
    { success: true; items: EffectiveEventPropertyDefinition[] } | { success: false; error: ApiError }
  >;
  putEventPropertyDefinitions: (
    eventId: string,
    definitions: EventPropertyDefinitionUpsertPayload[]
  ) => Promise<
    { success: true; definitions: EventPropertyDefinitionRow[] } | { success: false; error: ApiError }
  >;
  deleteEventPropertyDefinition: (
    eventId: string,
    propertyId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  /** When true, override edits/deletes are disabled (e.g. active workspace not in loaded list). */
  workspaceMutationsDisabled?: boolean;
}

export function EventPropertyOverridesSection({
  eventId,
  attached,
  allProperties,
  getEffectivePropertyDefinitions,
  putEventPropertyDefinitions,
  deleteEventPropertyDefinition,
  workspaceMutationsDisabled = false,
}: EventPropertyOverridesSectionProps) {
  const [items, setItems] = useState<EffectiveEventPropertyDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const attachedKey = attached.map((a) => a.property_id).sort().join(',');

  const reload = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    const result = await getEffectivePropertyDefinitions(eventId);
    if (seq !== loadSeqRef.current) return;
    setLoading(false);
    if (result.success === false) {
      setLoadError(result.error.message);
      setItems([]);
      return;
    }
    setItems(result.items);
  }, [eventId, getEffectivePropertyDefinitions]);

  useEffect(() => {
    void reload();
  }, [eventId, attachedKey, reload]);

  const byPropertyId = new Map(items.map((i) => [i.property_id, i]));

  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalDraft>(draftFromOverrideRow(null));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const startEdit = (propertyId: string) => {
    const row = byPropertyId.get(propertyId);
    setFormError(null);
    setEditingPropertyId(propertyId);
    setTouched(new Set());
    setDraft(draftFromOverrideRow(row?.override ?? null));
  };

  const cancelEdit = () => {
    setEditingPropertyId(null);
    setFormError(null);
    setTouched(new Set());
  };

  useEffect(() => {
    if (!workspaceMutationsDisabled) return;
    setEditingPropertyId(null);
    setFormError(null);
    setTouched(new Set());
  }, [workspaceMutationsDisabled]);

  const markTouched = (field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  };

  const handleSaveEdit = async () => {
    if (workspaceMutationsDisabled) return;
    if (!editingPropertyId) return;
    if (touched.size === 0) {
      cancelEdit();
      return;
    }

    const payload: EventPropertyDefinitionUpsertPayload = {
      property_id: editingPropertyId,
    };

    if (touched.has('description_override')) {
      const t = draft.description.trim();
      payload.description_override = t.length > 0 ? t : null;
    }
    if (touched.has('enum_values')) {
      const parts = draft.enumCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      payload.enum_values = parts.length > 0 ? [...new Set(parts)] : null;
    }
    if (touched.has('required')) {
      if (draft.requiredChoice === 'inherit') {
        payload.required = null;
      } else {
        payload.required = draft.requiredChoice === 'true';
      }
    }
    if (touched.has('example_values')) {
      const raw = draft.exampleJson.trim();
      if (!raw) {
        payload.example_values = null;
      } else {
        try {
          payload.example_values = JSON.parse(raw) as unknown;
        } catch {
          setFormError('Example values must be valid JSON.');
          return;
        }
      }
    }

    setSaving(true);
    setFormError(null);
    const result = await putEventPropertyDefinitions(eventId, [payload]);
    setSaving(false);
    if (result.success === false) {
      setFormError(result.error.message);
      return;
    }
    cancelEdit();
    await reload();
  };

  const handleDeleteOverride = async (propertyId: string) => {
    if (workspaceMutationsDisabled) return;
    setDeletingId(propertyId);
    setFormError(null);
    const result = await deleteEventPropertyDefinition(eventId, propertyId);
    setDeletingId(null);
    if (result.success === false) {
      setFormError(result.error.message);
      return;
    }
    if (editingPropertyId === propertyId) {
      cancelEdit();
    }
    await reload();
  };

  if (attached.length === 0) {
    return null;
  }

  return (
    <>
      <hr className="border-gray-200" />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Property overrides</h3>
        <p className="text-xs text-gray-500">
          Optional per-event semantics for attached properties (description, allowed values, required, examples).
          Shown values are <strong>effective</strong> (global + override); saving only updates the event override
          layer.
        </p>

        {loadError && (
          <div className="flex gap-2 text-xs text-red-600" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {loading && !loadError && (
          <p className="text-xs text-gray-500" role="status">
            Loading property definitions…
          </p>
        )}

        {formError && (
          <div className="flex gap-2 text-xs text-red-600" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <ul className="border rounded-lg divide-y divide-gray-100">
          {attached.map((a) => {
            const eff = byPropertyId.get(a.property_id);
            const propMeta = allProperties.find((p) => p.id === a.property_id);
            const name = eff?.property.name ?? a.property_name ?? a.property_id;
            const dataType = eff?.property.data_type ?? propMeta?.data_type ?? '—';
            const isOverridden = eff?.override != null;
            const expanded = editingPropertyId === a.property_id;

            return (
              <li key={a.property_id} className="px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm text-gray-900 truncate">{name}</span>
                    <span className="text-xs text-gray-500 shrink-0">({dataType})</span>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                        isOverridden
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      {isOverridden ? 'Overridden' : 'Global'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isOverridden && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-gray-600"
                        disabled={
                          workspaceMutationsDisabled ||
                          deletingId === a.property_id ||
                          saving
                        }
                        onClick={() => void handleDeleteOverride(a.property_id)}
                      >
                        {deletingId === a.property_id ? 'Removing…' : 'Remove override'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      disabled={
                        workspaceMutationsDisabled ||
                        saving ||
                        deletingId === a.property_id
                      }
                      onClick={() => (expanded ? cancelEdit() : startEdit(a.property_id))}
                    >
                      {expanded ? (
                        <>
                          <ChevronDown className="w-3 h-3" /> Close
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-3 h-3" /> Edit override
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {eff?.warnings && eff.warnings.length > 0 && (
                  <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 list-disc list-inside space-y-0.5">
                    {eff.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}

                <div className="text-xs text-gray-600 space-y-1 rounded bg-gray-50 border border-gray-100 px-2 py-2">
                  <p className="font-medium text-gray-700">Effective (read-only)</p>
                  <p>
                    <span className="text-gray-500">Description:</span>{' '}
                    {eff?.effective.description ?? '—'}
                  </p>
                  <p>
                    <span className="text-gray-500">Enum values:</span>{' '}
                    {eff?.effective.enum_values?.length
                      ? eff.effective.enum_values.join(', ')
                      : '—'}
                  </p>
                  <p>
                    <span className="text-gray-500">Required:</span>{' '}
                    {eff?.effective.required === true
                      ? 'yes'
                      : eff?.effective.required === false
                        ? 'no'
                        : '—'}
                  </p>
                  <p className="break-all">
                    <span className="text-gray-500">Examples:</span>{' '}
                    {eff ? formatEffectiveExample(eff.effective.example_values) : '—'}
                  </p>
                </div>

                {expanded && (
                  <div className="space-y-2 pt-1 border-t border-dashed border-gray-200">
                    <p className="text-[11px] text-gray-500">
                      Override fields only (leave untouched fields out of the save payload). Do not copy global
                      values here unless you intend to override.
                    </p>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Description override</label>
                      <textarea
                        value={draft.description}
                        onChange={(e) => {
                          setDraft((d) => ({ ...d, description: e.target.value }));
                          markTouched('description_override');
                        }}
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        placeholder="Empty + save with this field touched clears override description"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Enum values (comma-separated)</label>
                      <InputLike
                        value={draft.enumCsv}
                        onChange={(v) => {
                          setDraft((d) => ({ ...d, enumCsv: v }));
                          markTouched('enum_values');
                        }}
                        placeholder="e.g. click, submit, view"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Required</label>
                      <select
                        value={draft.requiredChoice}
                        onChange={(e) => {
                          setDraft((d) => ({
                            ...d,
                            requiredChoice: e.target.value as LocalDraft['requiredChoice'],
                          }));
                          markTouched('required');
                        }}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="inherit">Inherit (no override)</option>
                        <option value="true">Required</option>
                        <option value="false">Not required</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Example values (JSON)</label>
                      <textarea
                        value={draft.exampleJson}
                        onChange={(e) => {
                          setDraft((d) => ({ ...d, exampleJson: e.target.value }));
                          markTouched('example_values');
                        }}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
                        placeholder="[] or object"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          workspaceMutationsDisabled || saving || touched.size === 0
                        }
                        onClick={() => void handleSaveEdit()}
                      >
                        {saving ? 'Saving…' : 'Save override'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function InputLike({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
    />
  );
}
