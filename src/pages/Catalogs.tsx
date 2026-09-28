/**
 * Catalogs: table + plain editor with nested fields against
 * `/api/projects/:projectId/catalogs` (kept, extended per the plan).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, ENTITY_STATUSES, CATALOG_MAPPING_ROLES } from '@/src/domain/enums';
import { CATALOG_MAIN_COLUMNS } from '@/src/domain/bloomreach';
import { HistorySection } from '@/src/features/history/HistorySection';

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
  client_field_name: string | null;
  bloomreach_column: string | null;
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
                <EmptyState
                  colSpan={3}
                  message="No catalogs yet. Add one to describe a Bloomreach catalog (products, articles, and so on)."
                  actionLabel="Add Catalog"
                  onAction={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }}
                />
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

  const patchField = async (fieldId: string, patch: Record<string, unknown>): Promise<string | null> => {
    if (!projectId || !catalogId) return 'No catalog selected.';
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}/fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      return typeof data?.error === 'string' ? data.error : 'Failed to update field.';
    }
    setFields((prev) => prev.map((f) => (f.id === fieldId ? data : f)));
    return null;
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
            {CATALOG_MAPPING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
            <CatalogFieldRowEditor key={f.id} field={f} onPatch={patchField} onRemove={removeField} />
          ))}
          <div className="flex gap-2">
            <Input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="Field name" className="flex-1" />
            <Button type="button" variant="outline" onClick={addField} disabled={!newFieldName.trim()}>Add field</Button>
          </div>
        </div>
      )}

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && catalog && (
        <HistorySection projectId={projectId} entityType="catalog" entityId={catalog.id} parentEntityId={catalog.id} />
      )}

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

/**
 * One catalog field row: inline rename (blur/Enter commits, a duplicate name surfaces the DAL's
 * 409 ConflictError message inline instead of silently reverting — qa-tester observation on
 * T-1-02), searchable/required checkboxes, client field name, and a Bloomreach column select
 * built from the `main_columns` seed (`src/domain/bloomreach.ts`).
 */
function CatalogFieldRowEditor({
  field,
  onPatch,
  onRemove,
}: {
  field: CatalogFieldRow;
  onPatch: (fieldId: string, patch: Record<string, unknown>) => Promise<string | null>;
  onRemove: (fieldId: string) => Promise<void>;
}) {
  const [name, setName] = useState(field.name);
  const [clientFieldName, setClientFieldName] = useState(field.client_field_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(field.name);
    setClientFieldName(field.client_field_name ?? '');
  }, [field.id, field.name, field.client_field_name]);

  const commitRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === field.name) {
      setName(field.name);
      return;
    }
    setBusy(true);
    const err = await onPatch(field.id, { name: trimmed });
    setBusy(false);
    if (err) {
      setError(err);
      setName(field.name);
    } else {
      setError(null);
    }
  };

  const commitClientFieldName = async () => {
    const trimmed = clientFieldName.trim();
    if (trimmed === (field.client_field_name ?? '')) return;
    setBusy(true);
    const err = await onPatch(field.id, { client_field_name: trimmed || null });
    setBusy(false);
    if (err) setError(err);
  };

  const toggle = async (key: 'is_searchable' | 'is_required', value: boolean) => {
    setBusy(true);
    const err = await onPatch(field.id, { [key]: value });
    setBusy(false);
    if (err) setError(err);
  };

  const setBloomreachColumn = async (value: string) => {
    setBusy(true);
    const err = await onPatch(field.id, { bloomreach_column: value || null });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="border rounded-md px-3 py-2 bg-gray-50 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          disabled={busy}
          className="flex-1"
        />
        <button type="button" onClick={() => void onRemove(field.id)} className="text-red-500 hover:text-red-700" title="Remove field">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={field.is_searchable}
            onChange={(e) => void toggle('is_searchable', e.target.checked)}
            disabled={busy}
          />
          Searchable
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={field.is_required}
            onChange={(e) => void toggle('is_required', e.target.checked)}
            disabled={busy}
          />
          Required
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Client field name</label>
          <Input
            value={clientFieldName}
            onChange={(e) => setClientFieldName(e.target.value)}
            onBlur={() => void commitClientFieldName()}
            disabled={busy}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Bloomreach column</label>
          <select
            value={field.bloomreach_column ?? ''}
            onChange={(e) => void setBloomreachColumn(e.target.value)}
            disabled={busy}
            className="w-full h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
          >
            <option value="">—</option>
            {CATALOG_MAIN_COLUMNS.map((col) => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
