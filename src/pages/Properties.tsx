/**
 * Properties: table with scope filter + plain create/edit form against
 * `/api/projects/:projectId/properties` (D-24). T-1-04 adds the allowed-values editor, the
 * customer-property mapping select and the data type / format / priority / status selects that
 * `src/domain/enums.ts` and `src/domain/bloomreach.ts` define.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import {
  PRIORITIES,
  ENTITY_STATUSES,
  PROPERTY_SCOPES,
  ORIGIN_TYPES,
  PROPERTY_DATA_TYPES,
  PROPERTY_DATA_FORMATS,
} from '@/src/domain/enums';
import { STANDARD_CUSTOMER_PROPERTIES, type StandardEventSeed } from '@/src/domain/bloomreach';
import { AllowedValuesEditor, type AllowedValueRow } from '@/src/features/properties/components/AllowedValuesEditor';
import { ItemSchemaEditor, type ItemSchemaFieldRow } from '@/src/features/properties/components/ItemSchemaEditor';
import { mergeFrozenOrder } from '@/src/domain/propertyOrder';
import { HistorySection } from '@/src/features/history/HistorySection';

interface PropertyRow {
  id: string;
  project_id: string;
  scope: string;
  name: string;
  description: string | null;
  category: string | null;
  notes: string | null;
  data_type: string;
  data_formats_json: string[];
  item_schema_json?: ItemSchemaFieldRow[] | null;
  pii: boolean;
  property_type: string;
  allowed_values_json: AllowedValueRow[];
  priority: string | null;
  status: string | null;
  bloomreach_customer_property: string | null;
  bundle_ids?: string[];
}

interface BundleRow {
  id: string;
  name: string;
  property_ids: string[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function Properties() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [standardEventAdditions, setStandardEventAdditions] = useState<StandardEventSeed[] | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const qs = scopeFilter ? `?scope=${scopeFilter}` : '';
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/properties${qs}`);
    const data = await parseJson(res);
    if (res.ok) setProperties(Array.isArray(data) ? data : []);

    const bundleRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/bundles`);
    const bundleData = await parseJson(bundleRes);
    if (bundleRes.ok) setBundles(Array.isArray(bundleData) ? bundleData : []);

    const projectRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`);
    const projectData = await parseJson(projectRes);
    if (projectRes.ok) {
      setStandardEventAdditions(
        Array.isArray(projectData?.standard_event_additions_json) ? projectData.standard_event_additions_json : null
      );
    }
  }, [hasValidProjectContext, activeProjectId, scopeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = selectedId ? properties.find((p) => p.id === selectedId) : null;

  // Stable display order while the editor sheet is *visibly* open (fix round re-sweep 02:16 FAIL):
  // a save re-fetches `properties` (server-sorted by name) and can move the just-edited row to a new
  // position; if the row order changed under an open sheet, the next click (aimed at the old
  // position) could land on a different row. `isSheetOpen` flips to `false` immediately on save
  // (`onSaved` below), but the Sheet's exit animation keeps the panel visible for a few hundred ms
  // after that — freezing on `isSheetOpen` alone re-sorted the table while "Edit Property" was still
  // on screen. `orderFrozen` instead stays true until the Sheet's exit animation actually finishes
  // (`onExitComplete`), so the frozen order holds for as long as the editor is visibly open and only
  // re-syncs to the server's order once it is really gone (or on an explicit reload while closed).
  const [orderFrozen, setOrderFrozen] = useState(false);
  const orderRef = useRef<string[]>([]);
  const displayProperties = useMemo(() => {
    const byId = new Map(properties.map((p) => [p.id, p]));
    if (!orderFrozen) {
      orderRef.current = properties.map((p) => p.id);
      return properties;
    }
    const order = mergeFrozenOrder(orderRef.current, properties.map((p) => p.id));
    orderRef.current = order;
    return order.map((id) => byId.get(id)!);
  }, [properties, orderFrozen]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-1">Event and customer properties (D-24).</p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); setOrderFrozen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Property
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        <div className="mb-6 flex gap-2">
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">All scopes</option>
            {PROPERTY_SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Scope</th>
                <th className="px-6 py-3 font-medium text-gray-500">Data type</th>
                <th className="px-6 py-3 font-medium text-gray-500">Enum</th>
                <th className="px-6 py-3 font-medium text-gray-500">Priority</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayProperties.map((p) => {
                const enumCount = Array.isArray(p.allowed_values_json) ? p.allowed_values_json.length : 0;
                return (
                  <tr key={p.id} onClick={() => { setSelectedId(p.id); setIsCreating(false); setIsSheetOpen(true); setOrderFrozen(true); }} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 font-medium text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 text-gray-500">{p.scope}</td>
                    <td className="px-6 py-4 text-gray-500">{p.data_type}</td>
                    <td className="px-6 py-4">
                      {enumCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-xs px-2 py-0.5 border border-blue-200">
                          enum · {enumCount}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{p.priority ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-500">{p.status ?? '—'}</td>
                  </tr>
                );
              })}
              {displayProperties.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No properties found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onExitComplete={() => setOrderFrozen(false)}
        title={isCreating ? 'Create Property' : 'Edit Property'}
      >
        <PropertyEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          property={selected}
          isCreating={isCreating}
          bundles={bundles}
          standardEventAdditions={standardEventAdditions}
          projectId={activeProjectId}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function PropertyEditor({
  property,
  isCreating,
  bundles,
  standardEventAdditions,
  projectId,
  onSaved,
  onClose,
}: {
  property: PropertyRow | null | undefined;
  isCreating: boolean;
  bundles: BundleRow[];
  standardEventAdditions: StandardEventSeed[] | null;
  projectId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState(property?.scope ?? 'event');
  const [name, setName] = useState(property?.name ?? '');
  const [description, setDescription] = useState(property?.description ?? '');
  const [category, setCategory] = useState(property?.category ?? '');
  const [notes, setNotes] = useState(property?.notes ?? '');
  const [dataType, setDataType] = useState(property?.data_type ?? 'string');
  const [dataFormats, setDataFormats] = useState<string[]>(property?.data_formats_json ?? []);
  const [itemSchema, setItemSchema] = useState<ItemSchemaFieldRow[]>(property?.item_schema_json ?? []);
  const [pii, setPii] = useState(property?.pii ?? false);
  const [propertyType, setPropertyType] = useState(property?.property_type ?? 'custom');
  const [allowedValues, setAllowedValues] = useState<AllowedValueRow[]>(property?.allowed_values_json ?? []);
  const [priority, setPriority] = useState(property?.priority ?? '');
  const [status, setStatus] = useState(property?.status ?? '');
  const [bloomreachCustomerProperty, setBloomreachCustomerProperty] = useState(property?.bloomreach_customer_property ?? '');
  const [bundleIds, setBundleIds] = useState<string[]>(property?.bundle_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleFormat = (fmt: string) => {
    setDataFormats((prev) => (prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]));
  };
  const toggleBundle = (id: string) => {
    setBundleIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const trimmedName = name.trim();
  const nameError = trimmedName ? null : 'Name is required.';

  const handleSave = async () => {
    if (!trimmedName || !projectId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        scope,
        name: trimmedName,
        description: description.trim() || null,
        category: category.trim() || null,
        notes: notes.trim() || null,
        data_type: dataType,
        data_formats_json: dataFormats,
        item_schema_json:
          dataType === 'array'
            ? itemSchema.filter((f) => f.field.trim()).map((f) => ({ field: f.field.trim(), data_type: f.data_type, data_formats: f.data_formats ?? [], required: f.required ?? false }))
            : null,
        pii,
        property_type: propertyType,
        allowed_values_json: allowedValues
          .filter((v) => v.value.trim())
          .map((v) => ({
            value: v.value.trim(),
            label: v.label?.trim() || null,
            description: v.description?.trim() || null,
            standard_event: v.standard_event || null,
          })),
        priority: priority || null,
        status: status || null,
        bloomreach_customer_property: scope === 'customer' ? bloomreachCustomerProperty || null : null,
        bundle_ids: bundleIds,
      };
      const url = isCreating
        ? `${API_BASE}/api/projects/${projectId}/properties`
        : `${API_BASE}/api/projects/${projectId}/properties/${property?.id}`;
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
    if (!property || !projectId) return;
    if (!window.confirm(`Delete property "${property.name}"?`)) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties/${property.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await parseJson(res);
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
        return;
      }
      await onSaved();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          {PROPERTY_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Name (snake_case)</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. total_price" />
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Category</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Data type</label>
          <select value={dataType} onChange={(e) => setDataType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {PROPERTY_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Data formats</label>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_DATA_FORMATS.map((fmt) => (
            <label key={fmt} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1">
              <input type="checkbox" checked={dataFormats.includes(fmt)} onChange={() => toggleFormat(fmt)} />
              {fmt}
            </label>
          ))}
        </div>
      </div>

      <AllowedValuesEditor
        values={allowedValues}
        onChange={setAllowedValues}
        standardEventAdditions={standardEventAdditions}
      />

      {dataType === 'array' && <ItemSchemaEditor fields={itemSchema} onChange={setItemSchema} />}

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
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Property type</label>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          {ORIGIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={pii} onChange={(e) => setPii(e.target.checked)} /> Contains PII
      </label>
      {scope === 'customer' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Bloomreach customer property</label>
          <select
            value={bloomreachCustomerProperty}
            onChange={(e) => setBloomreachCustomerProperty(e.target.value)}
            className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
          >
            <option value="">—</option>
            {STANDARD_CUSTOMER_PROPERTIES.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {bundles.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Bundles</label>
          <div className="flex flex-wrap gap-2">
            {bundles.map((b) => (
              <label key={b.id} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1">
                <input type="checkbox" checked={bundleIds.includes(b.id)} onChange={() => toggleBundle(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && property && <DefinitionsSection projectId={projectId} propertyId={property.id} />}

      {!isCreating && property && (
        <HistorySection projectId={projectId} entityType="property" entityId={property.id} />
      )}

      <div className="pt-6 border-t flex justify-between">
        {!isCreating && property ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || deleting} className="gap-2">
            {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || deleting || !trimmedName}>{saving ? 'Saving…' : 'Save Property'}</Button>
        </div>
      </div>
    </div>
  );
}

interface DefinitionRow {
  id: string;
  name: string;
  description: string | null;
  allowed_values_json: AllowedValueRow[];
  formats_json: string[];
  example_values_json: { value: string }[];
  using_events?: string[];
}

/**
 * D-58 (T-4-00): a property's named definitions, expanding the Properties page row into "one or
 * more meanings" as the plan describes -- a property with one definition (the common case) looks
 * unremarkable here (a single "general" row); a second named definition is added explicitly when
 * the same attribute means something different on another event (e.g. `action` on `consent`).
 * Simplified UI (D-07): plain add/edit/remove, no drag reorder.
 */
function DefinitionsSection({ projectId, propertyId }: { projectId: string; propertyId: string }) {
  const [definitions, setDefinitions] = useState<DefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties/${propertyId}/definitions`);
    const data = await parseJson(res);
    if (res.ok) setDefinitions(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [projectId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = editingId ? definitions.find((d) => d.id === editingId) ?? null : null;

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this definition?')) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/properties/${propertyId}/definitions/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const data = await parseJson(res);
      setError(typeof data?.error === 'string' ? data.error : 'Failed to delete definition.');
      return;
    }
    await load();
  };

  return (
    <div className="space-y-2 pt-4 border-t">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Definitions</label>
        <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setIsAdding(true); }} className="gap-1">
          <Plus className="w-3 h-3" /> Add definition
        </Button>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {definitions.map((d) => (
            <div key={d.id} className="rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900">{d.name}</div>
                {d.description && <div className="text-xs text-gray-500">{d.description}</div>}
                {Array.isArray(d.allowed_values_json) && d.allowed_values_json.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    {d.allowed_values_json.map((v) => v.value).join(', ')}
                  </div>
                )}
                {Array.isArray(d.using_events) && d.using_events.length > 0 && (
                  <div className="text-xs text-gray-400 mt-1">Used by: {d.using_events.join(', ')}</div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setEditingId(d.id); }}>Edit</Button>
                {definitions.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => void handleDelete(d.id)}>Remove</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {(isAdding || editing) && (
        <DefinitionEditor
          projectId={projectId}
          propertyId={propertyId}
          definition={editing}
          onClose={() => { setIsAdding(false); setEditingId(null); }}
          onSaved={async () => { setIsAdding(false); setEditingId(null); await load(); }}
        />
      )}
    </div>
  );
}

function DefinitionEditor({
  projectId,
  propertyId,
  definition,
  onClose,
  onSaved,
}: {
  projectId: string;
  propertyId: string;
  definition: DefinitionRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(definition?.name ?? '');
  const [description, setDescription] = useState(definition?.description ?? '');
  const [allowedValues, setAllowedValues] = useState<AllowedValueRow[]>(definition?.allowed_values_json ?? []);
  const [formats, setFormats] = useState<string[]>(definition?.formats_json ?? []);
  const [example, setExample] = useState(definition?.example_values_json?.[0]?.value ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleFormat = (fmt: string) => {
    setFormats((prev) => (prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]));
  };

  const trimmedName = name.trim();

  const handleSave = async () => {
    if (!trimmedName) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: trimmedName,
        description: description.trim() || null,
        allowed_values_json: allowedValues.filter((v) => v.value.trim()).map((v) => ({ value: v.value.trim() })),
        formats_json: formats,
        example_values_json: example.trim() ? [{ value: example.trim() }] : [],
      };
      const url = definition
        ? `${API_BASE}/api/projects/${projectId}/properties/${propertyId}/definitions/${definition.id}`
        : `${API_BASE}/api/projects/${projectId}/properties/${propertyId}/definitions`;
      const res = await fetchWithAuth(url, { method: definition ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save definition.');
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border bg-gray-50 p-3 space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. consent_action" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Formats</label>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_DATA_FORMATS.map((fmt) => (
            <label key={fmt} className="flex items-center gap-1 text-xs bg-white border rounded px-2 py-1">
              <input type="checkbox" checked={formats.includes(fmt)} onChange={() => toggleFormat(fmt)} />
              {fmt}
            </label>
          ))}
        </div>
      </div>
      <AllowedValuesEditor values={allowedValues} onChange={setAllowedValues} standardEventAdditions={null} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Example value</label>
        <Input value={example} onChange={(e) => setExample(e.target.value)} />
      </div>
      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{saveError}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={saving || !trimmedName}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  );
}
