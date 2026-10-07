/**
 * Identity rule editor (T-4-32, D-67 and amendment 1): one sheet in four sections that mirror the
 * Identity rules table. Identifier (what it is), Set by (a trigger event, a standalone identify call,
 * or not defined yet, with the live "Binds" sentence), Carried by (the project events that send it in
 * customer_ids, derived ones pre-ticked) with a live preview of the rule's sentence of the
 * identification flow, and Meta. Saving sends the rule, then one batched
 * `PUT /identity-rules/:id/carried-by` when the checklist changed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { SourceBadge, humanize } from '@/src/components/ui/badges';
import { FieldHint, FieldLabel } from '@/src/components/ui/FieldHint';
import { HistorySection } from '@/src/features/history/HistorySection';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import {
  ENTITY_STATUSES,
  IDENTITY_SDK_CALLS,
  IDENTITY_TRANSFORMATIONS,
  IDENTITY_TYPES,
  IMPLEMENTATION_METHODS,
  PRIORITIES,
} from '@/src/domain/enums';
import {
  bindsSentence,
  buildIdentificationFlow,
  deriveEventIdentifiers,
  describeTrigger,
  effectiveEventIdentifiers,
  hasExplicitIdentifiers,
  identifiersAreDerived,
  type IdentifierEventLike,
  type IdentifierSourceLike,
  type IdentityRuleLike,
} from '@/src/domain/identity/identifiers';
import { diffCarriedBy } from '@/src/domain/identity/carriedBy';
import { resolveEventSourceId, resolveSaveTarget } from './ruleSave';

export type IdentityEditorSection = 'identifier' | 'set_by' | 'carried_by' | 'meta';

export interface EditorEvent {
  id: string;
  name: string;
  implementation_method?: string;
  identifiers_json?: string[] | null;
  sources?: { id: string; name: string; system: string; method: string | null; color: string | null }[];
}

export interface EditorSource {
  id: string;
  name: string;
  system?: string | null;
  method?: string | null;
  color?: string | null;
}

export interface EditorRule extends IdentityRuleLike {
  name?: string;
}

type SetByMode = 'event' | 'standalone' | 'none';

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

const SELECT = 'w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <FieldLabel className="text-sm font-medium text-gray-700" hint={hint} hintScope="Identity">
      {children}
    </FieldLabel>
  );
}

/** A radio or checkbox option label with a hint keyed by `hint` (Identity scope). */
function Option({ hint, className = 'flex items-center gap-2 text-sm text-gray-700', children }: { hint: string; className?: string; children: React.ReactNode }) {
  return (
    <FieldLabel className={className} hint={hint} hintScope="Identity">
      {children}
    </FieldLabel>
  );
}

function SectionBox({
  id,
  title,
  intro,
  focused,
  children,
  sectionRef,
}: {
  id: string;
  title: string;
  intro?: string;
  focused?: boolean;
  children: React.ReactNode;
  sectionRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      id={`identity-editor-${id}`}
      ref={sectionRef}
      tabIndex={-1}
      data-testid={`identity-editor-${id}`}
      className={`rounded-md border p-4 space-y-3 outline-none ${focused ? 'border-[var(--color-info)]' : 'border-gray-200'}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          <FieldHint label={title} scope="Identity" />
        </h3>
        {intro && <p className="text-xs text-gray-500 mt-0.5">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function IdentityRuleEditor({
  ruleId,
  projectId,
  events,
  sources,
  rules,
  focusSection,
  onSaved,
  onRefresh,
  onClose,
}: {
  ruleId: string | null;
  projectId: string;
  events: EditorEvent[];
  sources: EditorSource[];
  /** Every rule of the project, for the live flow preview. */
  rules: EditorRule[];
  focusSection?: IdentityEditorSection | null;
  onSaved: () => Promise<void>;
  /** Refreshes the list without closing the sheet (a partly failed save of a new rule). */
  onRefresh?: (createdId?: string) => Promise<void>;
  onClose: () => void;
}) {
  /** Set after the first successful POST of a new rule: later saves PATCH it, never POST again. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const effectiveRuleId = ruleId ?? createdId;
  const isCreating = effectiveRuleId === null;
  const [loading, setLoading] = useState(!isCreating);
  const [rule, setRule] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [identifierName, setIdentifierName] = useState('');
  const [identityType, setIdentityType] = useState<string>(IDENTITY_TYPES[0]);
  const [transformations, setTransformations] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [example, setExample] = useState('');
  const [valueRule, setValueRule] = useState('');
  const [mode, setMode] = useState<SetByMode>('none');
  const [triggerEventId, setTriggerEventId] = useState('');
  const [sdkCall, setSdkCall] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [owner, setOwner] = useState('');
  const [tracker, setTracker] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  /** event id -> ticked by the user (absent = whatever the draft currently derives or stores). */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!projectId || !ruleId) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/identity-rules/${ruleId}`);
      const data = await parseJson(res);
      if (res.ok) {
        setRule({ id: data.id, name: data.name });
        setName(data.name ?? '');
        setIdentifierName(data.identifier_name ?? '');
        setIdentityType(data.identity_type ?? IDENTITY_TYPES[0]);
        setTransformations(Array.isArray(data.transformations_json) ? data.transformations_json : []);
        setDescription(data.description ?? '');
        setExample(data.example ?? '');
        setValueRule(data.value_rule ?? '');
        setTriggerEventId(data.trigger_event_id ?? '');
        setSdkCall(data.sdk_call ?? '');
        setTriggerText(data.trigger_text ?? '');
        setSourceId(data.source_id ?? '');
        setOwner(data.owner ?? '');
        setTracker(data.tracker ?? '');
        setPriority(data.priority ?? '');
        setStatus(data.status ?? '');
        setMode(data.trigger_event_id ? 'event' : data.sdk_call || data.trigger_text ? 'standalone' : 'none');
      } else {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to load identity rule.');
      }
      setLoading(false);
    })();
  }, [projectId, ruleId]);

  useEffect(() => {
    if (!focusSection || loading) return;
    const el = sectionRefs.current[focusSection];
    el?.focus?.({ preventScroll: true });
    el?.scrollIntoView?.({ block: 'start' });
  }, [focusSection, loading]);

  const trimmedName = name.trim();
  const trimmedField = identifierName.trim();
  const triggerEvent = events.find((e) => e.id === triggerEventId);
  // Source in event mode: keep a hand-set source that is one of the event's sources, else its first
  // source; an event with no source never clears a source that was already set.
  const eventSourceId = resolveEventSourceId(triggerEvent?.sources, sourceId);
  const eventSource = sources.find((s) => s.id === eventSourceId) ?? null;

  /** What this rule would be once saved (mode decides which Set by fields count). */
  const draftRule: EditorRule = useMemo(
    () => ({
      id: effectiveRuleId ?? 'draft',
      name: trimmedName,
      identifier_name: trimmedField || 'this identifier',
      identity_type: identityType,
      sdk_call: mode === 'none' ? null : sdkCall || null,
      trigger_event_id: mode === 'event' ? triggerEventId || null : null,
      trigger_text: mode === 'standalone' ? triggerText.trim() || null : null,
      source_id: mode === 'event' ? eventSourceId : mode === 'standalone' ? sourceId || null : null,
    }),
    [effectiveRuleId, trimmedName, trimmedField, identityType, mode, sdkCall, triggerEventId, triggerText, sourceId, eventSourceId]
  );

  const draftRules: EditorRule[] = useMemo(
    () => (isCreating ? [...rules, draftRule] : rules.map((r) => (r.id === effectiveRuleId ? { ...r, ...draftRule } : r))),
    [rules, draftRule, isCreating, effectiveRuleId]
  );
  const idSources: IdentifierSourceLike[] = sources;
  const idEvents: IdentifierEventLike[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        name: e.name,
        implementation_method: e.implementation_method ?? 'client_web',
        identifiers_json: e.identifiers_json ?? null,
        source_ids: (e.sources ?? []).map((s) => s.id),
      })),
    [events]
  );

  const carriesDraft = (e: IdentifierEventLike) => effectiveEventIdentifiers(e, draftRules, idSources).includes(draftRule.identifier_name);
  const isTicked = (e: IdentifierEventLike) => overrides[e.id] ?? carriesDraft(e);
  const selectedIds = useMemo(
    () => new Set(idEvents.filter((e) => overrides[e.id] ?? effectiveEventIdentifiers(e, draftRules, idSources).includes(draftRule.identifier_name)).map((e) => e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idEvents, overrides, draftRules, idSources, draftRule.identifier_name]
  );

  /** Live flow of the draft: events carry what the checklist says. */
  const flow = useMemo(() => {
    const changes = new Map(diffCarriedBy(draftRule.identifier_name, selectedIds, idEvents, draftRules, idSources).map((c) => [c.event_id, c.identifiers]));
    const applied = idEvents.map((e) => (changes.has(e.id) ? { ...e, identifiers_json: changes.get(e.id) ?? null } : e));
    return buildIdentificationFlow(draftRules, applied, idSources);
  }, [draftRule.identifier_name, selectedIds, idEvents, draftRules, idSources]);
  const flowRule = flow.rules.find((r) => r.rule_id === draftRule.id);

  const grouped = IMPLEMENTATION_METHODS.map((m) => ({
    method: m,
    items: idEvents.filter((e) => e.implementation_method === m).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);

  const toggleTransformation = (t: string) =>
    setTransformations((prev) => (prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]));

  const handleSave = async () => {
    if (!trimmedName || !trimmedField || !projectId) return;
    if (mode === 'event' && !triggerEventId) {
      setSaveError('Choose the event that sets this identifier, or pick another option.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        identifier_name: trimmedField,
        identity_type: identityType,
        transformations_json: transformations,
        description: description.trim() || null,
        example: example.trim() || null,
        value_rule: valueRule.trim() || null,
        sdk_call: draftRule.sdk_call,
        trigger_event_id: draftRule.trigger_event_id,
        trigger_text: draftRule.trigger_text,
        source_id: mode === 'none' ? sourceId || null : mode === 'event' ? eventSourceId : draftRule.source_id,
        owner: owner.trim() || null,
        tracker: tracker.trim() || null,
        priority: priority || null,
        status: status || null,
      };
      const target = resolveSaveTarget(`${API_BASE}/api/projects/${projectId}/identity-rules`, effectiveRuleId);
      const res = await fetchWithAuth(target.url, { method: target.method, body: JSON.stringify(body) });
      const data = await parseJson(res);
      if (!res.ok) {
        if (data?.code === 'IDENTIFIER_EXISTS') {
          setIdentifierError(typeof data?.error === 'string' ? data.error : 'An identity rule with this identifier name already exists.');
          return;
        }
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      const savedId = effectiveRuleId ?? data.id;
      if (isCreating) setCreatedId(data.id);
      if (Object.keys(overrides).length > 0 || isCreating) {
        const carried = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/identity-rules/${savedId}/carried-by`, {
          method: 'PUT',
          body: JSON.stringify({ event_ids: [...selectedIds] }),
        });
        if (!carried.ok) {
          const cd = await parseJson(carried);
          setSaveError(typeof cd?.error === 'string' ? `Rule saved, but the events were not updated: ${cd.error}` : 'Rule saved, but the events were not updated.');
          // The rule exists now: refresh the list, keep the sheet open on it (the next Save PATCHes).
          await (onRefresh ?? (async () => {}))(savedId);
          return;
        }
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!rule || !projectId) return;
    if (!window.confirm(`Delete identity rule "${rule.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/identity-rules/${rule.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) await onSaved();
      else {
        const data = await parseJson(res);
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  const triggerPreview = mode === 'standalone' && triggerText.trim() ? describeTrigger(triggerText) : null;
  const ref = (key: string) => (el: HTMLElement | null) => {
    sectionRefs.current[key] = el;
  };

  return (
    <div className="space-y-5">
      <SectionBox id="identifier" title="Identifier" intro="What this identifier is." focused={focusSection === 'identifier'} sectionRef={ref('identifier')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            {!trimmedName && <p className="text-xs text-red-600">Name is required.</p>}
          </div>
          <div className="space-y-2">
            <Label>Identifier name</Label>
            <Input value={identifierName} onChange={(e) => { setIdentifierName(e.target.value); setIdentifierError(null); }} placeholder="e.g. registered, cookie, email_id" />
            {identifierError && <p className="text-xs text-red-600" role="alert" data-testid="identifier-exists-error">{identifierError}</p>}
            {!trimmedField && <p className="text-xs text-red-600">Identifier name is required.</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Identity type</Label>
          <div className="flex gap-4">
            {IDENTITY_TYPES.map((t) => (
              <Option key={t} hint={t}>
                <input type="radio" name="identity-type" checked={identityType === t} onChange={() => setIdentityType(t)} />
                {t}
              </Option>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Transformations</Label>
          <div className="flex gap-4">
            {IDENTITY_TRANSFORMATIONS.map((t) => (
              <Option key={t} hint={t}>
                <input type="checkbox" checked={transformations.includes(t)} onChange={() => toggleTransformation(t)} />
                {t}
              </Option>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Example</Label>
            <Input value={example} onChange={(e) => setExample(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Value rule</Label>
            <Input value={valueRule} onChange={(e) => setValueRule(e.target.value)} />
          </div>
        </div>
      </SectionBox>

      <SectionBox id="set_by" title="Set by" intro="When and how this identifier is learned." focused={focusSection === 'set_by'} sectionRef={ref('set_by')}>
        <div className="space-y-2" role="radiogroup" aria-label="Set by">
          {([
            ['event', 'When an event is sent'],
            ['standalone', 'By a standalone identify call'],
            ['none', 'Not defined yet'],
          ] as [SetByMode, string][]).map(([value, label]) => (
            <Option key={value} hint={label} className="flex items-center gap-2 text-sm text-gray-800">
              <input type="radio" name="set-by-mode" checked={mode === value} onChange={() => setMode(value)} />
              {label}
            </Option>
          ))}
        </div>
        {mode === 'event' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Trigger event</Label>
              <select value={triggerEventId} onChange={(e) => setTriggerEventId(e.target.value)} className={SELECT}>
                <option value="">Choose an event…</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <div className="min-h-10 flex items-center" data-testid="identity-editor-event-source">
                {eventSource ? (
                  <SourceBadge system={eventSource.system} method={eventSource.method} color={eventSource.color} label={eventSource.name} />
                ) : (
                  <span className="text-xs text-gray-500">Taken from the event; it has no source yet.</span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>SDK call</Label>
              <select value={sdkCall} onChange={(e) => setSdkCall(e.target.value)} className={SELECT}>
                <option value="">—</option>
                {IDENTITY_SDK_CALLS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}
        {mode === 'standalone' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SDK call</Label>
                <select value={sdkCall} onChange={(e) => setSdkCall(e.target.value)} className={SELECT}>
                  <option value="">—</option>
                  {IDENTITY_SDK_CALLS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={SELECT}>
                  <option value="">—</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Trigger text</Label>
              <Input value={triggerText} onChange={(e) => setTriggerText(e.target.value)} placeholder="e.g. the checkout page loads" />
              {triggerPreview && (
                <p className="text-xs text-gray-500" data-testid="identity-editor-trigger-preview">
                  Reads as: called {triggerPreview.preposition} {triggerPreview.text}.
                </p>
              )}
            </div>
          </div>
        )}
        {mode === 'none' && (
          <div className="text-xs text-gray-500 space-y-1">
            <p>Saving clears the trigger event, the trigger text and the SDK call.</p>
            {sdkCall === 'identify' && (
              <p className="text-amber-700" role="alert" data-testid="identity-editor-none-warning">
                This rule currently has the identify call. Without it, {trimmedField || 'this identifier'} drops out of the identifiers that web and SDK events carry by default.
              </p>
            )}
          </div>
        )}
        <p className="text-sm text-gray-700" data-testid="identity-editor-binds">
          <span className="font-medium"><FieldHint label="Binds" scope="Identity" />: </span>
          {flowRule ? bindsSentence(flowRule) : ''}
        </p>
      </SectionBox>

      <SectionBox id="carried_by" title="Carried by" intro="Events that send this identifier in customer_ids. Ticked by default when the implementation method and source say so." focused={focusSection === 'carried_by'} sectionRef={ref('carried_by')}>
        {grouped.length === 0 && <p className="text-sm text-gray-500">No events in this project yet.</p>}
        {grouped.map((g) => (
          <div key={g.method}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              <FieldHint label="Carried by" scope="Identity">{humanize(g.method)}</FieldHint>
            </h4>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {g.items.map((e) => {
                const explicit = hasExplicitIdentifiers(e);
                const derived = identifiersAreDerived(e, draftRules) && deriveEventIdentifiers(e, draftRules, idSources).includes(draftRule.identifier_name);
                return (
                  <li key={e.id}>
                    <Option hint="Carried by" className="flex items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={isTicked(e)} onChange={(ev) => setOverrides((prev) => ({ ...prev, [e.id]: ev.target.checked }))} />
                      <span>{e.name}</span>
                      {derived && <span className="text-xs text-gray-400">derived</span>}
                      {explicit && (e.identifiers_json ?? []).length === 0 && <span className="text-xs text-gray-400">none, set by hand</span>}
                      {explicit && (e.identifiers_json ?? []).length > 0 && <span className="text-xs text-gray-400">set by hand</span>}
                    </Option>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3" data-testid="identity-editor-preview">
          <h4 className="text-xs font-semibold text-gray-700 mb-1"><FieldHint label="Preview" scope="Identity" /></h4>
          <p className="text-sm text-gray-700">{flowRule?.sentence || 'Fill in the identifier to see its sentence.'}</p>
        </div>
      </SectionBox>

      <SectionBox id="meta" title="Meta" focused={focusSection === 'meta'} sectionRef={ref('meta')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tracker</Label>
            <Input value={tracker} onChange={(e) => setTracker(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={SELECT}>
              <option value="">—</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
              <option value="">—</option>
              {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </SectionBox>

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{saveError}</div>}

      {!isCreating && rule && <HistorySection projectId={projectId} entityType="identity_rule" entityId={rule.id} />}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && rule ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || !trimmedName || !trimmedField}>{saving ? 'Saving…' : 'Save Identity Rule'}</Button>
        </div>
      </div>
    </div>
  );
}
