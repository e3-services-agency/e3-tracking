import { StatusBadge } from '@/src/components/ui/badges';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
/**
 * Catalogs: table + plain editor with nested fields against
 * `/api/projects/:projectId/catalogs` (kept, extended per the plan).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, ENTITY_STATUSES, CATALOG_MAPPING_ROLES, CATALOG_KINDS, CATALOG_VERSIONS, CATALOG_SEARCHABLE_LIMIT, PROPERTY_DATA_TYPES } from '@/src/domain/enums';
import { catalogMarketLabel } from '@/src/domain/catalogs';
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
  /** D-61 (T-4-11B). */
  kind: string;
  /** T-4-23: properties looking up into this catalog's kind (GET /:id only). */
  looked_up_by?: { property_name: string; scope: string; field_name: string | null }[];
  market: string | null;
  language: string | null;
  version: string;
  live_at: string | null;
  searchable_snapshot_json: string[] | null;
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
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogs</h1>
          <p className="text-sm text-gray-500 mt-1">Product and lookup catalogs.</p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Catalog
        </Button>
      </PageHeader>

      <PageBody>
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Name" hintScope="Catalogs">Name</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Kind" hintScope="Catalogs">Kind</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Market / language" hintScope="Catalogs">Market / language</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Version" hintScope="Catalogs">Version</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Mapping role" hintScope="Catalogs">Mapping role</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Status" hintScope="Catalogs">Status</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {catalogs.map((c) => (
                <tr key={c.id} onClick={() => { setSelectedId(c.id); setIsCreating(false); setIsSheetOpen(true); }} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-gray-900"><span className="inline-flex items-center gap-1.5">{c.name}<CopyNameButton name={c.name} /></span></td>
                  <td className="px-6 py-4 text-gray-500">{c.kind}</td>
                  <td className="px-6 py-4 text-gray-500">{catalogMarketLabel(c.market, c.language) || '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{c.version}{c.live_at ? ' · live' : ''}</td>
                  <td className="px-6 py-4 text-gray-500">{c.mapping_role ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
              {catalogs.length === 0 && (
                <EmptyState
                  colSpan={6}
                  message="No catalogs yet. Add one to describe a Bloomreach catalog (products, articles, and so on)."
                  actionLabel="Add Catalog"
                  onAction={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); }}
                />
              )}
            </tbody>
          </table>
        </div>
      </PageBody>

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
  const [kind, setKind] = useState('');
  const [market, setMarket] = useState('');
  const [language, setLanguage] = useState('');
  const [version, setVersion] = useState('v1');
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
        setKind(data.kind ?? 'other');
        setMarket(data.market ?? '');
        setLanguage(data.language ?? '');
        setVersion(data.version ?? 'v1');
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
        // D-61: on create an unset kind is derived from the mapping role on the server.
        ...(kind ? { kind } : {}),
        market: market.trim() || null,
        language: language.trim() || null,
        version,
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

  const setLive = async (live: boolean) => {
    if (!projectId || !catalogId) return;
    setSaveError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}/live`, {
      method: 'POST',
      body: JSON.stringify({ live }),
    });
    const data = await parseJson(res);
    if (res.ok) setCatalog((prev) => (prev ? { ...prev, ...data } : prev));
    else setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to update live state.');
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
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Name" hintScope="Catalogs">Name</FieldLabel>
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          {name.trim() && <CopyNameButton name={name.trim()} />}
        </div>
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Description" hintScope="Catalogs">Description</FieldLabel>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Owner" hintScope="Catalogs">Owner</FieldLabel>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Mapping role" hintScope="Catalogs">Mapping role</FieldLabel>
          <select value={mappingRole} onChange={(e) => setMappingRole(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">—</option>
            {CATALOG_MAPPING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Kind" hintScope="Catalogs">Kind</FieldLabel>
          <EnumSelect kind="catalog_kind" values={CATALOG_KINDS} emptyLabel={isCreating ? 'Automatic (from mapping role)' : undefined} value={kind} onChange={(e) => setKind(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
          <p className="text-xs text-gray-500">Catalogs of the same kind (one per market) must share one schema.</p>
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Version" hintScope="Catalogs">Version</FieldLabel>
          <select value={version} onChange={(e) => setVersion(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {CATALOG_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <p className="text-xs text-gray-500">On v1 the searchable fields are fixed once the catalog is live.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Market" hintScope="Catalogs">Market</FieldLabel>
          <Input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. GB" />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Language" hintScope="Catalogs">Language</FieldLabel>
          <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. en-GB" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Priority" hintScope="Catalogs">Priority</FieldLabel>
          <EnumSelect kind="priority" values={PRIORITIES} emptyLabel="—" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Status" hintScope="Catalogs">Status</FieldLabel>
          <EnumSelect kind="status" values={ENTITY_STATUSES} emptyLabel="—" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      {!isCreating && (catalog?.looked_up_by ?? []).length > 0 && (
        <div className="space-y-1 border-t pt-4" data-testid="catalog-looked-up-by">
          <h3 className="text-sm font-semibold text-gray-900">
            {kind === 'product' || kind === 'variant' ? `Looked up by (all ${kind} catalogs)` : 'Looked up by'}
          </h3>
          <ul className="text-xs text-gray-700 list-disc pl-5">
            {(catalog?.looked_up_by ?? []).map((p) => (
              <li key={`${p.scope}:${p.property_name}`}>{p.property_name} ({p.scope}){p.field_name ? ` -> ${p.field_name}` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {!isCreating && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Fields</h3>
          {(() => {
            const searchableCount = fields.filter((f) => f.is_searchable).length;
            const keys = fields.filter((f) => f.is_lookup_key);
            return (
              <div className="text-xs text-gray-600 space-y-1" data-testid="catalog-field-summary">
                <p className={searchableCount > CATALOG_SEARCHABLE_LIMIT ? 'text-red-700' : searchableCount === CATALOG_SEARCHABLE_LIMIT ? 'text-amber-700' : undefined}>
                  Searchable fields: {searchableCount} of {CATALOG_SEARCHABLE_LIMIT}
                </p>
                <p>
                  Lookup key: {keys.length === 1 ? keys[0].name : keys.length === 0 ? 'none yet' : `${keys.length} fields, must be one`}.
                  The lookup key is the item_id column, which Jinja cannot read, because Jinja reads only catalog properties: add a regular product_id (or variant_id) field with the same value. If the key field already has that name, treat it as item_id (rename it) first.
                </p>
              </div>
            );
          })()}
          <div className="flex items-center gap-3 text-xs" data-testid="catalog-live">
            <span className="text-gray-600">
              {catalog?.live_at ? `Live since ${catalog.live_at.slice(0, 10)}; searchable snapshot: ${(catalog.searchable_snapshot_json ?? []).length} fields.` : 'Not marked live.'}
            </span>
            <Button type="button" variant="outline" onClick={() => void setLive(!catalog?.live_at)}>
              {catalog?.live_at ? 'Take off live' : 'Mark live'}
            </Button>
          </div>
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

  const patchSimple = async (patch: Record<string, unknown>) => {
    setBusy(true);
    const err = await onPatch(field.id, patch);
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
        <CopyNameButton name={field.name} />
        <button type="button" onClick={() => void onRemove(field.id)} className="text-red-500 hover:text-red-700" title="Remove field">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <FieldLabel className="text-xs text-gray-500" hint="Data type" hintScope="Catalogs">Data type</FieldLabel>
          <select
            value={field.data_type ?? 'string'}
            onChange={(e) => void patchSimple({ data_type: e.target.value })}
            disabled={busy}
            className="w-full h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
          >
            {[...new Set([...PROPERTY_DATA_TYPES, field.data_type ?? 'string'])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <FieldLabel className="flex items-center gap-2 text-xs text-gray-700 self-end pb-1" hintScope="Catalogs">
          <input type="checkbox" checked={field.is_lookup_key} onChange={(e) => void patchSimple({ is_lookup_key: e.target.checked })} disabled={busy} />
          Lookup key
        </FieldLabel>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel className="flex items-center gap-2 text-xs text-gray-700" hintScope="Catalogs">
          <input
            type="checkbox"
            checked={field.is_searchable}
            onChange={(e) => void toggle('is_searchable', e.target.checked)}
            disabled={busy}
          />
          Searchable
        </FieldLabel>
        <FieldLabel className="flex items-center gap-2 text-xs text-gray-700" hintScope="Catalogs">
          <input
            type="checkbox"
            checked={field.is_required}
            onChange={(e) => void toggle('is_required', e.target.checked)}
            disabled={busy}
          />
          Required
        </FieldLabel>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <FieldLabel className="text-xs text-gray-500" hint="Client field name" hintScope="Catalogs">Client field name</FieldLabel>
          <Input
            value={clientFieldName}
            onChange={(e) => setClientFieldName(e.target.value)}
            onBlur={() => void commitClientFieldName()}
            disabled={busy}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel className="text-xs text-gray-500" hint="Bloomreach column" hintScope="Catalogs">Bloomreach column</FieldLabel>
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
