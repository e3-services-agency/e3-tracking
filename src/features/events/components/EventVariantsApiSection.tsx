/**
 * Event variants v1 — persisted under base event; effective schema via shared resolver.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Modal } from '@/src/components/ui/Modal';
import type {
  EffectiveEventPropertyDefinition,
  EventPropertyPresence,
  EventVariantOverridesV1,
  EventVariantRow,
} from '@/src/types/schema';
import { resolveEffectiveEventSchema } from '@/src/lib/effectiveEventSchema';
import type { ApiError } from '@/src/features/events/hooks/useEvents';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

type OverrideChoice =
  | 'inherit'
  | 'always_sent'
  | 'sometimes_sent'
  | 'never_sent'
  | 'exclude';

type RequiredChoice = 'inherit' | 'true' | 'false';

type VariantPropertyDraft = {
  presenceChoice: OverrideChoice;
  requiredChoice: RequiredChoice;
  description: string;
  exampleJson: string;
};

const PRESENCE_OPTIONS: { value: OverrideChoice; label: string }[] = [
  { value: 'inherit', label: 'Inherit from base' },
  { value: 'always_sent', label: 'Always' },
  { value: 'sometimes_sent', label: 'Sometimes' },
  { value: 'never_sent', label: 'Never' },
  { value: 'exclude', label: 'Exclude (not in trigger schema)' },
];

const REQUIRED_OPTIONS: { value: RequiredChoice; label: string }[] = [
  { value: 'inherit', label: 'Inherit from base' },
  { value: 'true', label: 'Required' },
  { value: 'false', label: 'Not required' },
];

function defaultDraft(): VariantPropertyDraft {
  return {
    presenceChoice: 'inherit',
    requiredChoice: 'inherit',
    description: '',
    exampleJson: '',
  };
}

function choiceFromOverride(
  pid: string,
  overrides: EventVariantOverridesV1 | undefined
): OverrideChoice {
  const p = overrides?.properties?.[pid];
  if (!p) return 'inherit';
  if (p.excluded) return 'exclude';
  if (p.presence) return p.presence;
  if (p.required === true) return 'always_sent';
  if (p.required === false) return 'sometimes_sent';
  return 'inherit';
}

function requiredChoiceFromOverride(
  ov: NonNullable<NonNullable<EventVariantOverridesV1['properties']>[string]> | undefined
): RequiredChoice {
  if (!ov || ov.excluded) return 'inherit';
  if (ov.required === true) return 'true';
  if (ov.required === false) return 'false';
  return 'inherit';
}

function draftFromVariantProperty(
  pid: string,
  overrides: EventVariantOverridesV1 | undefined
): VariantPropertyDraft {
  const ov = overrides?.properties?.[pid];
  if (!ov) return defaultDraft();
  let exampleJson = '';
  if (ov.example_values !== undefined && ov.example_values !== null) {
    try {
      exampleJson = JSON.stringify(ov.example_values, null, 2);
    } catch {
      exampleJson = '';
    }
  }
  return {
    presenceChoice: choiceFromOverride(pid, overrides),
    requiredChoice: requiredChoiceFromOverride(ov),
    description:
      ov.description !== undefined && ov.description !== null ? String(ov.description) : '',
    exampleJson,
  };
}

/**
 * @param strictExamples - if true, throws Error when example JSON is non-empty but invalid
 */
function buildOverridesJson(
  base: EffectiveEventPropertyDefinition[],
  drafts: Map<string, VariantPropertyDraft>,
  strictExamples: boolean
): EventVariantOverridesV1 {
  const properties: NonNullable<EventVariantOverridesV1['properties']> = {};
  for (const def of base) {
    const pid = def.property_id;
    const d = drafts.get(pid) ?? defaultDraft();
    const ch = d.presenceChoice;

    if (ch === 'exclude') {
      properties[pid] = { excluded: true };
      continue;
    }

    const entry: NonNullable<EventVariantOverridesV1['properties']>[string] = {};
    let hasAny = false;

    if (ch !== 'inherit') {
      entry.presence = ch as EventPropertyPresence;
      hasAny = true;
    }

    if (d.requiredChoice === 'true') {
      entry.required = true;
      hasAny = true;
    } else if (d.requiredChoice === 'false') {
      entry.required = false;
      hasAny = true;
    }

    const desc = d.description.trim();
    if (desc.length > 0) {
      entry.description = desc;
      hasAny = true;
    }

    const exRaw = d.exampleJson.trim();
    if (exRaw.length > 0) {
      try {
        entry.example_values = JSON.parse(exRaw) as unknown;
        hasAny = true;
      } catch {
        if (strictExamples) {
          throw new Error(`Invalid JSON in example values for "${def.property.name}".`);
        }
      }
    }

    if (hasAny) {
      properties[pid] = entry;
    }
  }
  return Object.keys(properties).length > 0 ? { properties } : {};
}

function rowLabelFromDraft(d: VariantPropertyDraft): 'inherited' | 'overridden' | 'excluded' {
  if (d.presenceChoice === 'exclude') return 'excluded';
  if (
    d.presenceChoice === 'inherit' &&
    d.requiredChoice === 'inherit' &&
    !d.description.trim() &&
    !d.exampleJson.trim()
  ) {
    return 'inherited';
  }
  return 'overridden';
}

function effectiveColumnBadges(d: VariantPropertyDraft): string[] {
  const badges: string[] = [];
  if (d.presenceChoice !== 'inherit' && d.presenceChoice !== 'exclude') badges.push('Presence');
  if (d.presenceChoice === 'exclude') return ['Excluded'];
  if (d.requiredChoice !== 'inherit') badges.push('Required');
  if (d.description.trim()) badges.push('Description');
  if (d.exampleJson.trim()) badges.push('Examples');
  return badges;
}

type EventVariantsApiSectionProps = {
  eventId: string;
  baseEventName: string;
  variants: EventVariantRow[];
  onReload: () => void | Promise<void>;
  getEffectivePropertyDefinitions: (
    eventId: string,
    options?: { variantId?: string | null }
  ) => Promise<
    | { success: true; items: EffectiveEventPropertyDefinition[] }
    | { success: false; error: ApiError }
  >;
  createEventVariant: (
    eventId: string,
    payload: { name: string; description?: string | null; overrides_json?: EventVariantOverridesV1 }
  ) => Promise<{ success: true; data: EventVariantRow } | { success: false; error: ApiError }>;
  updateEventVariant: (
    eventId: string,
    variantId: string,
    patch: { name?: string; description?: string | null; overrides_json?: EventVariantOverridesV1 }
  ) => Promise<{ success: true; data: EventVariantRow } | { success: false; error: ApiError }>;
  deleteEventVariant: (
    eventId: string,
    variantId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  workspaceMutationsDisabled?: boolean;
  /** Open the edit modal for this variant once after variants are loaded (e.g. list row or chip). */
  variantIdToOpenOnLoad?: string | null;
  onConsumedVariantOpen?: () => void;
};

export function EventVariantsApiSection({
  eventId,
  baseEventName,
  variants,
  onReload,
  getEffectivePropertyDefinitions,
  createEventVariant,
  updateEventVariant,
  deleteEventVariant,
  workspaceMutationsDisabled,
  variantIdToOpenOnLoad = null,
  onConsumedVariantOpen,
}: EventVariantsApiSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<EventVariantRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [baseEffective, setBaseEffective] = useState<EffectiveEventPropertyDefinition[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<Map<string, VariantPropertyDraft>>(new Map());
  const [expandedPropertyIds, setExpandedPropertyIds] = useState<Set<string>>(new Set());
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const draftOverrides = useMemo(
    () => buildOverridesJson(baseEffective, variantDrafts, false),
    [baseEffective, variantDrafts]
  );

  const mergedPreview = useMemo(() => {
    if (!editing) return [];
    return resolveEffectiveEventSchema(baseEffective, { overrides_json: draftOverrides });
  }, [baseEffective, draftOverrides, editing]);

  const openEdit = useCallback(
    async (v: EventVariantRow) => {
      setEditing(v);
      setEditName(v.name);
      setEditDesc(v.description ?? '');
      setFormError(null);
      setExpandedPropertyIds(new Set());
      setLoadingEdit(true);
      const r = await getEffectivePropertyDefinitions(eventId);
      setLoadingEdit(false);
      if (!r.success) {
        setBaseEffective([]);
        setVariantDrafts(new Map());
        return;
      }
      setBaseEffective(r.items);
      const m = new Map<string, VariantPropertyDraft>();
      for (const def of r.items) {
        m.set(def.property_id, draftFromVariantProperty(def.property_id, v.overrides_json));
      }
      setVariantDrafts(m);
    },
    [eventId, getEffectivePropertyDefinitions]
  );

  const consumedOpenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!variantIdToOpenOnLoad) {
      consumedOpenIdRef.current = null;
      return;
    }
    if (consumedOpenIdRef.current === variantIdToOpenOnLoad) return;
    const v = variants.find((x) => x.id === variantIdToOpenOnLoad);
    if (!v) {
      consumedOpenIdRef.current = variantIdToOpenOnLoad;
      onConsumedVariantOpen?.();
      return;
    }
    consumedOpenIdRef.current = variantIdToOpenOnLoad;
    void openEdit(v).finally(() => {
      onConsumedVariantOpen?.();
    });
  }, [variantIdToOpenOnLoad, variants, openEdit, onConsumedVariantOpen]);

  const toggleExpandProperty = (propertyId: string) => {
    setExpandedPropertyIds((prev) => {
      const n = new Set(prev);
      if (n.has(propertyId)) n.delete(propertyId);
      else n.add(propertyId);
      return n;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await createEventVariant(eventId, {
      name: newName.trim(),
      description: newDesc.trim() || null,
      overrides_json: {},
    });
    setCreating(false);
    if (res.success) {
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      await onReload();
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setFormError(null);
    let overrides_json: EventVariantOverridesV1;
    try {
      overrides_json = buildOverridesJson(baseEffective, variantDrafts, true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Example values must be valid JSON.');
      return;
    }
    setSaving(true);
    const res = await updateEventVariant(eventId, editing.id, {
      name: editName.trim(),
      description: editDesc.trim() || null,
      overrides_json,
    });
    setSaving(false);
    if (res.success) {
      setEditing(null);
      await onReload();
    }
  };

  const handleDelete = async (v: EventVariantRow) => {
    if (
      !window.confirm(
        `Delete variant "${v.name}"? Journeys that reference this variant must be updated first if deletion is blocked.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await deleteEventVariant(eventId, v.id);
    setDeleting(false);
    if (res.success) {
      if (editing?.id === v.id) setEditing(null);
      await onReload();
    }
  };

  const updateDraft = (propertyId: string, patch: Partial<VariantPropertyDraft>) => {
    setVariantDrafts((prev) => {
      const n = new Map(prev);
      const cur = n.get(propertyId) ?? defaultDraft();
      n.set(propertyId, { ...cur, ...patch });
      return n;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Variants</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={workspaceMutationsDisabled}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4" />
          New Variant
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Scenario-specific property requirements for implementation. Tracked event name stays{' '}
        <span className="font-mono text-gray-700">{baseEventName}</span>.
      </p>

      {variants.length === 0 ? (
        <p className="text-xs text-gray-500 border rounded-md p-3 bg-gray-50">No variants yet.</p>
      ) : (
        <ul className="border rounded-lg divide-y divide-gray-100">
          {variants.map((v) => (
            <li key={v.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{v.name}</div>
                {v.description ? (
                  <div className="text-xs text-gray-500 line-clamp-1">{v.description}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" size="sm" variant="ghost" onClick={() => void openEdit(v)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  disabled={deleting || workspaceMutationsDisabled}
                  onClick={() => void handleDelete(v)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create variant"
        className="z-[70] max-w-md"
      >
        <div className="space-y-3 p-1">
          <div>
            <label className="text-sm font-medium text-gray-700">Name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. footer, popup"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreate()} disabled={!newName.trim() || creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={() => {
          setEditing(null);
          setFormError(null);
        }}
        title={editing ? `Edit variant — ${baseEventName}` : 'Edit variant'}
        className="z-[70] max-w-[min(720px,calc(100vw-1.5rem))] max-h-[min(90vh,720px)] flex flex-col"
        bodyClassName="p-4 min-h-0 flex-1 overflow-y-auto"
      >
        {editing && (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span className="font-semibold text-gray-800">Base event:</span>{' '}
              <span className="font-mono">{baseEventName}</span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Variant name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {formError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {formError}
              </div>
            ) : null}

            {loadingEdit ? (
              <p className="text-sm text-gray-500">Loading properties…</p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Property overrides
                </div>
                <p className="text-[11px] text-gray-500">
                  Effective schema uses <code className="font-mono text-gray-700">resolveEffectiveEventSchema</code>{' '}
                  (base + overrides). Expand a row for description, required, and example values.
                </p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left p-2 font-medium">Property</th>
                        <th className="text-left p-2 font-medium">Base presence</th>
                        <th className="text-left p-2 font-medium">Variant</th>
                        <th className="text-left p-2 font-medium">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baseEffective.map((def) => {
                        const draft = variantDrafts.get(def.property_id) ?? defaultDraft();
                        const merged = mergedPreview.find((m) => m.property_id === def.property_id);
                        const eff = rowLabelFromDraft(draft);
                        const expanded = expandedPropertyIds.has(def.property_id);
                        const badges = effectiveColumnBadges(draft);
                        return (
                          <React.Fragment key={def.property_id}>
                            <tr className="border-t border-gray-100">
                              <td className="p-2">
                                <div className="flex items-start gap-1">
                                  <button
                                    type="button"
                                    className="mt-0.5 shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100"
                                    aria-expanded={expanded}
                                    aria-label={expanded ? 'Collapse details' : 'Expand details'}
                                    onClick={() => toggleExpandProperty(def.property_id)}
                                  >
                                    {expanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                  <span className="font-mono text-gray-900 break-all">{def.property.name}</span>
                                </div>
                              </td>
                              <td className="p-2 text-gray-600">{def.presence ?? '—'}</td>
                              <td className="p-2">
                                <select
                                  className="w-full max-w-[11rem] rounded border border-input bg-background px-1 py-1"
                                  value={draft.presenceChoice}
                                  onChange={(e) => {
                                    const next = e.target.value as OverrideChoice;
                                    updateDraft(def.property_id, { presenceChoice: next });
                                  }}
                                >
                                  {PRESENCE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2 align-top">
                                <div
                                  className={
                                    eff === 'inherited'
                                      ? 'text-gray-500'
                                      : eff === 'excluded'
                                        ? 'text-amber-800 font-medium'
                                        : 'text-purple-800 font-medium'
                                  }
                                >
                                  {eff === 'inherited'
                                    ? 'Inherited'
                                    : eff === 'excluded'
                                      ? 'Excluded'
                                      : 'Overridden'}
                                  {merged ? ` · ${merged.presence ?? '—'}` : ''}
                                </div>
                                {badges.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {badges.map((b) => (
                                      <span
                                        key={b}
                                        className="inline-flex rounded bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-700"
                                      >
                                        {b}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="border-t border-gray-100 bg-gray-50/80">
                                <td colSpan={4} className="p-3">
                                  {draft.presenceChoice === 'exclude' ? (
                                    <p className="text-[11px] text-gray-500">
                                      Semantic overrides are disabled while the property is excluded.
                                    </p>
                                  ) : (
                                    <div className="space-y-3 max-w-xl">
                                      <div>
                                        <label className="text-[11px] font-medium text-gray-600">
                                          Description override
                                        </label>
                                        <textarea
                                          value={draft.description}
                                          onChange={(e) =>
                                            updateDraft(def.property_id, { description: e.target.value })
                                          }
                                          rows={2}
                                          placeholder="Leave empty to inherit from base event"
                                          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[11px] font-medium text-gray-600">
                                          Required (effective)
                                        </label>
                                        <select
                                          className="mt-1 w-full max-w-xs rounded border border-input bg-background px-2 py-1.5 text-xs"
                                          value={draft.requiredChoice}
                                          onChange={(e) =>
                                            updateDraft(def.property_id, {
                                              requiredChoice: e.target.value as RequiredChoice,
                                            })
                                          }
                                        >
                                          {REQUIRED_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                              {o.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[11px] font-medium text-gray-600">
                                          Example values (JSON)
                                        </label>
                                        <textarea
                                          value={draft.exampleJson}
                                          onChange={(e) =>
                                            updateDraft(def.property_id, { exampleJson: e.target.value })
                                          }
                                          rows={4}
                                          spellCheck={false}
                                          placeholder='e.g. [{"value":"…"}] or null'
                                          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[11px] leading-snug"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveEdit()} disabled={saving || !editName.trim()}>
                {saving ? 'Saving…' : 'Save variant'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
