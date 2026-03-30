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
import { Plus, Trash2 } from 'lucide-react';

type OverrideChoice =
  | 'inherit'
  | 'always_sent'
  | 'sometimes_sent'
  | 'never_sent'
  | 'exclude';

const PRESENCE_OPTIONS: { value: OverrideChoice; label: string }[] = [
  { value: 'inherit', label: 'Inherit from base' },
  { value: 'always_sent', label: 'Always sent' },
  { value: 'sometimes_sent', label: 'Sometimes sent' },
  { value: 'never_sent', label: 'Never sent' },
  { value: 'exclude', label: 'Exclude (not in trigger schema)' },
];

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

function buildOverridesJson(
  base: EffectiveEventPropertyDefinition[],
  choices: Map<string, OverrideChoice>
): EventVariantOverridesV1 {
  const properties: NonNullable<EventVariantOverridesV1['properties']> = {};
  for (const def of base) {
    const pid = def.property_id;
    const ch = choices.get(pid) ?? 'inherit';
    if (ch === 'inherit') continue;
    if (ch === 'exclude') {
      properties[pid] = { excluded: true };
      continue;
    }
    properties[pid] = { presence: ch as EventPropertyPresence };
  }
  return Object.keys(properties).length > 0 ? { properties } : {};
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
  const [choices, setChoices] = useState<Map<string, OverrideChoice>>(new Map());
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const draftOverrides = useMemo(
    () => buildOverridesJson(baseEffective, choices),
    [baseEffective, choices]
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
      setLoadingEdit(true);
      const r = await getEffectivePropertyDefinitions(eventId);
      setLoadingEdit(false);
      if (!r.success) {
        setBaseEffective([]);
        setChoices(new Map());
        return;
      }
      setBaseEffective(r.items);
      const m = new Map<string, OverrideChoice>();
      for (const def of r.items) {
        m.set(def.property_id, choiceFromOverride(def.property_id, v.overrides_json));
      }
      setChoices(m);
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
    setSaving(true);
    const overrides_json = buildOverridesJson(baseEffective, choices);
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

  function rowLabel(def: EffectiveEventPropertyDefinition): 'inherited' | 'overridden' | 'excluded' {
    const ch = choices.get(def.property_id) ?? 'inherit';
    if (ch === 'exclude') return 'excluded';
    if (ch === 'inherit') return 'inherited';
    return 'overridden';
  }

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
        onClose={() => setEditing(null)}
        title={editing ? `Edit variant — ${baseEventName}` : 'Edit variant'}
        className="z-[70] max-w-[min(560px,calc(100vw-1.5rem))] max-h-[min(90vh,720px)] flex flex-col"
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

            {loadingEdit ? (
              <p className="text-sm text-gray-500">Loading properties…</p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Property overrides
                </div>
                <p className="text-[11px] text-gray-500">
                  Effective schema uses <code className="font-mono text-gray-700">resolveEffectiveEventSchema</code>{' '}
                  (base + overrides).
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
                        const ch = choices.get(def.property_id) ?? 'inherit';
                        const merged = mergedPreview.find((m) => m.property_id === def.property_id);
                        const eff = rowLabel(def);
                        return (
                          <tr key={def.property_id} className="border-t border-gray-100">
                            <td className="p-2 font-mono text-gray-900">{def.property.name}</td>
                            <td className="p-2 text-gray-600">{def.presence ?? '—'}</td>
                            <td className="p-2">
                              <select
                                className="w-full rounded border border-input bg-background px-1 py-1"
                                value={ch}
                                onChange={(e) => {
                                  const next = e.target.value as OverrideChoice;
                                  setChoices((prev) => {
                                    const n = new Map(prev);
                                    n.set(def.property_id, next);
                                    return n;
                                  });
                                }}
                              >
                                {PRESENCE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <span
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
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
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
