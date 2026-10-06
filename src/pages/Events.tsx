/**
 * Events: table + plain editor against `/api/projects/:projectId/events` (D-16). Linked
 * properties are edited as the full ordered list (`PUT /events/:id/properties`); T-1-04 adds the
 * role/allowed-values validation and badges, `expiration_json` and `derived_metrics_json`
 * editors. Trigger images upload through the local FileStore (D-14) and render from
 * `GET /api/projects/:id/files/*`.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { hintFor } from '@/src/components/ui/FieldHint';
import { ClassBadge } from '@/src/components/ui/ClassBadge';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Upload, FileDown } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, EVENT_STATUSES, EVENT_CLASSES, IMPLEMENTATION_METHODS } from '@/src/domain/enums';
import { sourceViaLabel } from '@/src/domain/sources';
import { isHttpUrl } from '@/src/domain/url';
import { ExpirationEditor, type ExpirationValue } from '@/src/features/events/components/ExpirationEditor';
import { DerivedMetricsEditor, type DerivedMetricRow } from '@/src/features/events/components/DerivedMetricsEditor';
import { LinkedPropertiesEditor, type LinkedPropertyRow, type DefinitionOption } from '@/src/features/events/components/LinkedPropertiesEditor';
import { VariantsSection, type DiscriminatorProperty } from '@/src/features/events/components/VariantsSection';
import { RulesSection, type RuleLinkedProperty } from '@/src/features/events/components/RulesSection';
import { UseCasesForEventSection } from '@/src/features/events/components/UseCasesForEventSection';
import { HistorySection } from '@/src/features/history/HistorySection';
import { CommentsPanel } from '@/src/features/comments/CommentsPanel';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { NamingWarning } from '@/src/components/ui/NamingWarning';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';

interface EventRow {
  id: string;
  name: string;
  business_name: string | null;
  description: string | null;
  purpose: string | null;
  page: string | null;
  trigger_text: string | null;
  grain: string | null;
  identity_note: string | null;
  class: string;
  /** D-63 (T-4-17). */
  implementation_method?: string;
  dl_event_name?: string | null;
  owner_business: string | null;
  owner_technical: string | null;
  priority: string | null;
  status: string;
  expiration_json: ExpirationValue | null;
  not_suitable_for: string | null;
  agent_instructions: string | null;
  derived_metrics_json: DerivedMetricRow[];
  tags_json: string[];
  triggers_json: TriggerEntry[];
  attached_property_count?: number;
  /** T-2-09: batched from `GET /events` (`document.service.ts`'s `computeCertificationsForProject`,
   * one project-wide pass -- never one request per row). `'n/a'` for sdk/platform events. */
  certified?: 'yes' | 'no' | 'n/a';
  certified_reasons?: string[];
}

interface TriggerEntry {
  title: string;
  description: string;
  image_path?: string | null;
  source?: string | null;
  order: number;
}

interface PropertyRow {
  id: string;
  name: string;
  scope: string;
  allowed_values_json?: { value: string; label?: string | null; standard_event?: string | null }[] | null;
}

interface SourceRow {
  id: string;
  name: string;
  /** D-62 (T-4-11B). */
  system?: string;
  method?: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function expirationSummary(expiration: ExpirationValue | null): string {
  if (!expiration) return 'project default';
  if (!expiration.enabled) return 'Disabled';
  return `${expiration.count} ${expiration.units}`;
}

export function Events() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDownloadingDocs, setIsDownloadingDocs] = useState(false);
  const [isDownloadingTrackingDocument, setIsDownloadingTrackingDocument] = useState(false);
  // T-2-09: `class` filter (custom default, sdk, platform, all); the events list stays batched
  // (one `GET /events` call), this only filters the already-loaded rows client-side.
  const [classFilter, setClassFilter] = useState<'custom' | 'sdk' | 'platform' | 'all'>('custom');
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);

  const openEventCard = useCallback(
    (id: string) => {
      setEventCardEventId(id);
      setRequestedTab('eventCard');
    },
    [setEventCardEventId, setRequestedTab]
  );

  // LOW 5 fix round: the empty state must react to the `class` filter, not the unfiltered list --
  // a project whose custom filter (default) matches nothing used to render a headerless empty
  // table with no "No events found" row.
  const filteredEvents = useMemo(
    () => events.filter((ev) => classFilter === 'all' || ev.class === classFilter),
    [events, classFilter]
  );

  const handleDownloadDocumentation = useCallback(async () => {
    if (!activeProjectId) return;
    setIsDownloadingDocs(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/export/documentation.html`);
      if (!res.ok) return;
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tracking-documentation.html';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingDocs(false);
    }
  }, [activeProjectId]);

  // D-34, T-2-08 ("the Documentation page gets 'Download tracking document JSON'"): this project's
  // documentation export lives on the Events page header (there is no separate per-project
  // "Documentation" page; the old static viewer was merged into the Help page in T-4-13), same
  // place as the HTML documentation download above.
  const handleDownloadTrackingDocument = useCallback(async () => {
    if (!activeProjectId) return;
    setIsDownloadingTrackingDocument(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/export/tracking-document.json`);
      if (!res.ok) return;
      const json = await res.text();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tracking-document.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingTrackingDocument(false);
    }
  }, [activeProjectId]);

  const loadEvents = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events`);
    const data = await parseJson(res);
    if (res.ok) setEvents(Array.isArray(data) ? data : []);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Tracking plan events and their <GlossaryTerm glossaryKey="variant">variants</GlossaryTerm>.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void handleDownloadDocumentation()}
            disabled={isDownloadingDocs || !activeProjectId}
            className="gap-2"
          >
            {isDownloadingDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Documentation
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleDownloadTrackingDocument()}
            disabled={isDownloadingTrackingDocument || !activeProjectId}
            className="gap-2"
          >
            {isDownloadingTrackingDocument ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Tracking document JSON
          </Button>
          <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Event
          </Button>
        </div>
      </PageHeader>

      <PageBody className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500" title={hintFor('Class', 'Events')}>Class</label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as typeof classFilter)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="custom">custom</option>
            {EVENT_CLASSES.filter((c) => c !== 'custom').map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="all">all</option>
          </select>
        </div>
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Name', 'Events')}>Name</th>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Class', 'Events')}>Class</th>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Status', 'Events')}>Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">
                  <GlossaryTerm glossaryKey="certified">Certified</GlossaryTerm>
                </th>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Expiration', 'Events')}>Expiration</th>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Properties', 'Events')}>Properties</th>
                <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Card', 'Events')}>Card</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEvents
                .map((ev) => (
                  <tr key={ev.id} onClick={() => { setSelectedId(ev.id); setIsCreating(false); setIsSheetOpen(true); }} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 font-medium text-gray-900"><span className="inline-flex items-center gap-1.5">{ev.name}<CopyNameButton name={ev.name} /></span></td>
                    <td className="px-6 py-4"><ClassBadge eventClass={ev.class} /></td>
                    <td className="px-6 py-4 text-gray-500">{ev.status}</td>
                    <td className="px-6 py-4 text-gray-500" title={(ev.certified_reasons ?? []).join(', ') || undefined}>
                      {ev.certified ?? 'n/a'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{expirationSummary(ev.expiration_json)}</td>
                    <td className="px-6 py-4 text-gray-500">{ev.attached_property_count ?? 0}</td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEventCard(ev.id); }}
                        className="text-[var(--brand-primary)] hover:underline text-sm"
                      >
                        View card
                      </button>
                    </td>
                  </tr>
                ))}
              {filteredEvents.length === 0 && events.length === 0 && (
                <EmptyState
                  colSpan={7}
                  message="No events yet. Import a data mapping from the Import page, or add one by hand."
                  actionLabel="Add Event"
                  onAction={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }}
                />
              )}
              {filteredEvents.length === 0 && events.length > 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No events match this class filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Event' : 'Edit Event'}>
        <EventEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          eventId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          onSaved={async () => { await loadEvents(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

const EMPTY_EXPIRATION: ExpirationValue = { enabled: false, count: 30, units: 'days' };

function EventEditor({
  eventId,
  projectId,
  onSaved,
  onClose,
}: {
  eventId: string | null;
  projectId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const isCreating = eventId === null;
  const [loading, setLoading] = useState(!isCreating);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [links, setLinks] = useState<LinkedPropertyRow[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyRow[]>([]);
  const [allSources, setAllSources] = useState<SourceRow[]>([]);
  const [standardEventByVariantId, setStandardEventByVariantId] = useState<Record<string, string>>({});
  const [addPropertyId, setAddPropertyId] = useState('');
  // D-63 (T-4-17): "Add bundle" picker. Bundles are fetched once; adding one puts every property of
  // the bundle into the (unsaved) link list below, saved together with the rest of the editor.
  const [allBundles, setAllBundles] = useState<{ id: string; name: string; property_ids: string[] }[]>([]);
  const [addBundleId, setAddBundleId] = useState('');
  // D-58 (T-4-00): every definition of every currently-linked property, fetched on demand so the
  // picker only shows up for a property that actually has more than one meaning.
  const [definitionsByPropertyId, setDefinitionsByPropertyId] = useState<Record<string, DefinitionOption[]>>({});

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [page, setPage] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const [grain, setGrain] = useState('');
  const [identityNote, setIdentityNote] = useState('');
  const [eventClass, setEventClass] = useState('custom');
  // D-63 (T-4-17): '' = let the server default by name and class (new events only).
  const [implementationMethod, setImplementationMethod] = useState('');
  // D-62: only a method the user changed is sent, so a source's method can still default an untouched one.
  const [loadedImplementationMethod, setLoadedImplementationMethod] = useState('');
  const [dlEventName, setDlEventName] = useState('');
  const [ownerBusiness, setOwnerBusiness] = useState('');
  const [ownerTechnical, setOwnerTechnical] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('planned');
  const [expiration, setExpiration] = useState<ExpirationValue>(EMPTY_EXPIRATION);
  const [notSuitableFor, setNotSuitableFor] = useState('');
  const [agentInstructions, setAgentInstructions] = useState('');
  const [derivedMetrics, setDerivedMetrics] = useState<DerivedMetricRow[]>([]);
  const [triggers, setTriggers] = useState<TriggerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingTriggerIndex, setUploadingTriggerIndex] = useState<number | null>(null);
  // T-1-09: open finding count badge (findings table filtered to this event, any comparison/kind/severity).
  const [openFindingsCount, setOpenFindingsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const propsRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties`);
      const propsData = await parseJson(propsRes);
      if (propsRes.ok) setAllProperties(Array.isArray(propsData) ? propsData : []);

      const sourcesRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/sources`);
      const sourcesData = await parseJson(sourcesRes);
      if (sourcesRes.ok) setAllSources(Array.isArray(sourcesData) ? sourcesData : []);

      const bundlesRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/bundles`);
      const bundlesData = await parseJson(bundlesRes);
      if (bundlesRes.ok) setAllBundles(Array.isArray(bundlesData) ? bundlesData : []);

      if (eventId) {
        const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}`);
        const data = await parseJson(res);
        if (res.ok) {
          const ev = data.event as EventRow;
          setEvent(ev);
          setName(ev.name);
          setBusinessName(ev.business_name ?? '');
          setDescription(ev.description ?? '');
          setPurpose(ev.purpose ?? '');
          setPage(ev.page ?? '');
          setTriggerText(ev.trigger_text ?? '');
          setGrain(ev.grain ?? '');
          setIdentityNote(ev.identity_note ?? '');
          setEventClass(ev.class);
          setImplementationMethod(ev.implementation_method ?? 'client_web');
          setLoadedImplementationMethod(ev.implementation_method ?? 'client_web');
          setDlEventName(ev.dl_event_name ?? '');
          setOwnerBusiness(ev.owner_business ?? '');
          setOwnerTechnical(ev.owner_technical ?? '');
          setPriority(ev.priority ?? '');
          setStatus(ev.status);
          setExpiration(ev.expiration_json ?? EMPTY_EXPIRATION);
          setNotSuitableFor(ev.not_suitable_for ?? '');
          setAgentInstructions(ev.agent_instructions ?? '');
          setDerivedMetrics(Array.isArray(ev.derived_metrics_json) ? ev.derived_metrics_json : []);
          setTriggers(Array.isArray(ev.triggers_json) ? ev.triggers_json : []);
          setLinks(Array.isArray(data.properties) ? data.properties : []);
          setSourceIds(Array.isArray(data.source_ids) ? data.source_ids : []);

          const mappingsRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/standard-event-mappings`);
          const mappingsData = await parseJson(mappingsRes);
          if (mappingsRes.ok && Array.isArray(mappingsData)) {
            const byVariant: Record<string, string> = {};
            for (const m of mappingsData) {
              if (m.event_id === eventId && m.variant_id) byVariant[m.variant_id] = m.standard_event;
            }
            setStandardEventByVariantId(byVariant);
          }

          const findingsRes = await fetchWithAuth(
            `${API_BASE}/api/projects/${projectId}/findings?event_id=${eventId}&status=open`
          );
          const findingsData = await parseJson(findingsRes);
          if (findingsRes.ok) setOpenFindingsCount(Array.isArray(findingsData) ? findingsData.length : 0);
        }
        setLoading(false);
      }
    })();
  }, [projectId, eventId]);

  // D-58 (T-4-00): fetch every linked property's definitions once per property id (the picker
  // stays hidden for a single-definition property, but the check needs the list to know that).
  useEffect(() => {
    if (!projectId) return;
    const missing = links.map((l) => l.property_id).filter((id) => !(id in definitionsByPropertyId));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (propertyId) => {
          const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties/${propertyId}/definitions`);
          const data = await parseJson(res);
          return [propertyId, res.ok && Array.isArray(data) ? data : []] as const;
        })
      );
      setDefinitionsByPropertyId((prev) => {
        const next = { ...prev };
        for (const [id, defs] of entries) next[id] = defs;
        return next;
      });
    })();
  }, [projectId, links, definitionsByPropertyId]);

  const addLink = () => {
    if (!addPropertyId) return;
    const property = allProperties.find((p) => p.id === addPropertyId);
    if (!property) return;
    setLinks((prev) => [
      ...prev,
      { property_id: property.id, required: false, role: 'normal', priority: null, status: null, source_id: null, payload_key: null, definition_id: null, property },
    ]);
    setAddPropertyId('');
  };

  const addBundle = () => {
    const bundle = allBundles.find((b) => b.id === addBundleId);
    if (!bundle) return;
    const linked = new Set(links.map((l) => l.property_id));
    const added = bundle.property_ids
      .filter((id) => !linked.has(id))
      .map((id) => allProperties.find((p) => p.id === id))
      .filter((p): p is PropertyRow => !!p)
      .map((property) => ({ property_id: property.id, required: false, role: 'normal', priority: null, status: null, source_id: null, payload_key: null, definition_id: null, property }));
    setLinks((prev) => [...prev, ...added]);
    setAddBundleId('');
  };

  const addTrigger = () => setTriggers((prev) => [...prev, { title: '', description: '', order: prev.length }]);
  const updateTrigger = (index: number, patch: Partial<TriggerEntry>) =>
    setTriggers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const removeTrigger = (index: number) => setTriggers((prev) => prev.filter((_, i) => i !== index));

  const handleTriggerImageUpload = async (index: number, file: File) => {
    if (!projectId) return;
    setUploadingTriggerIndex(index);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/files?kind=event_trigger`, {
        method: 'POST',
        body: form,
      });
      const data = await parseJson(res);
      if (res.ok && typeof data.path === 'string') {
        updateTrigger(index, { image_path: data.path });
      }
    } finally {
      setUploadingTriggerIndex(null);
    }
  };

  const trimmedName = name.trim();
  const nameError = trimmedName ? null : 'Name is required.';
  // D-50/T-4-03 QA fix: block Save while a trigger's page URL fails the same http(s) rule the API
  // enforces (event.dal.ts#validateTriggersJson) -- the inline per-row message above already tells
  // the user which field to fix.
  const hasInvalidTriggerSource = triggers.some((t) => t.source?.trim() && !isHttpUrl(t.source.trim()));

  const handleSave = async () => {
    if (!trimmedName || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        business_name: businessName.trim() || null,
        description: description.trim() || null,
        purpose: purpose.trim() || null,
        page: page.trim() || null,
        trigger_text: triggerText.trim() || null,
        grain: grain.trim() || null,
        identity_note: identityNote.trim() || null,
        triggers_json: triggers,
        class: eventClass,
        ...(implementationMethod && implementationMethod !== loadedImplementationMethod ? { implementation_method: implementationMethod } : {}),
        dl_event_name: dlEventName.trim() || null,
        owner_business: ownerBusiness.trim() || null,
        owner_technical: ownerTechnical.trim() || null,
        priority: priority || null,
        status,
        expiration_json: expiration.enabled ? expiration : null,
        not_suitable_for: notSuitableFor.trim() || null,
        agent_instructions: agentInstructions.trim() || null,
        derived_metrics_json: derivedMetrics
          .filter((m) => m.name.trim() && m.expression.trim())
          .map((m) => ({ name: m.name.trim(), expression: m.expression.trim(), description: m.description?.trim() || null })),
        // D-62: a new event with no source chosen gets the project default source from the server.
        ...(isCreating && sourceIds.length === 0 ? {} : { source_ids: sourceIds }),
      };
      const url = isCreating
        ? `${API_BASE}/api/projects/${projectId}/events`
        : `${API_BASE}/api/projects/${projectId}/events/${eventId}`;
      const res = await fetchWithAuth(url, { method: isCreating ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      const savedEventId = isCreating ? data.id : eventId;

      if (!isCreating) {
        const linksRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${savedEventId}/properties`, {
          method: 'PUT',
          body: JSON.stringify({
            properties: links.map((l, i) => ({
              property_id: l.property_id,
              required: l.required,
              role: l.role,
              priority: l.priority,
              status: l.status,
              source_id: l.source_id,
              payload_key: l.payload_key,
              definition_id: l.definition_id ?? null,
              sort_order: i,
            })),
          }),
        });
        if (!linksRes.ok) {
          const linksData = await parseJson(linksRes);
          setSaveError(typeof linksData?.error === 'string' ? linksData.error : 'Event saved, but attached properties failed to save.');
          return;
        }
      }

      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !projectId) return;
    if (!window.confirm(`Delete event "${event.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${event.id}`, { method: 'DELETE' });
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

  const toggleSource = (id: string) => setSourceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  const unattachedProperties = allProperties.filter((p) => !links.some((l) => l.property_id === p.id));

  return (
    <div className="space-y-6">
      {!isCreating && openFindingsCount !== null && openFindingsCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {openFindingsCount} open finding{openFindingsCount === 1 ? '' : 's'} for this event (see Findings).
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700" title={hintFor('Name', 'Events')}>Name</label>
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. purchase" />
          {name.trim() && <CopyNameButton name={name.trim()} />}
        </div>
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
        <NamingWarning entity={{ kind: 'event', class: eventClass }} name={name} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Business name', 'Events')}>Business name</label>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Class', 'Events')}>Class</label>
          <select value={eventClass} onChange={(e) => setEventClass(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {EVENT_CLASSES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Implementation method', 'Events')}>Implementation method</label>
          <select value={implementationMethod} onChange={(e) => setImplementationMethod(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {isCreating && <option value="">Automatic (by name and class)</option>}
            {IMPLEMENTATION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('dataLayer event name', 'Events')}>dataLayer event name</label>
          <Input value={dlEventName} onChange={(e) => setDlEventName(e.target.value)} placeholder="the site's event, e.g. add_to_wishlist" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700" title={hintFor('Description', 'Events')}>Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Purpose', 'Events')}>Purpose</label>
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Page', 'Events')}>Page</label>
          <Input value={page} onChange={(e) => setPage(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Trigger', 'Events')}>Trigger</label>
          <Input value={triggerText} onChange={(e) => setTriggerText(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Grain', 'Events')}>Grain</label>
          <Input value={grain} onChange={(e) => setGrain(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700" title={hintFor('Identity note', 'Events')}>Identity note</label>
        <Input value={identityNote} onChange={(e) => setIdentityNote(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Owner (business)', 'Events')}>Owner (business)</label>
          <Input value={ownerBusiness} onChange={(e) => setOwnerBusiness(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Owner (technical)', 'Events')}>Owner (technical)</label>
          <Input value={ownerTechnical} onChange={(e) => setOwnerTechnical(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Priority', 'Events')}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Status', 'Events')}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <ExpirationEditor value={expiration} onChange={setExpiration} inheritHint="Disabled: inherits the project default expiration." />

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700" title={hintFor('Not suitable for', 'Events')}>Not suitable for</label>
        <Input value={notSuitableFor} onChange={(e) => setNotSuitableFor(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700" title={hintFor('Agent instructions', 'Events')}>Agent instructions</label>
        <Input value={agentInstructions} onChange={(e) => setAgentInstructions(e.target.value)} />
      </div>

      <DerivedMetricsEditor values={derivedMetrics} onChange={setDerivedMetrics} />

      {allSources.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Sources (system via method)', 'Events')}>Sources (system via method)</label>
          <div className="flex flex-wrap gap-2">
            {allSources.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1">
                <input type="checkbox" checked={sourceIds.includes(s.id)} onChange={() => toggleSource(s.id)} />
                {s.name} <span className="text-gray-500">({sourceViaLabel(s.system, s.method)})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {!isCreating && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Linked properties</h3>
          <LinkedPropertiesEditor links={links} onChange={setLinks} sources={allSources} definitionsByPropertyId={definitionsByPropertyId} />
          <div className="flex gap-2">
            <select value={addPropertyId} onChange={(e) => setAddPropertyId(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm flex-1">
              <option value="">Select a property to attach…</option>
              {unattachedProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button type="button" variant="outline" onClick={addLink} disabled={!addPropertyId}>Attach</Button>
          </div>
          {allBundles.length > 0 && (
            <div className="flex gap-2">
              <select value={addBundleId} onChange={(e) => setAddBundleId(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm flex-1">
                <option value="">Select a bundle to add…</option>
                {allBundles.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.property_ids.length})</option>)}
              </select>
              <Button type="button" variant="outline" onClick={addBundle} disabled={!addBundleId}>Add bundle</Button>
            </div>
          )}
        </div>
      )}

      {!isCreating && eventId && (
        <VariantsSection
          projectId={projectId}
          eventId={eventId}
          discriminators={links
            .filter((l) => l.role === 'discriminator')
            .map<DiscriminatorProperty>((l) => ({
              id: l.property_id,
              name: l.property.name,
              allowed_values_json: l.property.allowed_values_json ?? [],
            }))}
          standardEventByVariantId={standardEventByVariantId}
        />
      )}

      {!isCreating && eventId && (
        <RulesSection
          projectId={projectId}
          eventId={eventId}
          properties={links.map<RuleLinkedProperty>((l) => ({
            property_id: l.property_id,
            name: l.property.name,
            data_type: (l.property as unknown as { data_type?: string }).data_type ?? 'string',
            item_schema_json: (l.property as unknown as { item_schema_json?: { field: string; data_type: string }[] | null }).item_schema_json ?? null,
          }))}
        />
      )}

      {!isCreating && eventId && <UseCasesForEventSection projectId={projectId} eventId={eventId} />}

      {!isCreating && eventId && (
        <CommentsPanel entityType="event" entityId={eventId} api={{ mode: 'internal', projectId }} />
      )}

      {!isCreating && eventId && (
        <HistorySection projectId={projectId} entityType="event" entityId={eventId} parentEntityId={eventId} />
      )}

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-900">Triggers</h3>
        {triggers.map((trigger, index) => (
          <div key={index} className="border rounded-md p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <Input
                value={trigger.title}
                onChange={(e) => updateTrigger(index, { title: e.target.value })}
                placeholder="Trigger title"
                className="text-sm flex-1 mr-2"
              />
              <button type="button" onClick={() => removeTrigger(index)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={trigger.description}
              onChange={(e) => updateTrigger(index, { description: e.target.value })}
              placeholder="Trigger description"
              className="text-sm"
            />
            <div>
              <Input
                value={trigger.source ?? ''}
                onChange={(e) => updateTrigger(index, { source: e.target.value })}
                placeholder="Page URL (https://...)"
                className="text-sm"
              />
              {/* D-50/T-4-03 QA fix: same http(s)-only rule event.dal.ts's validateTriggersJson
                  applies server-side (src/domain/url.ts#isHttpUrl, one shared regex) -- caught here
                  before Save so the round trip to the API's 400 is the exception, not the norm; if
                  it still 400s (e.g. a race with another edit), the API's own message is shown by
                  the existing saveError banner below the Triggers section. */}
              {trigger.source?.trim() && !isHttpUrl(trigger.source.trim()) && (
                <p className="text-xs text-red-600 mt-1">Page URL must be an http:// or https:// URL.</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {trigger.image_path && projectId && (
                <img
                  src={`${API_BASE}/api/projects/${projectId}/files/${trigger.image_path}`}
                  alt=""
                  className="h-16 w-auto rounded border"
                />
              )}
              <label className="flex items-center gap-1 text-xs text-[var(--brand-primary)] cursor-pointer">
                <Upload className="w-4 h-4" />
                {uploadingTriggerIndex === index ? 'Uploading…' : 'Upload image'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleTriggerImageUpload(index, file);
                  }}
                />
              </label>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addTrigger}>Add trigger</Button>
      </div>

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && event ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || !trimmedName || hasInvalidTriggerSource}>{saving ? 'Saving…' : 'Save Event'}</Button>
        </div>
      </div>
    </div>
  );
}
