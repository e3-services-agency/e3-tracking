import { StatusBadge } from '@/src/components/ui/badges';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
/**
 * Identity rules: plain table + form against `/api/projects/:projectId/identity-rules`
 * (plan "Target data model" section IdentityRule; T-1-06). Simplified UI (D-07): a single
 * sheet form with every field, plus move up/down for `sort_order`.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, ENTITY_STATUSES, IDENTITY_TYPES, IDENTITY_TRANSFORMATIONS, IDENTITY_SDK_CALLS } from '@/src/domain/enums';
import { HistorySection } from '@/src/features/history/HistorySection';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { CarriedByCell, SetByCell } from '@/src/features/identity/SetByCell';
import type { IdentifierSetBy } from '@/src/domain/identity/identifiers';

interface IdentityRuleRow {
  id: string;
  identifier_name: string;
  identity_type: string;
  name: string;
  description: string | null;
  trigger_event_id: string | null;
  trigger_text: string | null;
  value_rule: string | null;
  example: string | null;
  owner: string | null;
  source_id: string | null;
  tracker: string | null;
  priority: string | null;
  status: string | null;
  sort_order: number;
  transformations_json: string[];
  sdk_call: string | null;
  /** D-67 (T-4-28): from `GET /identity-rules`. */
  set_by?: IdentifierSetBy;
  binds?: string[];
  carried_by?: { id: string; name: string }[];
}

interface IdentityCodegenSnippets {
  identify: string;
  update: string;
  anonymize: string;
}

interface EventOption {
  id: string;
  name: string;
}

interface SourceOption {
  id: string;
  name: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function IdentityRules() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [rules, setRules] = useState<IdentityRuleRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [codegen, setCodegen] = useState<IdentityCodegenSnippets | null>(null);
  const [flowParagraph, setFlowParagraph] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const [rulesRes, eventsRes, sourcesRes, codegenRes, flowRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/identity-rules`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/sources`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/identity-rules/codegen`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/identity-rules/flow`),
    ]);
    const flowData = await parseJson(flowRes);
    if (flowRes.ok) setFlowParagraph(typeof flowData?.paragraph === 'string' ? flowData.paragraph : '');
    const rulesData = await parseJson(rulesRes);
    if (rulesRes.ok) setRules(Array.isArray(rulesData) ? rulesData : []);
    const eventsData = await parseJson(eventsRes);
    if (eventsRes.ok) setEvents(Array.isArray(eventsData) ? eventsData : []);
    const sourcesData = await parseJson(sourcesRes);
    if (sourcesRes.ok) setSources(Array.isArray(sourcesData) ? sourcesData : []);
    const codegenData = await parseJson(codegenRes);
    if (codegenRes.ok) setCodegen(codegenData);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const eventName = (id: string | null) => events.find((e) => e.id === id)?.name ?? '—';
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? '—';

  const move = async (index: number, direction: -1 | 1) => {
    if (!activeProjectId) return;
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const reordered = [...rules];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    setRules(reordered);
    setReorderError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/identity-rules/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ids: reordered.map((r) => r.id) }),
    });
    if (!res.ok) {
      const data = await parseJson(res);
      setReorderError(typeof data?.error === 'string' ? data.error : 'Failed to reorder.');
      await load();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Identity rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            When hard and soft identities are set, and which events/properties may be sent.
          </p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Identity Rule
        </Button>
      </PageHeader>

      <PageBody>
        <div className="mb-6 bg-white rounded-lg border shadow-sm p-4" data-testid="identification-flow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">Identification flow</h2>
            <CopyMarkdownButton getMarkdown={() => `## Identification flow

${flowParagraph}
`} />
          </div>
          <p className="text-sm text-gray-700">{flowParagraph || 'No identification flow yet.'}</p>
        </div>
        {reorderError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{reorderError}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-6 py-3 font-medium text-gray-500 w-20" hint="Order" hintScope="Identity">Order</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Name" hintScope="Identity">Name</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Identifier name" hintScope="Identity">Identifier name</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Type" hintScope="Identity">Type</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="SDK call" hintScope="Identity">SDK call</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Trigger event" hintScope="Identity">Trigger event</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Set by" hintScope="Identity">Set by</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Carried by" hintScope="Identity">Carried by</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Status" hintScope="Identity">Status</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule, index) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void move(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => void move(index, 1)} disabled={index === rules.length - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900 cursor-pointer" onClick={() => { setSelectedId(rule.id); setIsCreating(false); setIsSheetOpen(true); }}>{rule.name}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.identifier_name}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.identity_type}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.sdk_call ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{eventName(rule.trigger_event_id)}</td>
                  <td className="px-6 py-4 text-gray-500"><SetByCell setBy={rule.set_by} binds={rule.binds} /></td>
                  <td className="px-6 py-4 text-gray-500"><CarriedByCell events={rule.carried_by} /></td>
                  <td className="px-6 py-4 text-gray-500"><StatusBadge status={rule.status} /></td>
                </tr>
              ))}
              {rules.length === 0 && (
                <EmptyState
                  colSpan={9}
                  message="No identity rules yet. Add one to describe how a customer identifier is captured and sent to Bloomreach."
                  actionLabel="Add Identity Rule"
                  onAction={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }}
                />
              )}
            </tbody>
          </table>
        </div>

        {codegen && (
          <div className="mt-8 bg-white rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Identity codegen</h2>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">identify</h3>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{codegen.identify}</pre>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">update</h3>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{codegen.update}</pre>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">anonymize</h3>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{codegen.anonymize}</pre>
            </div>
          </div>
        )}
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Identity Rule' : 'Edit Identity Rule'}>
        <IdentityRuleEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          ruleId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          events={events}
          sources={sources}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function IdentityRuleEditor({
  ruleId,
  projectId,
  events,
  sources,
  onSaved,
  onClose,
}: {
  ruleId: string | null;
  projectId: string;
  events: EventOption[];
  sources: SourceOption[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const isCreating = ruleId === null;
  const [loading, setLoading] = useState(!isCreating);
  const [rule, setRule] = useState<IdentityRuleRow | null>(null);
  const [name, setName] = useState('');
  const [identifierName, setIdentifierName] = useState('');
  const [identityType, setIdentityType] = useState<string>(IDENTITY_TYPES[0]);
  const [transformations, setTransformations] = useState<string[]>([]);
  const [sdkCall, setSdkCall] = useState<string>('');
  const [description, setDescription] = useState('');
  const [triggerEventId, setTriggerEventId] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const [valueRule, setValueRule] = useState('');
  const [example, setExample] = useState('');
  const [owner, setOwner] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [tracker, setTracker] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !ruleId) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/identity-rules/${ruleId}`);
      const data = await parseJson(res);
      if (res.ok) {
        setRule(data);
        setName(data.name ?? '');
        setIdentifierName(data.identifier_name ?? '');
        setIdentityType(data.identity_type ?? IDENTITY_TYPES[0]);
        setTransformations(Array.isArray(data.transformations_json) ? data.transformations_json : []);
        setSdkCall(data.sdk_call ?? '');
        setDescription(data.description ?? '');
        setTriggerEventId(data.trigger_event_id ?? '');
        setTriggerText(data.trigger_text ?? '');
        setValueRule(data.value_rule ?? '');
        setExample(data.example ?? '');
        setOwner(data.owner ?? '');
        setSourceId(data.source_id ?? '');
        setTracker(data.tracker ?? '');
        setPriority(data.priority ?? '');
        setStatus(data.status ?? '');
      } else {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to load identity rule.');
      }
      setLoading(false);
    })();
  }, [projectId, ruleId]);

  const trimmedName = name.trim();
  const trimmedField = identifierName.trim();

  const toggleTransformation = (t: string) => {
    setTransformations((prev) => (prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]));
  };

  const handleSave = async () => {
    if (!trimmedName || !trimmedField || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        identifier_name: trimmedField,
        identity_type: identityType,
        transformations_json: transformations,
        sdk_call: sdkCall || null,
        description: description.trim() || null,
        trigger_event_id: triggerEventId || null,
        trigger_text: triggerText.trim() || null,
        value_rule: valueRule.trim() || null,
        example: example.trim() || null,
        owner: owner.trim() || null,
        source_id: sourceId || null,
        tracker: tracker.trim() || null,
        priority: priority || null,
        status: status || null,
      };
      const url = isCreating
        ? `${API_BASE}/api/projects/${projectId}/identity-rules`
        : `${API_BASE}/api/projects/${projectId}/identity-rules/${ruleId}`;
      const res = await fetchWithAuth(url, { method: isCreating ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
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
      if (res.ok || res.status === 204) {
        await onSaved();
      } else {
        const data = await parseJson(res);
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Name" hintScope="Identity">Name</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          {!trimmedName && <p className="text-xs text-red-600">Name is required.</p>}
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Identifier name" hintScope="Identity">Identifier name</FieldLabel>
          <Input value={identifierName} onChange={(e) => setIdentifierName(e.target.value)} placeholder="e.g. registered, cookie, email_id" />
          {!trimmedField && <p className="text-xs text-red-600">Identifier name is required.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Identity type" hintScope="Identity">Identity type</FieldLabel>
          <EnumSelect kind="identity_type" values={IDENTITY_TYPES} value={identityType} onChange={(e) => setIdentityType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="SDK call" hintScope="Identity">SDK call</FieldLabel>
          <EnumSelect kind="sdk_call" values={IDENTITY_SDK_CALLS} emptyLabel="—" value={sdkCall} onChange={(e) => setSdkCall(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Transformations" hintScope="Identity">Transformations</FieldLabel>
        <div className="flex gap-4">
          {IDENTITY_TRANSFORMATIONS.map((t) => (
            <FieldLabel key={t} className="flex items-center gap-2 text-sm text-gray-700" hintScope="Identity">
              <input type="checkbox" checked={transformations.includes(t)} onChange={() => toggleTransformation(t)} />
              {t}
            </FieldLabel>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Description" hintScope="Identity">Description</FieldLabel>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Trigger event" hintScope="Identity">Trigger event</FieldLabel>
          <select value={triggerEventId} onChange={(e) => setTriggerEventId(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Trigger text" hintScope="Identity">Trigger text</FieldLabel>
          <Input value={triggerText} onChange={(e) => setTriggerText(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Value rule" hintScope="Identity">Value rule</FieldLabel>
        <Input value={valueRule} onChange={(e) => setValueRule(e.target.value)} />
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Example" hintScope="Identity">Example</FieldLabel>
        <Input value={example} onChange={(e) => setExample(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Owner" hintScope="Identity">Owner</FieldLabel>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Source" hintScope="Identity">Source</FieldLabel>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Tracker" hintScope="Identity">Tracker</FieldLabel>
        <Input value={tracker} onChange={(e) => setTracker(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Priority" hintScope="Identity">Priority</FieldLabel>
          <EnumSelect kind="priority" values={PRIORITIES} emptyLabel="—" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Status" hintScope="Identity">Status</FieldLabel>
          <EnumSelect kind="status" values={ENTITY_STATUSES} emptyLabel="—" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && rule && (
        <HistorySection projectId={projectId} entityType="identity_rule" entityId={rule.id} />
      )}

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
