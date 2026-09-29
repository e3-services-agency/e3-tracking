/**
 * Use cases: plain table + form against `/api/projects/:projectId/use-cases`, plus an ordered
 * requirements editor against `PUT .../use-cases/:id/requirements` (plan "Target data model"
 * sections UseCase and Requirement; T-1-07). Simplified UI (D-07): list -> detail, no dialogs
 * beyond the create Sheet.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown, ArrowLeft, Sparkles, RefreshCw } from 'lucide-react';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import {
  USE_CASE_TYPES,
  USE_CASE_STATUSES,
  PRIORITIES,
  REQUIREMENT_TARGET_KINDS,
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  type RequirementTargetKind,
} from '@/src/domain/enums';
import { HistorySection } from '@/src/features/history/HistorySection';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';

interface UseCaseRow {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  notes: string | null;
  narrative: string | null;
  narrative_generated_at: string | null;
  narrative_edited_at: string | null;
  sort_order: number;
  documentation_url: string | null;
  internal_notes: string | null;
  internal_url: string | null;
}

interface UseCaseCoverageRow {
  requirement_id: string;
  target_kind: string;
  level: string;
  satisfied: boolean;
  observation_count: number;
}

interface UseCaseCoverage {
  rows: UseCaseCoverageRow[];
  satisfied_count: number;
  total_count: number;
}

interface RequirementRow {
  id: string;
  target_kind: string;
  property_id: string | null;
  event_id: string | null;
  variant_id: string | null;
  level: string;
  status: string | null;
  note: string | null;
}

/**
 * `target_kind: 'variant'|'variant_property'` only persists `variant_id` (and, for the second one,
 * `property_id`) — never `event_id` (`requirement.dal.ts` `validateTarget` rejects the combination).
 * The editor still needs an event to scope the variant/property dropdowns by, so `_eventContext` is
 * a client-only field: seeded from the variant's actual event on load (via `variantEventById`,
 * below) and updated locally when the user picks a different event before choosing a variant. It is
 * never sent to the API (`saveRequirements` only forwards the persisted fields).
 */
interface UIRequirementRow extends RequirementRow {
  _eventContext?: string | null;
}

interface UseCaseTemplateOption {
  id: string;
  code: string;
  name: string;
}

interface EventOption {
  id: string;
  name: string;
}

interface PropertyOption {
  id: string;
  name: string;
}

interface VariantOption {
  id: string;
  name: string;
  event_id: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function UseCases() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [useCases, setUseCases] = useState<UseCaseRow[]>([]);
  const [templates, setTemplates] = useState<UseCaseTemplateOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [fromTemplateError, setFromTemplateError] = useState<string | null>(null);
  const [instantiating, setInstantiating] = useState(false);

  // T-4-02 fix round (ERROR 1): the Comments page (and any other cross-page link) sets
  // `selectedItemIdToEdit` + `requestedTab: 'useCases'` (Layout.tsx) to deep-link straight to a
  // use case; consumed once below, then cleared so a later render does not re-trigger it.
  const selectedItemIdToEdit = useStore((s) => s.selectedItemIdToEdit);
  const setSelectedItemIdToEdit = useStore((s) => s.setSelectedItemIdToEdit);
  const setRequestedTab = useStore((s) => s.setRequestedTab);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const [ucRes, templatesRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases`),
      fetchWithAuth(`${API_BASE}/api/use-case-templates`),
    ]);
    const ucData = await parseJson(ucRes);
    if (ucRes.ok) setUseCases(Array.isArray(ucData) ? ucData : []);
    const templatesData = await parseJson(templatesRes);
    if (templatesRes.ok) setTemplates(Array.isArray(templatesData) ? templatesData : []);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedItemIdToEdit && useCases.some((uc) => uc.id === selectedItemIdToEdit)) {
      setSelectedId(selectedItemIdToEdit);
      setSelectedItemIdToEdit(null);
    }
  }, [selectedItemIdToEdit, useCases, setSelectedItemIdToEdit]);

  const [templateId, setTemplateId] = useState('');

  const handleFromTemplate = async () => {
    if (!activeProjectId || !templateId) return;
    setInstantiating(true);
    setFromTemplateError(null);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${templateId}`,
        { method: 'POST' }
      );
      const data = await parseJson(res);
      if (!res.ok) {
        setFromTemplateError(typeof data?.error === 'string' ? data.error : 'Failed to create from template.');
        return;
      }
      await load();
      setSelectedId(data.id);
    } finally {
      setInstantiating(false);
    }
  };

  if (selectedId) {
    return (
      <UseCaseDetail
        useCaseId={selectedId}
        projectId={activeProjectId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
        onDeleted={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Use cases</h1>
          <p className="text-sm text-gray-500 mt-1">
            What data each use case needs, required or optional (CONTEXT.md 3.2). A requirement that resolves to nothing in the project is a <GlossaryTerm glossaryKey="gap">gap</GlossaryTerm>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void handleFromTemplate()}
            disabled={!templateId || instantiating || templates.length === 0}
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" /> {instantiating ? 'Creating…' : 'Create from template'}
          </Button>
          <Button onClick={() => { setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add use case
          </Button>
        </div>
      </PageHeader>

      <PageBody>
        {fromTemplateError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {fromTemplateError}
          </div>
        )}
        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Code</th>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                <th className="px-6 py-3 font-medium text-gray-500">Priority</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {useCases.map((uc) => (
                <tr key={uc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(uc.id)}>
                  <td className="px-6 py-4 text-gray-500">{uc.code ?? '—'}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{uc.name}</td>
                  <td className="px-6 py-4 text-gray-500">{uc.type ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{uc.priority ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{uc.status ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{uc.owner ?? '—'}</td>
                </tr>
              ))}
              {useCases.length === 0 && (
                <EmptyState
                  colSpan={6}
                  message="No use cases yet. Add one from the use case template library, or add one by hand."
                  actionLabel="Browse templates"
                  onAction={() => setRequestedTab('useCaseTemplates')}
                />
              )}
            </tbody>
          </table>
        </div>
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title="Create use case">
        <UseCaseCreateForm
          projectId={activeProjectId}
          onSaved={async (id) => {
            setIsSheetOpen(false);
            await load();
            setSelectedId(id);
          }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function UseCaseCreateForm({
  projectId,
  onSaved,
  onClose,
}: {
  projectId: string | null;
  onSaved: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();

  const handleSave = async () => {
    if (!trimmedName || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, type: type || null, priority: priority || null }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      await onSaved(data.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        {!trimmedName && <p className="text-xs text-red-600">Name is required.</p>}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">—</option>
          {USE_CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">—</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="pt-6 border-t flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={saving || !trimmedName}>{saving ? 'Saving…' : 'Create use case'}</Button>
      </div>
    </div>
  );
}

function UseCaseDetail({
  useCaseId,
  projectId,
  onBack,
  onDeleted,
}: {
  useCaseId: string;
  projectId: string | null;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [useCase, setUseCase] = useState<UseCaseRow | null>(null);
  const [requirements, setRequirements] = useState<UIRequirementRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [customerProperties, setCustomerProperties] = useState<PropertyOption[]>([]);
  const [eventPropertiesByEvent, setEventPropertiesByEvent] = useState<Record<string, PropertyOption[]>>({});
  const [allVariants, setAllVariants] = useState<VariantOption[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldsSaving, setFieldsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<UseCaseCoverage | null>(null);
  // Fix round (W1): one fetch for every comment on this use case and its requirements, shared by
  // every `CommentsPanel` mounted below (a panel per requirement row plus the use-case-level one --
  // 18 requests on the sandbox project's largest use case before this).
  const [comments, setComments] = useState<CommentPanelRow[]>([]);

  const reloadComments = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/comments`);
      const data = await parseJson(res);
      if (res.ok && Array.isArray(data)) setComments(data);
    } catch {
      // Best-effort refresh only -- see the analogous note in `SharedProject.tsx`.
    }
  }, [projectId]);

  const commentsFor = useCallback(
    (entityType: string, entityId: string) => comments.filter((c) => c.entity_type === entityType && c.entity_id === entityId),
    [comments]
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [ucRes, eventsRes, propsRes, variantsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}`),
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events`),
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties?scope=customer`),
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/variants`),
    ]);
    const variantsData = await parseJson(variantsRes);
    const variants: VariantOption[] = variantsRes.ok && Array.isArray(variantsData)
      ? variantsData.map((v: { id: string; name: string; event_id: string }) => ({
          id: v.id,
          name: v.name,
          event_id: v.event_id,
        }))
      : [];
    setAllVariants(variants);
    const variantEventById = new Map(variants.map((v) => [v.id, v.event_id]));

    const ucData = await parseJson(ucRes);
    if (ucRes.ok) {
      setUseCase(ucData);
      setNarrativeDraft(ucData.narrative ?? '');
      const rows: UIRequirementRow[] = Array.isArray(ucData.requirements) ? ucData.requirements : [];
      setRequirements(
        rows.map((r) => ({
          ...r,
          _eventContext: r.event_id ?? (r.variant_id ? variantEventById.get(r.variant_id) ?? null : null),
        }))
      );
    }
    const eventsData = await parseJson(eventsRes);
    if (eventsRes.ok) setEvents(Array.isArray(eventsData) ? eventsData : []);
    const propsData = await parseJson(propsRes);
    if (propsRes.ok) setCustomerProperties(Array.isArray(propsData) ? propsData : []);
    setLoading(false);

    // T-2-08's coverage grid is a parallel task; the use case coverage endpoint is deployed ahead
    // of it, so a 404 here (route not yet merged) is tolerated -- the summary block just stays hidden.
    try {
      const coverageRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}/coverage`);
      if (coverageRes.ok) setCoverage(await parseJson(coverageRes));
    } catch {
      // network error: leave the coverage block hidden, nothing else in the page depends on it.
    }

    await reloadComments();
  }, [projectId, useCaseId, reloadComments]);

  useEffect(() => {
    void load();
  }, [load]);

  const variantsByEvent = useMemo(() => {
    const map: Record<string, VariantOption[]> = {};
    for (const v of allVariants) {
      (map[v.event_id] ??= []).push(v);
    }
    return map;
  }, [allVariants]);

  const ensureEventDetails = useCallback(
    async (eventId: string) => {
      if (!projectId || !eventId || eventPropertiesByEvent[eventId]) return;
      const eventRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}`);
      const eventData = await parseJson(eventRes);
      if (eventRes.ok) {
        const props = Array.isArray(eventData.properties)
          ? eventData.properties.map((p: { property_id: string; property: { name: string } }) => ({
              id: p.property_id,
              name: p.property?.name ?? p.property_id,
            }))
          : [];
        setEventPropertiesByEvent((prev) => ({ ...prev, [eventId]: props }));
      }
    },
    [projectId, eventPropertiesByEvent]
  );

  // Pre-load properties for every event already referenced (directly or via a variant) so the
  // detail pickers have their options ready as soon as the requirements editor renders.
  useEffect(() => {
    for (const req of requirements) {
      const eventId = req.event_id ?? req._eventContext;
      if (eventId) void ensureEventDetails(eventId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements.length, allVariants.length]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= requirements.length) return;
    const reordered = [...requirements];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    setRequirements(reordered);
  };

  const removeRow = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRequirements([
      ...requirements,
      {
        id: `new-${Date.now()}-${requirements.length}`,
        target_kind: REQUIREMENT_TARGET_KINDS[0],
        property_id: null,
        event_id: null,
        variant_id: null,
        level: REQUIREMENT_LEVELS[0],
        status: null,
        note: null,
        _eventContext: null,
      },
    ]);
  };

  const updateRow = (index: number, patch: Partial<UIRequirementRow>) => {
    setRequirements((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const saveRequirements = async () => {
    if (!projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        requirements: requirements.map((r) => ({
          target_kind: r.target_kind,
          property_id: r.property_id,
          event_id: r.event_id,
          variant_id: r.variant_id,
          level: r.level,
          status: r.status,
          note: r.note,
        })),
      };
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}/requirements`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save requirements.');
        return;
      }
      const variantEventById = new Map(allVariants.map((v) => [v.id, v.event_id]));
      const rows: RequirementRow[] = Array.isArray(data) ? data : [];
      setRequirements(
        rows.map((r) => ({
          ...r,
          _eventContext: r.event_id ?? (r.variant_id ? variantEventById.get(r.variant_id) ?? null : null),
        }))
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFields = async (patch: Partial<UseCaseRow>) => {
    if (!projectId || !useCase) return;
    setFieldsSaving(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      setUseCase(data);
    } finally {
      setFieldsSaving(false);
    }
  };

  const saveNarrative = async () => {
    if (!projectId || !useCase) return;
    setFieldsSaving(true);
    setNarrativeError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}`, {
        method: 'PATCH',
        body: JSON.stringify({ narrative: narrativeDraft.trim() || null }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setNarrativeError(typeof data?.error === 'string' ? data.error : 'Failed to save narrative.');
        return;
      }
      setUseCase(data);
      setNarrativeDraft(data.narrative ?? '');
    } finally {
      setFieldsSaving(false);
    }
  };

  /** `POST .../narrative/regenerate` (D-32): 409 `NARRATIVE_EDITED` when the stored narrative was hand-edited more recently than it was generated; a confirm prompt offers `force: true`. */
  const regenerateNarrative = async (force = false) => {
    if (!projectId || !useCase) return;
    setRegenerating(true);
    setNarrativeError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}/narrative/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const data = await parseJson(res);
      if (res.status === 409) {
        if (window.confirm('This narrative was edited by hand. Regenerate anyway and discard the manual edit?')) {
          await regenerateNarrative(true);
        }
        return;
      }
      if (!res.ok) {
        setNarrativeError(typeof data?.error === 'string' ? data.error : 'Failed to regenerate narrative.');
        return;
      }
      setUseCase(data);
      setNarrativeDraft(data.narrative ?? '');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId || !useCase) return;
    if (!window.confirm(`Delete use case "${useCase.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/${useCaseId}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        onDeleted();
      } else {
        const data = await parseJson(res);
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!useCase) return <div className="p-8 text-sm text-gray-500">Use case not found.</div>;

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to use cases
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{useCase.code ? `${useCase.code} — ${useCase.name}` : useCase.name}</h1>
          </div>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting} className="gap-2">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
          </Button>
        </div>
      </PageHeader>

      <PageBody className="space-y-8">
        {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

        <div className="bg-white rounded-lg border shadow-sm p-6 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Name</label>
            <Input
              defaultValue={useCase.name}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== useCase.name) void saveFields({ name: e.target.value.trim() }); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Type</label>
            <select
              defaultValue={useCase.type ?? ''}
              onChange={(e) => void saveFields({ type: e.target.value || null })}
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {USE_CASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Priority</label>
            <select
              defaultValue={useCase.priority ?? ''}
              onChange={(e) => void saveFields({ priority: e.target.value || null })}
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              defaultValue={useCase.status ?? ''}
              onChange={(e) => void saveFields({ status: e.target.value || null })}
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {USE_CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Owner</label>
            <Input
              defaultValue={useCase.owner ?? ''}
              onBlur={(e) => void saveFields({ owner: e.target.value.trim() || null })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Documentation link</label>
            <Input
              defaultValue={useCase.documentation_url ?? ''}
              onBlur={(e) => void saveFields({ documentation_url: e.target.value.trim() || null })}
            />
            {useCase.documentation_url && (
              <a href={useCase.documentation_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                Open documentation
              </a>
            )}
          </div>
          <div className="space-y-2 col-span-2">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Input
              defaultValue={useCase.description ?? ''}
              onBlur={(e) => void saveFields({ description: e.target.value.trim() || null })}
            />
          </div>
          <div className="space-y-2 col-span-2 border-t pt-3">
            <h3 className="text-sm font-semibold text-gray-900">Internal (never shown to the client)</h3>
          </div>
          <div className="space-y-2 col-span-2">
            <label className="text-sm font-medium text-gray-700">Internal notes</label>
            <textarea
              className="w-full h-16 rounded-md border border-gray-300 px-3 py-2 text-sm"
              defaultValue={useCase.internal_notes ?? ''}
              onBlur={(e) => void saveFields({ internal_notes: e.target.value.trim() || null })}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <label className="text-sm font-medium text-gray-700">Internal link</label>
            <Input
              defaultValue={useCase.internal_url ?? ''}
              onBlur={(e) => void saveFields({ internal_url: e.target.value.trim() || null })}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Narrative</label>
              <div className="flex items-center gap-2">
                {useCase.narrative_edited_at && (
                  <span className="text-xs text-amber-600">Edited by hand</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void regenerateNarrative(false)}
                  disabled={regenerating || fieldsSaving}
                  className="gap-2"
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  onClick={() => void saveNarrative()}
                  disabled={fieldsSaving || narrativeDraft === (useCase.narrative ?? '')}
                >
                  {fieldsSaving ? 'Saving…' : 'Save narrative'}
                </Button>
              </div>
            </div>
            {narrativeError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{narrativeError}</div>
            )}
            <textarea
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
              disabled={fieldsSaving || regenerating}
            />
          </div>
        </div>

        {coverage && (() => {
          // LOW 5 fix round: `customer_property` rows can never be satisfied from event-payload
          // observations (useCaseCoverage.service.ts's module doc) -- excluded from both the count
          // and the denominator so "N of M" reflects what could actually be observed, with a note
          // for the excluded rows instead of silently lowering the achievable maximum.
          const observableRows = coverage.rows.filter((r) => r.target_kind !== 'customer_property');
          const observableSatisfied = observableRows.filter((r) => r.satisfied).length;
          const customerPropertyCount = coverage.rows.length - observableRows.length;
          return (
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-2">Coverage</h2>
              <p className="text-sm text-gray-500">
                {observableSatisfied} of {observableRows.length} requirement{observableRows.length === 1 ? '' : 's'} observed
                in a non-archived QA run.
                {customerPropertyCount > 0 && (
                  <>
                    {' '}
                    ({customerPropertyCount} customer property requirement{customerPropertyCount === 1 ? '' : 's'} excluded --
                    not observable from event data.)
                  </>
                )}
              </p>
            </div>
          );
        })()}

        <div className="bg-white rounded-lg border shadow-sm p-6">
          <CommentsPanel
            entityType="use_case"
            entityId={useCaseId}
            api={{ mode: 'internal', projectId: projectId ?? '' }}
            rows={commentsFor('use_case', useCaseId)}
            onChanged={reloadComments}
          />
        </div>

        <div className="bg-white rounded-lg border shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Requirements (ordered; the flow sequence)</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addRow} className="gap-2">
                <Plus className="w-4 h-4" /> Add requirement
              </Button>
              <Button onClick={() => void saveRequirements()} disabled={saving}>
                {saving ? 'Saving…' : 'Save requirements'}
              </Button>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 font-medium text-gray-500 w-16">Order</th>
                <th className="px-4 py-2 font-medium text-gray-500">Target kind</th>
                <th className="px-4 py-2 font-medium text-gray-500">Target</th>
                <th className="px-4 py-2 font-medium text-gray-500 w-20">Level</th>
                <th className="px-4 py-2 font-medium text-gray-500 w-32">Status</th>
                <th className="px-4 py-2 font-medium text-gray-500">Note</th>
                <th className="px-4 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {requirements.map((req, index) => (
                <React.Fragment key={req.id}>
                <tr>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === requirements.length - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={req.target_kind}
                      onChange={(e) =>
                        updateRow(index, {
                          target_kind: e.target.value as RequirementTargetKind,
                          property_id: null,
                          event_id: null,
                          variant_id: null,
                          _eventContext: null,
                        })
                      }
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    >
                      {REQUIREMENT_TARGET_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <TargetPicker
                      row={req}
                      events={events}
                      customerProperties={customerProperties}
                      eventPropertiesByEvent={eventPropertiesByEvent}
                      variantsByEvent={variantsByEvent}
                      ensureEventDetails={ensureEventDetails}
                      onChange={(patch) => updateRow(index, patch)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={req.level}
                      onChange={(e) => updateRow(index, { level: e.target.value })}
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    >
                      {REQUIREMENT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={req.status ?? ''}
                      onChange={(e) => updateRow(index, { status: e.target.value || null })}
                      className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {REQUIREMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={req.note ?? ''}
                      onChange={(e) => updateRow(index, { note: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button type="button" onClick={() => removeRow(index)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {!req.id.startsWith('new-') && (
                  <tr>
                    <td colSpan={7} className="px-4 pb-3 bg-gray-50/50">
                      <CommentsPanel
                        entityType="requirement"
                        entityId={req.id}
                        api={{ mode: 'internal', projectId: projectId ?? '' }}
                        title="Comments on this requirement"
                        rows={commentsFor('requirement', req.id)}
                        onChanged={reloadComments}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
              {requirements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No requirements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <HistorySection projectId={projectId ?? ''} entityType="use_case" entityId={useCaseId} parentEntityId={useCaseId} />
      </PageBody>
    </div>
  );
}

function TargetPicker({
  row,
  events,
  customerProperties,
  eventPropertiesByEvent,
  variantsByEvent,
  ensureEventDetails,
  onChange,
}: {
  row: UIRequirementRow;
  events: EventOption[];
  customerProperties: PropertyOption[];
  eventPropertiesByEvent: Record<string, PropertyOption[]>;
  variantsByEvent: Record<string, VariantOption[]>;
  ensureEventDetails: (eventId: string) => Promise<void>;
  onChange: (patch: Partial<UIRequirementRow>) => void;
}) {
  if (row.target_kind === 'customer_property') {
    return (
      <select
        value={row.property_id ?? ''}
        onChange={(e) => onChange({ property_id: e.target.value || null })}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm w-full"
      >
        <option value="">Select a customer property…</option>
        {customerProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  }

  if (row.target_kind === 'event') {
    return (
      <select
        value={row.event_id ?? ''}
        onChange={(e) => onChange({ event_id: e.target.value || null })}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm w-full"
      >
        <option value="">Select an event…</option>
        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
      </select>
    );
  }

  if (row.target_kind === 'event_property') {
    const props = row.event_id ? eventPropertiesByEvent[row.event_id] ?? [] : [];
    return (
      <div className="flex gap-2">
        <select
          value={row.event_id ?? ''}
          onChange={(e) => {
            const eventId = e.target.value || null;
            onChange({ event_id: eventId, property_id: null });
            if (eventId) void ensureEventDetails(eventId);
          }}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">Event…</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <select
          value={row.property_id ?? ''}
          onChange={(e) => onChange({ property_id: e.target.value || null })}
          disabled={!row.event_id}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">Property…</option>
          {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    );
  }

  if (row.target_kind === 'variant') {
    // The event picker here is local UI state only (`_eventContext`): the server only persists
    // `variant_id` for this target_kind (see the `UIRequirementRow` doc comment above).
    const variants = row._eventContext ? variantsByEvent[row._eventContext] ?? [] : [];
    return (
      <div className="flex gap-2">
        <select
          value={row._eventContext ?? ''}
          onChange={(e) => {
            const eventId = e.target.value || null;
            onChange({ _eventContext: eventId, variant_id: null });
            if (eventId) void ensureEventDetails(eventId);
          }}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">Event…</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <select
          value={row.variant_id ?? ''}
          onChange={(e) => onChange({ variant_id: e.target.value || null })}
          disabled={!row._eventContext}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">Variant…</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    );
  }

  // variant_property: pick an event (UI-only, `_eventContext`) to scope the variant/property
  // dropdowns; only `variant_id` and `property_id` are persisted.
  const variants = row._eventContext ? variantsByEvent[row._eventContext] ?? [] : [];
  const props = row._eventContext ? eventPropertiesByEvent[row._eventContext] ?? [] : [];
  return (
    <div className="flex gap-2">
      <select
        value={row._eventContext ?? ''}
        onChange={(e) => {
          const eventId = e.target.value || null;
          onChange({ _eventContext: eventId, variant_id: null, property_id: null });
          if (eventId) void ensureEventDetails(eventId);
        }}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">Event…</option>
        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
      </select>
      <select
        value={row.variant_id ?? ''}
        onChange={(e) => onChange({ variant_id: e.target.value || null })}
        disabled={!row._eventContext}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">Variant…</option>
        {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <select
        value={row.property_id ?? ''}
        onChange={(e) => onChange({ property_id: e.target.value || null })}
        disabled={!row._eventContext}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
      >
        <option value="">Property…</option>
        {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}
