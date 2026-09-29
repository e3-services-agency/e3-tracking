/**
 * Standard events: every Bloomreach standard event (seed from `src/domain/bloomreach.ts` plus this
 * project's `standard_event_additions_json`, D-26) with its mapping to a project Event (+ optional
 * Variant) and a field map editor (T-1-05). "Add standard event" appends a project addition.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { mergeStandardEvents, type StandardEventSeed } from '@/src/domain/bloomreach';
import { buildStandardEventRows, type StandardEventMappingLike } from '@/src/domain/standardEventRows';

type MappingRow = StandardEventMappingLike;

interface EventOption {
  id: string;
  name: string;
}

interface VariantOption {
  id: string;
  name: string;
}

interface LinkedPropertyOption {
  property_id: string;
  property: { name: string };
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function StandardEvents() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [additions, setAdditions] = useState<StandardEventSeed[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [allVariants, setAllVariants] = useState<VariantOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Tracks every load from the moment it starts (fix round re-sweep 02:16 FAIL: SPA navigation
  // showed a dash for every row for a moment before the mapping fetch resolved). Starts `true`
  // since the very first render already has a load about to run (the effect below fires
  // unconditionally on mount/activeProjectId change).
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newFields, setNewFields] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [addKeyError, setAddKeyError] = useState<string | null>(null);

  // `loadTokenRef` guards against a fetch race across project switches or overlapping SPA
  // navigations (fix round FAIL-1 observation, T-1-07 merge QA's "transient uuids"): each call to
  // `load()` stamps a token before starting its four fetches, and only applies its results if it is
  // still the *latest* call by the time they resolve. Without this, an in-flight load for a
  // previous/stale project id could resolve after a newer one and silently overwrite fresh state
  // (e.g. `mappings` from a project with no mappings replacing the current project's, showing a
  // dash for every row) or mix `events`/`mappings` from two different projects.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) {
      setIsLoading(false);
      return;
    }
    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setLoadError(null);
    const [projectRes, mappingsRes, eventsRes, variantsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/standard-event-mappings`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/variants`),
    ]);
    const [projectData, mappingsData, eventsData, variantsData] = await Promise.all([
      parseJson(projectRes),
      parseJson(mappingsRes),
      parseJson(eventsRes),
      parseJson(variantsRes),
    ]);
    if (token !== loadTokenRef.current) return; // a newer load() has since started; discard this one
    if (projectRes.ok && Array.isArray(projectData.standard_event_additions_json)) {
      setAdditions(projectData.standard_event_additions_json);
    }
    // A 200 whose body isn't the expected array shape (unreadable body -> parseJson's `{}`, or a
    // genuinely wrong shape) is an error, never a silent empty list (reviewer PASS finding 1 on
    // 7de9a5b: this exact path reproduced FAIL-1's "mapped event/variant show dashes" with a 200
    // and no console output).
    let shapeError = false;
    if (mappingsRes.ok) {
      if (Array.isArray(mappingsData)) setMappings(mappingsData);
      else shapeError = true;
    }
    if (eventsRes.ok) {
      if (Array.isArray(eventsData)) setEvents(eventsData.map((e: any) => ({ id: e.id, name: e.name })));
      else shapeError = true;
    }
    if (variantsRes.ok) {
      if (Array.isArray(variantsData)) setAllVariants(variantsData.map((v: any) => ({ id: v.id, name: v.name })));
      else shapeError = true;
    }
    if (shapeError) {
      console.error('Unexpected standard-event-mappings response shape', { mappingsData, eventsData, variantsData });
      setLoadError('Unexpected response');
    }
    setIsLoading(false);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const standardEvents = useMemo(() => mergeStandardEvents(additions), [additions]);
  const rows = useMemo(
    () => buildStandardEventRows(standardEvents, mappings, events, allVariants),
    [standardEvents, mappings, events, allVariants]
  );
  const mappingByKey = useMemo(() => new Map(mappings.map((m) => [m.standard_event, m])), [mappings]);

  const addStandardEvent = async () => {
    const key = newKey.trim();
    if (!key || !activeProjectId) return;
    const fields = newFields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    if (fields.length === 0) {
      setAddKeyError('At least one field is required (comma-separated, snake_case).');
      return;
    }
    setAddingKey(true);
    setAddKeyError(null);
    try {
      // Always send the addition and let the backend validate (fix round WARNING 3): a
      // client-side "already exists" pre-check used to silently no-op for a seed-key collision
      // (send the unchanged array, get a 200 back, nothing visibly happens); the DAL now rejects
      // a seed or duplicate key with 400 STANDARD_EVENT_EXISTS, surfaced below instead.
      const next = [...additions, { key, fields }];
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ standard_event_additions_json: next }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setAddKeyError(typeof data?.error === 'string' ? data.error : 'Failed to add standard event.');
        return;
      }
      setAdditions(Array.isArray(data.standard_event_additions_json) ? data.standard_event_additions_json : next);
      setNewKey('');
      setNewFields('');
    } finally {
      setAddingKey(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">Standard events</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bloomreach standard events (seed + project additions, D-26) mapped to a project event and variant.
        </p>
      </PageHeader>

      <PageBody className="space-y-6">
        <div className="bg-white rounded-lg border shadow-sm p-4 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-gray-700">Key</label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. loyalty_scan" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-gray-700">Fields (comma-separated)</label>
            <Input value={newFields} onChange={(e) => setNewFields(e.target.value)} placeholder="card_id, points" />
          </div>
          <Button type="button" variant="outline" onClick={() => void addStandardEvent()} disabled={!newKey.trim() || addingKey}>
            {addingKey ? 'Adding…' : 'Add standard event'}
          </Button>
        </div>
        {addKeyError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{addKeyError}</div>}
        {loadError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</div>}

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Standard event</th>
                <th className="px-6 py-3 font-medium text-gray-500">Fields</th>
                <th className="px-6 py-3 font-medium text-gray-500">Mapped event</th>
                <th className="px-6 py-3 font-medium text-gray-500">Variant</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => { setSelectedKey(row.key); setIsSheetOpen(true); }}
                >
                  <td className="px-6 py-4 font-medium text-gray-900 font-mono">{row.key}</td>
                  <td className="px-6 py-4 text-gray-500">{row.fieldCount}</td>
                  <td className="px-6 py-4 text-gray-500">{isLoading ? 'Loading…' : row.mappedEventName ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono">{isLoading ? 'Loading…' : row.mappedVariantName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={`Map "${selectedKey ?? ''}"`}>
        {selectedKey && activeProjectId && (
          <StandardEventMappingEditor
            projectId={activeProjectId}
            standardEvent={selectedKey}
            fields={standardEvents.find((s) => s.key === selectedKey)?.fields ?? []}
            events={events}
            existing={mappingByKey.get(selectedKey) ?? null}
            onSaved={async () => { await load(); setIsSheetOpen(false); }}
            onClose={() => setIsSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

function StandardEventMappingEditor({
  projectId,
  standardEvent,
  fields,
  events,
  existing,
  onSaved,
  onClose,
}: {
  projectId: string;
  standardEvent: string;
  fields: string[];
  events: EventOption[];
  existing: MappingRow | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [eventId, setEventId] = useState(existing?.event_id ?? '');
  const [variantId, setVariantId] = useState(existing?.variant_id ?? '');
  const [fieldMap, setFieldMap] = useState<Record<string, string | null>>(existing?.field_map_json ?? {});
  const [linkedProperties, setLinkedProperties] = useState<LinkedPropertyOption[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setLinkedProperties([]);
      setVariants([]);
      return;
    }
    (async () => {
      const [eventRes, variantsRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}`),
        fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/variants`),
      ]);
      const eventData = await parseJson(eventRes);
      if (eventRes.ok) setLinkedProperties(Array.isArray(eventData.properties) ? eventData.properties : []);
      const variantsData = await parseJson(variantsRes);
      if (variantsRes.ok) setVariants(Array.isArray(variantsData) ? variantsData : []);
    })();
  }, [projectId, eventId]);

  const handleSave = async () => {
    if (!eventId) {
      setSaveError('An event is required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/standard-event-mappings/${standardEvent}`, {
        method: 'PUT',
        body: JSON.stringify({ event_id: eventId, variant_id: variantId || null, field_map_json: fieldMap }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save mapping.');
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/standard-event-mappings/${standardEvent}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Event</label>
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); setVariantId(''); setFieldMap({}); }} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">Select an event…</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>
      {eventId && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Variant (optional)</label>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">Whole event (no filter)</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}
      {eventId && fields.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Field map</label>
          <div className="space-y-1">
            {fields.map((field) => (
              <div key={field} className="flex items-center gap-2 text-xs">
                <span className="w-32 font-mono text-gray-600">{field}</span>
                <select
                  value={fieldMap[field] ?? ''}
                  onChange={(e) => setFieldMap((prev) => ({ ...prev, [field]: e.target.value || null }))}
                  className="h-8 flex-1 rounded border border-gray-300 px-2"
                >
                  <option value="">—</option>
                  {linkedProperties.map((p) => <option key={p.property_id} value={p.property_id}>{p.property.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}
      <div className="pt-4 border-t flex justify-between">
        {existing ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>Remove mapping</Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !eventId} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save mapping
          </Button>
        </div>
      </div>
    </div>
  );
}
