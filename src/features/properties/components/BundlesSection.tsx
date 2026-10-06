/**
 * Property bundles section of the Properties page (T-4-24, item 9; D-26, D-63 "Add bundle").
 * Lists each bundle with its property count and the events using it (events that link every
 * property of the bundle), expands to its properties (name, type, kind), creates, renames, deletes
 * (409 `BUNDLE_IN_USE` shown as a message with a "Delete anyway" action) and edits membership with a
 * checkbox list. Simplified UI (D-07).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { KindBadge } from '@/src/components/ui/badges';
import { hintFor } from '@/src/components/ui/FieldHint';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

interface BundleListRow {
  id: string;
  name: string;
  description: string | null;
  property_ids: string[];
  used_by_events: { id: string; name: string }[];
}

interface BundleDetail extends BundleListRow {
  members: { id: string; name: string; data_type: string | null; kind: string | null }[];
}

interface PropertyOption {
  id: string;
  name: string;
  data_type: string;
  scope: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function BundlesSection({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const [bundles, setBundles] = useState<BundleListRow[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inUseId, setInUseId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [editingMembers, setEditingMembers] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const base = `${API_BASE}/api/projects/${projectId}`;

  const load = useCallback(async () => {
    const [bundleRes, propertyRes] = await Promise.all([
      fetchWithAuth(`${base}/bundles`),
      fetchWithAuth(`${base}/properties`),
    ]);
    const bundleData = await parseJson(bundleRes);
    const propertyData = await parseJson(propertyRes);
    if (bundleRes.ok) setBundles(Array.isArray(bundleData) ? bundleData : []);
    if (propertyRes.ok) setAllProperties(Array.isArray(propertyData) ? propertyData : []);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await fetchWithAuth(`${base}/bundles/${id}`);
      const data = await parseJson(res);
      if (res.ok) {
        setDetail(data);
        setRenameValue(data.name);
        setMemberIds(new Set(data.property_ids));
      } else {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load the bundle.');
      }
    },
    [base]
  );

  const refresh = async () => {
    await load();
    if (expandedId) await loadDetail(expandedId);
    onChanged?.();
  };

  const toggleExpand = async (id: string) => {
    setError(null);
    setInUseId(null);
    setEditingMembers(false);
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    await loadDetail(id);
  };

  const create = async () => {
    setError(null);
    const res = await fetchWithAuth(`${base}/bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDescription || null }),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Failed to create the bundle.');
      return;
    }
    setNewName('');
    setNewDescription('');
    await load();
    onChanged?.();
    setExpandedId(data.id);
    await loadDetail(data.id);
    setEditingMembers(true);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    const res = await fetchWithAuth(`${base}/bundles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Failed to save the bundle.');
      return false;
    }
    await refresh();
    return true;
  };

  const remove = async (id: string, force: boolean) => {
    setError(null);
    const res = await fetchWithAuth(`${base}/bundles/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
    if (res.status === 204) {
      setInUseId(null);
      setExpandedId(null);
      setDetail(null);
      await load();
      onChanged?.();
      return;
    }
    const data = await parseJson(res);
    if (res.status === 409 && data?.code === 'BUNDLE_IN_USE') setInUseId(id);
    setError(typeof data?.error === 'string' ? data.error : 'Failed to delete the bundle.');
  };

  const filteredOptions = useMemo(
    () => allProperties.filter((p) => !memberSearch.trim() || p.name.toLowerCase().includes(memberSearch.trim().toLowerCase())),
    [allProperties, memberSearch]
  );

  return (
    <div className="space-y-4" data-testid="bundles-section">
      <p className="text-sm text-gray-500">
        A bundle is a named group of properties you can add to an event in one step. An event "uses" a bundle when it
        links every property of it.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Name', 'Properties')}>New bundle name</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 w-64" placeholder="e.g. purchase_basics" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700" title={hintFor('Description')}>Description</label>
          <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="h-9 w-72" />
        </div>
        <Button onClick={() => void create()} disabled={!newName.trim()} className="gap-2">
          <Plus className="w-4 h-4" /> Add bundle
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center gap-3" role="alert">
          <span>{error}</span>
          {inUseId && (
            <Button variant="outline" onClick={() => void remove(inUseId, true)}>
              Delete anyway
            </Button>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500" title={hintFor('Name', 'Properties')}>Name</th>
              <th className="px-6 py-3 font-medium text-gray-500" title="How many properties the bundle contains.">Properties</th>
              <th className="px-6 py-3 font-medium text-gray-500" title="Events that link every property of this bundle.">Used by events</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bundles.map((b) => (
              <React.Fragment key={b.id}>
                <tr onClick={() => void toggleExpand(b.id)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    <span className="mr-2 text-xs text-gray-400">{expandedId === b.id ? '▾' : '▸'}</span>
                    {b.name}
                    {b.description && <span className="ml-2 text-xs font-normal text-gray-500">{b.description}</span>}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{b.property_ids.length}</td>
                  <td className="px-6 py-3 text-gray-600">
                    {b.used_by_events.length > 0 ? b.used_by_events.map((e) => e.name).join(', ') : '—'}
                  </td>
                </tr>
                {expandedId === b.id && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 bg-gray-50 space-y-3">
                      {!detail ? (
                        <div className="text-sm text-gray-500">Loading…</div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8 w-64 text-sm" aria-label="Bundle name" />
                            <Button
                              variant="outline"
                              disabled={!renameValue.trim() || renameValue.trim() === detail.name}
                              onClick={() => void patch(b.id, { name: renameValue })}
                            >
                              Rename
                            </Button>
                            <Button variant="outline" onClick={() => setEditingMembers((v) => !v)}>
                              {editingMembers ? 'Close membership editor' : 'Edit properties'}
                            </Button>
                            <Button variant="outline" onClick={() => void remove(b.id, false)} className="gap-1 text-red-700">
                              <Trash2 className="w-4 h-4" /> Delete
                            </Button>
                          </div>

                          {!editingMembers && (
                            <table className="w-full text-left text-sm bg-white border rounded">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="px-3 py-2 font-medium text-gray-500">Name</th>
                                  <th className="px-3 py-2 font-medium text-gray-500">Data type</th>
                                  <th className="px-3 py-2 font-medium text-gray-500">Type</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {detail.members.map((m) => (
                                  <tr key={m.id}>
                                    <td className="px-3 py-2 text-gray-900">{m.name}</td>
                                    <td className="px-3 py-2 text-gray-600">{m.data_type ?? '—'}</td>
                                    <td className="px-3 py-2"><KindBadge kind={m.kind} /></td>
                                  </tr>
                                ))}
                                {detail.members.length === 0 && (
                                  <tr>
                                    <td colSpan={3} className="px-3 py-3 text-gray-500">No properties yet. Use "Edit properties" to add some.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}

                          {editingMembers && (
                            <div className="space-y-2">
                              <Input
                                type="search"
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                placeholder="Filter properties"
                                aria-label="Filter properties"
                                className="h-8 w-64 text-sm"
                              />
                              <div className="max-h-64 overflow-y-auto rounded border bg-white p-2 grid grid-cols-2 gap-1">
                                {filteredOptions.map((p) => (
                                  <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={memberIds.has(p.id)}
                                      onChange={() =>
                                        setMemberIds((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(p.id)) next.delete(p.id);
                                          else next.add(p.id);
                                          return next;
                                        })
                                      }
                                    />
                                    {p.name} <span className="text-xs text-gray-400">{p.data_type}</span>
                                  </label>
                                ))}
                              </div>
                              <Button
                                onClick={async () => {
                                  if (await patch(b.id, { property_ids: [...memberIds] })) setEditingMembers(false);
                                }}
                              >
                                Save properties ({memberIds.size})
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {bundles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">No bundles yet. Add one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
