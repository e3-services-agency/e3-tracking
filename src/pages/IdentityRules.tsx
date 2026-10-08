import { useStore } from '@/src/store';
import { TargetCollaboration, useProjectComments } from '@/src/features/comments/TargetCollaboration';
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
import { IdentityCodegenTabs } from '@/src/features/shared/IdentityCodegenTabs';
import type { IdentityCodegenSnippets as IdentityCodegenData } from '@/src/domain/codegen/identity';
import { HistorySection } from '@/src/features/history/HistorySection';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { CarriedByCell, SetByCell } from '@/src/features/identity/SetByCell';
import { IdentityRuleEditor, type EditorEvent, type EditorSource, type IdentityEditorSection } from '@/src/features/identity/IdentityRuleEditor';
import type { IdentifierSetBy } from '@/src/domain/identity/identifiers';

interface IdentityRuleRow {
  id: string;
  identifier_id?: string | null;
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

type IdentityCodegenSnippets = IdentityCodegenData;

type EventOption = EditorEvent;
type SourceOption = EditorSource;

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function IdentityRules() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const collaboration = useProjectComments(activeProjectId);
  const [rules, setRules] = useState<IdentityRuleRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [codegen, setCodegen] = useState<IdentityCodegenSnippets | null>(null);
  const [flowParagraph, setFlowParagraph] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestedEntity = useStore((s) => s.selectedItemIdToEdit);
  const clearRequestedEntity = useStore((s) => s.setSelectedItemIdToEdit);
  useEffect(() => { if (requestedEntity && rules.some((r) => r.id === requestedEntity)) { setSelectedId(requestedEntity); setIsCreating(false); setIsSheetOpen(true); clearRequestedEntity(null); } },[requestedEntity,rules,clearRequestedEntity]);
  const [focusSection, setFocusSection] = useState<IdentityEditorSection | null>(null);
  // Bumped only when the sheet is opened, so saving a new rule (which sets selectedId) does not remount the editor.
  const [editorKey, setEditorKey] = useState(0);
  const openRule = (id: string, section: IdentityEditorSection | null = null) => {
    setEditorKey((k) => k + 1);
    setSelectedId(id);
    setFocusSection(section);
    setIsCreating(false);
    setIsSheetOpen(true);
  };
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

  const sameIdentifierCount = (rule: IdentityRuleRow) => rules.filter((r) => r.identifier_name === rule.identifier_name).length;
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
        <Button onClick={() => { setEditorKey((k) => k + 1); setSelectedId(null); setFocusSection(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
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
        <ol className="mb-6 grid grid-cols-3 gap-3 text-sm" data-testid="identity-intro">
          {([
            ['1', 'Define the identifiers (Settings)', 'The hard IDs, soft IDs and cookie of the project are set once in Settings. A rule is one act of identifying with one of them.'],
            ['2', 'Say how it is set', 'An event that sends it, or a standalone identify call with no event.'],
            ['3', 'Say which events carry it', 'The events that send it in customer_ids. Defaults come from the implementation method and source.'],
          ] as const).map(([n, title, text]) => (
            <li key={n} className="rounded-lg border bg-white p-3 shadow-sm">
              <span className="font-semibold text-gray-900">{n} {title}</span>
              <p className="text-xs text-gray-500 mt-1">{text}</p>
            </li>
          ))}
        </ol>
        {reorderError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{reorderError}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-6 py-3 font-medium text-gray-500 w-20" hint="Order" hintScope="Identity">Order</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Name" hintScope="Identity">Name</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Identifier name" hintScope="Identity">Identifier</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Type" hintScope="Identity">Type</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="SDK call" hintScope="Identity">SDK call</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Trigger event" hintScope="Identity">Trigger event</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Set by" hintScope="Identity">Set by</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Carried by" hintScope="Identity">Carried by</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Status" hintScope="Identity">Status</HintTh>
                <HintTh className="px-4 py-3 font-medium text-gray-500" hintScope="Identity">Actions</HintTh>
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
                  <td className="px-6 py-4 font-medium text-gray-900 cursor-pointer" onClick={() => openRule(rule.id)}>{rule.name}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.identifier_name}{sameIdentifierCount(rule) > 1 && <span className="ml-1 text-xs text-gray-400">({sameIdentifierCount(rule)} acts)</span>}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.identity_type}</td>
                  <td className="px-6 py-4 text-gray-500">{rule.sdk_call ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{eventName(rule.trigger_event_id)}</td>
                  <td className="px-6 py-4 text-gray-500 cursor-pointer" title="Edit how this identifier is set" onClick={() => openRule(rule.id, 'set_by')}><SetByCell setBy={rule.set_by} binds={rule.binds} /></td>
                  <td className="px-6 py-4 text-gray-500 cursor-pointer" title="Edit which events carry this identifier" onClick={() => openRule(rule.id, 'carried_by')}><CarriedByCell events={rule.carried_by} /></td>
                  <td className="px-6 py-4 text-gray-500"><StatusBadge status={rule.status} /></td>
                  <td className="px-4 py-4"><TargetCollaboration api={{mode:'internal',projectId:activeProjectId}} entityType="identity_rule" entityId={rule.id} label={rule.name} rows={collaboration.rows} onChanged={collaboration.reload} /></td>
                </tr>
              ))}
              {rules.length === 0 && (
                <EmptyState
                  colSpan={10}
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
              <IdentityCodegenTabs snippets={codegen.identify} defaultOpen />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">update</h3>
              <IdentityCodegenTabs snippets={codegen.update} defaultOpen />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">anonymize</h3>
              <IdentityCodegenTabs snippets={codegen.anonymize} defaultOpen />
            </div>
          </div>
        )}
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Identity Rule' : 'Edit Identity Rule'}>
        <IdentityRuleEditor
          key={editorKey}
          ruleId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          events={events}
          sources={sources}
          rules={rules}
          focusSection={focusSection}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onRefresh={async (createdId) => {
            await load();
            // A new rule that saved but whose events failed stays open as an edit of the created rule.
            if (createdId) { setSelectedId(createdId); setIsCreating(false); }
          }}
          onCreated={(id) => { setSelectedId(id); setIsCreating(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
