/**
 * Consent categories: plain table + form against `/api/projects/:projectId/consent-categories`
 * (plan "Target data model" section ConsentCategory; T-1-06). `standard_key` is picked from the
 * `bloomreach.ts` seed plus this project's `consent_key_additions_json` (D-26); the "add standard
 * consent key" form below the picker appends to that project column.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { ENTITY_STATUSES } from '@/src/domain/enums';
import { STANDARD_CONSENT_KEYS, mergeConsentKeys } from '@/src/domain/bloomreach';
import { HistorySection } from '@/src/features/history/HistorySection';

interface ConsentCategoryRow {
  id: string;
  name: string;
  description: string | null;
  standard_key: string | null;
  status: string | null;
  sort_order: number;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function ConsentCategories() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [categories, setCategories] = useState<ConsentCategoryRow[]>([]);
  const [consentKeyAdditions, setConsentKeyAdditions] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [newStandardKey, setNewStandardKey] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [addKeyError, setAddKeyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const [categoriesRes, projectRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/consent-categories`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`),
    ]);
    const categoriesData = await parseJson(categoriesRes);
    if (categoriesRes.ok) setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    const projectData = await parseJson(projectRes);
    if (projectRes.ok && Array.isArray(projectData.consent_key_additions_json)) {
      setConsentKeyAdditions(projectData.consent_key_additions_json);
    }
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const availableStandardKeys = mergeConsentKeys(consentKeyAdditions);

  const move = async (index: number, direction: -1 | 1) => {
    if (!activeProjectId) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    setCategories(reordered);
    setReorderError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/consent-categories/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
    });
    if (!res.ok) {
      const data = await parseJson(res);
      setReorderError(typeof data?.error === 'string' ? data.error : 'Failed to reorder.');
      await load();
    }
  };

  const addStandardKey = async () => {
    const key = newStandardKey.trim();
    if (!key || !activeProjectId) return;
    setAddingKey(true);
    setAddKeyError(null);
    try {
      const next = availableStandardKeys.includes(key) ? consentKeyAdditions : [...consentKeyAdditions, key];
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ consent_key_additions_json: next }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setAddKeyError(typeof data?.error === 'string' ? data.error : 'Failed to add standard key.');
        return;
      }
      setConsentKeyAdditions(Array.isArray(data.consent_key_additions_json) ? data.consent_key_additions_json : next);
      setNewStandardKey('');
    } finally {
      setAddingKey(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Consent categories</h1>
          <p className="text-sm text-gray-500 mt-1">
            Client consent categories mapped from Bloomreach's standard consent keys.
          </p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Consent Category
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-6">
        <div className="bg-white rounded-lg border shadow-sm p-4 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-gray-700">Add a standard consent key</label>
            <Input
              value={newStandardKey}
              onChange={(e) => setNewStandardKey(e.target.value)}
              placeholder="e.g. vip_club (industry-specific keys beyond the Bloomreach seed)"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void addStandardKey()} disabled={!newStandardKey.trim() || addingKey}>
            {addingKey ? 'Adding…' : 'Add standard key'}
          </Button>
        </div>
        {addKeyError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{addKeyError}</div>}

        {reorderError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{reorderError}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500 w-20">Order</th>
                <th className="px-6 py-3 font-medium text-gray-500">Client category</th>
                <th className="px-6 py-3 font-medium text-gray-500">Standard key</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((c, index) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void move(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => void move(index, 1)} disabled={index === categories.length - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900 cursor-pointer" onClick={() => { setSelectedId(c.id); setIsCreating(false); setIsSheetOpen(true); }}>{c.name}</td>
                  <td className="px-6 py-4 text-gray-500">{c.standard_key ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{c.status ?? '—'}</td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No consent categories found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Consent Category' : 'Edit Consent Category'}>
        <ConsentCategoryEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          categoryId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          availableStandardKeys={availableStandardKeys}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function ConsentCategoryEditor({
  categoryId,
  projectId,
  availableStandardKeys,
  onSaved,
  onClose,
}: {
  categoryId: string | null;
  projectId: string;
  availableStandardKeys: string[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const isCreating = categoryId === null;
  const [loading, setLoading] = useState(!isCreating);
  const [category, setCategory] = useState<ConsentCategoryRow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [standardKey, setStandardKey] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !categoryId) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/consent-categories/${categoryId}`);
      const data = await parseJson(res);
      if (res.ok) {
        setCategory(data);
        setName(data.name ?? '');
        setDescription(data.description ?? '');
        setStandardKey(data.standard_key ?? '');
        setStatus(data.status ?? '');
      } else {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to load consent category.');
      }
      setLoading(false);
    })();
  }, [projectId, categoryId]);

  const trimmedName = name.trim();

  const handleSave = async () => {
    if (!trimmedName || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        description: description.trim() || null,
        standard_key: standardKey || null,
        status: status || null,
      };
      const url = isCreating
        ? `${API_BASE}/api/projects/${projectId}/consent-categories`
        : `${API_BASE}/api/projects/${projectId}/consent-categories/${categoryId}`;
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
    if (!category || !projectId) return;
    if (!window.confirm(`Delete consent category "${category.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/consent-categories/${category.id}`, { method: 'DELETE' });
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
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Client category</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. brand_consent" />
        {!trimmedName && <p className="text-xs text-red-600">Name is required.</p>}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Standard key</label>
        <select value={standardKey} onChange={(e) => setStandardKey(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">—</option>
          {availableStandardKeys.map((k) => (
            <option key={k} value={k}>
              {k}{!STANDARD_CONSENT_KEYS.includes(k) ? ' (project addition)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <option value="">—</option>
          {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && category && (
        <HistorySection projectId={projectId} entityType="consent_category" entityId={category.id} />
      )}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && category ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || !trimmedName}>{saving ? 'Saving…' : 'Save Consent Category'}</Button>
        </div>
      </div>
    </div>
  );
}
