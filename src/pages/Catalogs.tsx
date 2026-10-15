import { CommentsPanel } from '@/src/features/comments/CommentsPanel';
import { useStore } from '@/src/store';
import { TargetCollaboration, useProjectComments } from '@/src/features/comments/TargetCollaboration';
import { CatalogsTable, catalogRowsFromInternal } from '@/src/features/views';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel } from '@/src/components/ui/FieldHint';
/**
 * Catalogs: table + plain editor with nested fields against
 * `/api/projects/:projectId/catalogs` (kept, extended per the plan).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { PRIORITIES, ENTITY_STATUSES, CATALOG_MAPPING_ROLES, CATALOG_KINDS, CATALOG_VERSIONS, CATALOG_SEARCHABLE_LIMIT } from '@/src/domain/enums';
import { validateCatalogFields } from '@/src/domain/catalogs';
import { FieldTableEditor, type CatalogFieldDraft } from '@/src/features/catalogs/FieldTableEditor';
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

function toDraft(f: CatalogFieldRow): CatalogFieldDraft {
  return {
    key: f.id,
    id: f.id,
    name: f.name,
    data_type: f.data_type ?? 'string',
    is_lookup_key: f.is_lookup_key,
    is_searchable: f.is_searchable,
    is_required: f.is_required,
    client_field_name: f.client_field_name ?? '',
    bloomreach_column: f.bloomreach_column ?? '',
  };
}

function stripKey(d: CatalogFieldDraft) {
  const { key: _key, ...rest } = d;
  return rest;
}

function draftBody(d: CatalogFieldDraft) {
  return {
    name: d.name.trim(),
    data_type: d.data_type ?? 'string',
    is_lookup_key: d.is_lookup_key,
    is_searchable: d.is_searchable,
    is_required: d.is_required,
    client_field_name: d.client_field_name.trim() || null,
    bloomreach_column: d.bloomreach_column || null,
  };
}

/** The PATCH body for what changed between the saved row and its draft, or null when nothing did. */
function diffDraft(saved: CatalogFieldRow, d: CatalogFieldDraft): Record<string, unknown> | null {
  const next = draftBody(d);
  const was = draftBody(toDraft(saved));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] !== was[k]) out[k] = next[k];
  return Object.keys(out).length ? out : null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function Catalogs() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const collaboration = useProjectComments(activeProjectId);
  const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestedEntity = useStore((s) => s.selectedItemIdToEdit);
  const clearRequestedEntity = useStore((s) => s.setSelectedItemIdToEdit);
  useEffect(() => { if (requestedEntity && catalogs.some((r) => r.id === requestedEntity)) { setSelectedId(requestedEntity); setIsCreating(false); setIsSheetOpen(true); clearRequestedEntity(null); } },[requestedEntity,catalogs,clearRequestedEntity]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const dirtyRef = useRef(false);
  const closeSheet = () => {
    if (dirtyRef.current && !window.confirm('Discard unsaved field changes?')) return;
    dirtyRef.current = false;
    setIsSheetOpen(false);
  };

  const viewRows = useMemo(() => catalogRowsFromInternal(catalogs), [catalogs]);

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
        <CatalogsTable
          rows={viewRows}
          onOpen={(row) => { setSelectedId(row.id); setIsCreating(false); setIsSheetOpen(true); }}
          commentsInActions
          commentCount={(row) => collaboration.rows.filter((r) => r.entity_type === 'catalog' && r.entity_id === row.id).length}
          rowActions={(row) => <TargetCollaboration api={{ mode: 'internal', projectId: activeProjectId }} entityType="catalog" entityId={row.id} label={row.name} rows={collaboration.rows} onChanged={collaboration.reload} />}
          empty={{
            message: 'No catalogs yet. Add one to describe a Bloomreach catalog (products, articles, and so on).',
            actionLabel: 'Add Catalog',
            onAction: () => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); },
          }}
        />
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={closeSheet} title={isCreating ? 'Create Catalog' : 'Edit Catalog'}>
        <CatalogEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          catalogId={isCreating ? null : selectedId}
          projectId={activeProjectId}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={closeSheet}
          dirtyRef={dirtyRef}
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
  dirtyRef,
}: {
  catalogId: string | null;
  projectId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
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
  const [draft, setDraft] = useState<CatalogFieldDraft[]>([]);
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
        const rows: CatalogFieldRow[] = Array.isArray(data.fields) ? data.fields : [];
        setFields(rows);
        setDraft(rows.map(toDraft));
      } else {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to load catalog.');
      }
      setLoading(false);
    })();
  }, [projectId, catalogId]);

  const trimmedName = name.trim();
  const nameError = trimmedName ? null : 'Name is required.';
  const validation = validateCatalogFields(draft);
  const dirty = JSON.stringify(draft.map(stripKey)) !== JSON.stringify(fields.map(toDraft).map(stripKey));
  const referencedNames = new Set((catalog?.looked_up_by ?? []).map((p) => p.field_name).filter((n): n is string => !!n));
  const linkedBy = new Map<string, string[]>();
  for (const p of catalog?.looked_up_by ?? []) if (p.field_name) linkedBy.set(p.field_name, [...(linkedBy.get(p.field_name) ?? []), `${p.property_name} (${p.scope})`]);
  // A rename whose new name is another saved row's current name only works in a certain order: ask for two saves.
  const savedById = new Map(fields.map((f) => [f.id, f.name]));
  const renameClash = draft.filter((d) => d.id && savedById.get(d.id) !== d.name.trim()).some((d) => [...savedById].some(([id, n]) => id !== d.id && n === d.name.trim() && draft.some((o) => o.id === id && o.name.trim() !== n)));
  useEffect(() => { dirtyRef.current = dirty; return () => { dirtyRef.current = false; }; }, [dirty, dirtyRef]);
  const blockReasons = [...(trimmedName ? [] : ['The catalog has no name.']), ...(isCreating ? [] : validation.reasons), ...(renameClash ? ['A rename takes a name another field still has: rename in two saves.'] : [])];

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
      if (!isCreating) {
        const fieldError = await applyFieldChanges();
        if (fieldError) {
          setSaveError(fieldError);
          return;
        }
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  /** Saves the table: deletes, edits, creates, then the order. On a failure reloads the saved state. */
  const applyFieldChanges = async (): Promise<string | null> => {
    const base = `${API_BASE}/api/projects/${projectId}/catalogs/${catalogId}`;
    const fail = async (msg: string) => {
      const res = await fetchWithAuth(base);
      const data = await parseJson(res);
      if (res.ok && Array.isArray(data.fields)) {
        setFields(data.fields);
        setDraft(data.fields.map(toDraft));
      }
      return `${msg} Fields saved before the error were kept; the table was reloaded.`;
    };
    const send = async (url: string, method: string, body?: unknown) => {
      const res = await fetchWithAuth(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await parseJson(res);
      return { ok: res.ok, data };
    };
    const kept = new Set(draft.filter((d) => d.id).map((d) => d.id));
    for (const f of fields.filter((f) => !kept.has(f.id))) {
      const r = await send(`${base}/fields/${f.id}`, 'DELETE');
      if (!r.ok) return fail(r.data?.error ?? `Could not delete ${f.name}.`);
    }
    const byId = new Map(fields.map((f) => [f.id, f]));
    for (const d of draft.filter((d) => d.id)) {
      const body = diffDraft(byId.get(d.id!)!, d);
      if (!body) continue;
      const r = await send(`${base}/fields/${d.id}`, 'PATCH', body);
      if (!r.ok) return fail(r.data?.error ?? `Could not update ${d.name}.`);
    }
    const ids: string[] = [];
    for (const d of draft) {
      if (d.id) { ids.push(d.id); continue; }
      const r = await send(`${base}/fields`, 'POST', draftBody(d));
      if (!r.ok) return fail(r.data?.error ?? `Could not add ${d.name}.`);
      ids.push(r.data.id);
    }
    if (ids.length > 0) {
      const r = await send(`${base}/fields/order`, 'PUT', { ids });
      if (!r.ok) return fail(r.data?.error ?? 'Could not save the field order.');
      setFields(r.data);
      setDraft(r.data.map(toDraft));
    }
    return null;
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
          <EnumSelect kind="mapping_role" values={CATALOG_MAPPING_ROLES} emptyLabel="—" value={mappingRole} onChange={(e) => setMappingRole(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
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
            const keys = draft.filter((f) => f.is_lookup_key);
            const keyText = keys.length === 1 ? keys[0].name : keys.length === 0 ? 'none yet' : `${keys.length} fields, must be one`;
            const searchableCount = validation.searchableCount;
            const live = catalog?.live_at ? `Live since ${catalog.live_at.slice(0, 10)}.` : 'Not marked live.';
            return (
              <div className="text-xs text-gray-600 space-y-0.5" data-testid="catalog-field-summary">
                <p data-testid="catalog-live">
                  Lookup key: {keyText}. Searchable:{' '}
                  <span className={searchableCount > CATALOG_SEARCHABLE_LIMIT ? 'text-red-700' : searchableCount === CATALOG_SEARCHABLE_LIMIT ? 'text-amber-700' : undefined}>
                    {searchableCount} of {CATALOG_SEARCHABLE_LIMIT}
                  </span>
                  . {live}{' '}
                  <button
                    type="button"
                    className="underline text-blue-700 disabled:opacity-50 disabled:no-underline"
                    disabled={dirty || saving}
                    title={dirty ? 'Save the field changes first.' : undefined}
                    onClick={() => void setLive(!catalog?.live_at)}
                  >
                    {catalog?.live_at ? 'Take off live' : 'Mark live'}
                  </button>
                </p>
                <p className="text-gray-500">Jinja reads catalog properties, not the key column: keep a product_id or variant_id field with the same value.</p>
              </div>
            );
          })()}
          <FieldTableEditor fields={draft} onChange={setDraft} referencedNames={referencedNames} linkedBy={linkedBy} />
        </div>
      )}

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && catalog && (
        <>
        <CommentsPanel entityType="catalog" entityId={catalog.id} api={{mode:'internal',projectId}} />
        <HistorySection projectId={projectId} entityType="catalog" entityId={catalog.id} parentEntityId={catalog.id} />
        </>
      )}

      {blockReasons.length > 0 && (
        <ul className="text-xs text-red-600 list-disc pl-5" data-testid="catalog-save-reasons">
          {blockReasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && catalog ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || blockReasons.length > 0}>{saving ? 'Saving…' : 'Save Catalog'}</Button>
        </div>
      </div>
    </div>
  );
}
