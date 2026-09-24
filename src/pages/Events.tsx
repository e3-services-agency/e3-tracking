/**
 * Events: table + plain editor against `/api/projects/:projectId/events` (D-16). Linked
 * properties are edited as the full ordered list (`PUT /events/:id/properties`); role/required
 * badges and allowed-values editors come in T-1-04. Trigger images upload through the local
 * FileStore (D-14) and render from `GET /api/projects/:id/files/*`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Upload } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, EVENT_STATUSES, ORIGIN_TYPES, EVENT_PROPERTY_ROLES, ENTITY_STATUSES } from '@/src/domain/enums';

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
  event_type: string;
  owner_business: string | null;
  owner_technical: string | null;
  priority: string | null;
  status: string;
  not_suitable_for: string | null;
  agent_instructions: string | null;
  tags_json: string[];
  triggers_json: TriggerEntry[];
  attached_property_count?: number;
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
}

interface EventPropertyLink {
  property_id: string;
  required: boolean;
  role: string;
  priority: string | null;
  status: string | null;
  source_id: string | null;
  payload_key: string | null;
  property: PropertyRow;
}

interface SourceRow {
  id: string;
  name: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function Events() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Tracking plan events.</p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Event
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Type</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((ev) => (
                <tr key={ev.id} onClick={() => { setSelectedId(ev.id); setIsCreating(false); setIsSheetOpen(true); }} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-gray-900">{ev.name}</td>
                  <td className="px-6 py-4 text-gray-500">{ev.event_type}</td>
                  <td className="px-6 py-4 text-gray-500">{ev.status}</td>
                  <td className="px-6 py-4 text-gray-500">{ev.attached_property_count ?? 0}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No events found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
  const [links, setLinks] = useState<EventPropertyLink[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyRow[]>([]);
  const [allSources, setAllSources] = useState<SourceRow[]>([]);
  const [addPropertyId, setAddPropertyId] = useState('');

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [page, setPage] = useState('');
  const [triggerText, setTriggerText] = useState('');
  const [grain, setGrain] = useState('');
  const [identityNote, setIdentityNote] = useState('');
  const [eventType, setEventType] = useState('custom');
  const [ownerBusiness, setOwnerBusiness] = useState('');
  const [ownerTechnical, setOwnerTechnical] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('planned');
  const [notSuitableFor, setNotSuitableFor] = useState('');
  const [agentInstructions, setAgentInstructions] = useState('');
  const [triggers, setTriggers] = useState<TriggerEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingTriggerIndex, setUploadingTriggerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const propsRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties`);
      const propsData = await parseJson(propsRes);
      if (propsRes.ok) setAllProperties(Array.isArray(propsData) ? propsData : []);

      const sourcesRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/sources`);
      const sourcesData = await parseJson(sourcesRes);
      if (sourcesRes.ok) setAllSources(Array.isArray(sourcesData) ? sourcesData : []);

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
          setEventType(ev.event_type);
          setOwnerBusiness(ev.owner_business ?? '');
          setOwnerTechnical(ev.owner_technical ?? '');
          setPriority(ev.priority ?? '');
          setStatus(ev.status);
          setNotSuitableFor(ev.not_suitable_for ?? '');
          setAgentInstructions(ev.agent_instructions ?? '');
          setTriggers(Array.isArray(ev.triggers_json) ? ev.triggers_json : []);
          setLinks(Array.isArray(data.properties) ? data.properties : []);
          setSourceIds(Array.isArray(data.source_ids) ? data.source_ids : []);
        }
        setLoading(false);
      }
    })();
  }, [projectId, eventId]);

  const addLink = () => {
    if (!addPropertyId) return;
    const property = allProperties.find((p) => p.id === addPropertyId);
    if (!property) return;
    setLinks((prev) => [
      ...prev,
      { property_id: property.id, required: false, role: 'normal', priority: null, status: null, source_id: null, payload_key: null, property },
    ]);
    setAddPropertyId('');
  };

  const removeLink = (propertyId: string) => setLinks((prev) => prev.filter((l) => l.property_id !== propertyId));
  const updateLink = (propertyId: string, patch: Partial<EventPropertyLink>) =>
    setLinks((prev) => prev.map((l) => (l.property_id === propertyId ? { ...l, ...patch } : l)));

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

  const handleSave = async () => {
    if (!name.trim() || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: name.trim(),
        business_name: businessName.trim() || null,
        description: description.trim() || null,
        purpose: purpose.trim() || null,
        page: page.trim() || null,
        trigger_text: triggerText.trim() || null,
        grain: grain.trim() || null,
        identity_note: identityNote.trim() || null,
        event_type: eventType,
        owner_business: ownerBusiness.trim() || null,
        owner_technical: ownerTechnical.trim() || null,
        priority: priority || null,
        status,
        not_suitable_for: notSuitableFor.trim() || null,
        agent_instructions: agentInstructions.trim() || null,
        source_ids: sourceIds,
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

      // Triggers (image/trigger cards) are saved via PATCH too, once the event exists.
      await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${savedEventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ triggers_json: triggers.length > 0 ? triggers : null }),
      });

      if (!isCreating) {
        await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${savedEventId}/properties`, {
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
              sort_order: i,
            })),
          }),
        });
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
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${event.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) await onSaved();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSource = (id: string) => setSourceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  const unattachedProperties = allProperties.filter((p) => !links.some((l) => l.property_id === p.id));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Name (snake_case)</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. purchase" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Business name</label>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Type</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {ORIGIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Purpose</label>
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Page</label>
          <Input value={page} onChange={(e) => setPage(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Trigger</label>
          <Input value={triggerText} onChange={(e) => setTriggerText(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Grain</label>
          <Input value={grain} onChange={(e) => setGrain(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Identity note</label>
        <Input value={identityNote} onChange={(e) => setIdentityNote(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Owner (business)</label>
          <Input value={ownerBusiness} onChange={(e) => setOwnerBusiness(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Owner (technical)</label>
          <Input value={ownerTechnical} onChange={(e) => setOwnerTechnical(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Not suitable for</label>
        <Input value={notSuitableFor} onChange={(e) => setNotSuitableFor(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Agent instructions</label>
        <Input value={agentInstructions} onChange={(e) => setAgentInstructions(e.target.value)} />
      </div>

      {allSources.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Sources</label>
          <div className="flex flex-wrap gap-2">
            {allSources.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1">
                <input type="checkbox" checked={sourceIds.includes(s.id)} onChange={() => toggleSource(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {!isCreating && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Linked properties</h3>
          {links.map((link) => (
            <div key={link.property_id} className="border rounded-md p-3 space-y-2 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900">{link.property.name}</span>
                <button type="button" onClick={() => removeLink(link.property_id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={link.required} onChange={(e) => updateLink(link.property_id, { required: e.target.checked })} />
                  Required
                </label>
                <select value={link.role} onChange={(e) => updateLink(link.property_id, { role: e.target.value })} className="h-8 rounded border border-gray-300 px-2">
                  {EVENT_PROPERTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={link.status ?? ''} onChange={(e) => updateLink(link.property_id, { status: e.target.value || null })} className="h-8 rounded border border-gray-300 px-2">
                  <option value="">status —</option>
                  {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Input
                  value={link.payload_key ?? ''}
                  onChange={(e) => updateLink(link.property_id, { payload_key: e.target.value || null })}
                  placeholder="payload key override"
                  className="h-8 w-40 text-xs"
                />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <select value={addPropertyId} onChange={(e) => setAddPropertyId(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm flex-1">
              <option value="">Select a property to attach…</option>
              {unattachedProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button type="button" variant="outline" onClick={addLink} disabled={!addPropertyId}>Attach</Button>
          </div>
        </div>
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
          <Button onClick={() => void handleSave()} disabled={saving || deleting}>{saving ? 'Saving…' : 'Save Event'}</Button>
        </div>
      </div>
    </div>
  );
}
