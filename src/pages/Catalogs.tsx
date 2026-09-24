/**
 * Catalogs: table + plain editor with nested fields against
 * `/api/projects/:projectId/catalogs` (kept, extended per the plan).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, ENTITY_STATUSES } from '@/src/domain/enums';

interface CatalogRow {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  mapping_role: string | null;
  priority: string | null;
  status: string | null;
}

interface CatalogFieldRow {
  id: string;
  catalog_id: string;
  name: string;
  data_type: string | null;
  is_lookup_key: boolean;
  is_searchable: boolean;
  is_required: boolean;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function Catalogs() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/catalogs`);
    const data = await parseJson(res);
    if (res.ok) setCatalogs(Array.isArray(data) ? data : []);
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogs</h1>
          <p className="text-sm text-gray-500 mt-1">Product and lookup catalogs.</p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Catalog
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Mapping role</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {catalogs.map((c) => (
                <tr key={c.id} onClick={() => { setSelectedId(c.id); setIsCreating(false); setIsSheetOpen(true); }} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-gray-500">{c.mapping_role ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{c.status ?? '—'}</td>
                </tr>
              ))}
              {catalogs.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-gray-500">No catalogs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Catalog' : 'Edit Catalog'}>
        <CatalogEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          catalogId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function CatalogEditor({
  catalogId,
  projectId,
  onSaved,
  onClose,
}: {
  catalogId: string | null;
  projectId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const isCreating = catalogId === null;
  const [loading, setLoading] = useState(!isCreating);
  const [catalog, setCatalog] = useState<CatalogRow | null>(null);
  const [fields, setFields] = useState<CatalogFieldRow[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [mappingRole, setMappingRole] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !catalogId) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}`);
      const data = await parseJson(res);
      if (res.ok) {
        setCatalog(data);
        setName(data.name ?? '');
        setDescription(data.description ?? '');
        setOwner(data.owner ?? '');
        setMappingRole(data.mapping_role ?? '');
        setPriority(data.priority ?? '');
        setStatus(data.status ?? '');
        setFields(Array.isArray(data.fields) ? data.fields : []);
      } else {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to load catalog.');
      }
      setLoading(false);
    })();
  }, [projectId, catalogId]);

  const trimmedName = name.trim();
  const nameError = trimmedName ? null : 'Name is required.';

  const handleSave = async () => {
    if (!trimmedName || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        description: description.trim() || null,
        owner: owner.trim() || null,
        mapping_role: mappingRole || null,
        priority: priority || null,
        status: status || null,
      };
      const url = isCreating ? `${API_BASE}/api/projects/${projectId}/catalogs` : `${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}`;
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
    if (!catalog || !projectId) return;
    if (!window.confirm(`Delete catalog "${catalog.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalog.id}`, { method: 'DELETE' });
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

  const addField = async () => {
    if (!newFieldName.trim() || !projectId || !catalogId) return;
    setSaveError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}/fields`, {
      method: 'POST',
      body: JSON.stringify({ name: newFieldName.trim() }),
    });
    const data = await parseJson(res);
    if (res.ok) {
      setFields((prev) => [...prev, data]);
      setNewFieldName('');
    } else {
      setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to add field.');
    }
  };

  const removeField = async (fieldId: string) => {
    if (!projectId || !catalogId) return;
    setSaveError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}/fields/${fieldId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } else {
      const data = await parseJson(res);
      setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to remove field.');
    }
  };

  if (loading) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Owner</label>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Mapping role</label>
          <select value={mappingRole} onChange={(e) => setMappingRole(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            <option value="main">main</option>
            <option value="variant">variant</option>
          </select>
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
            <option value="">—</option>
            {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {!isCreating && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Fields</h3>
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-gray-50">
              <span className="text-sm text-gray-900">{f.name}</span>
              <button type="button" onClick={() => removeField(f.id)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="Field name" className="flex-1" />
            <Button type="button" variant="outline" onClick={addField} disabled={!newFieldName.trim()}>Add field</Button>
          </div>
        </div>
      )}

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && catalog ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || !trimmedName}>{saving ? 'Saving…' : 'Save Catalog'}</Button>
        </div>
      </div>
    </div>
  );
}
