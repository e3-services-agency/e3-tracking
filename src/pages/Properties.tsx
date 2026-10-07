import { ExpandChevron } from '@/src/components/ui/ExpandChevron';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import { groupRowsByCategory, toggleCollapsed } from '@/src/domain/propertyTableGroups';
import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { BundlesSection } from '@/src/features/properties/components/BundlesSection';
import { Badge, KindBadge, PriorityBadge, StatusBadge } from '@/src/components/ui/badges';
/**
 * Properties: table with scope filter + plain create/edit form against
 * `/api/projects/:projectId/properties` (D-24). T-1-04 adds the allowed-values editor, the
 * customer-property mapping select and the data type / format / priority / status selects that
 * `src/domain/enums.ts` and `src/domain/bloomreach.ts` define.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, ChevronRight, Layers, Link2 } from 'lucide-react';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { CategoryBadge } from '@/src/components/ui/CategoryBadge';
import { NamingWarning } from '@/src/components/ui/NamingWarning';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import {
  PRIORITIES,
  ENTITY_STATUSES,
  PROPERTY_SCOPES,
  ORIGIN_TYPES,
  PROPERTY_DATA_TYPES,
  PROPERTY_DATA_FORMATS,
  PROPERTY_DEFINITION_DEFAULT_NAME,
} from '@/src/domain/enums';
import { STANDARD_CUSTOMER_PROPERTIES, type StandardEventSeed } from '@/src/domain/bloomreach';
import { AllowedValuesEditor, type AllowedValueRow } from '@/src/features/properties/components/AllowedValuesEditor';
import { ItemSchemaEditor, type ItemSchemaFieldRow } from '@/src/features/properties/components/ItemSchemaEditor';
import { DerivationEditor, draftFromDerivation, derivationFromDraft, type DerivationDraft } from '@/src/features/properties/components/DerivationEditor';
import { mergeFrozenOrder } from '@/src/domain/propertyOrder';
import {
  PROPERTY_CATEGORIES,
  PROPERTY_CATEGORY_LABELS,
  classifyProperty,
  formatDisplayName,
  isPropertyCategory,
  type PropertyCategory,
} from '@/src/domain/propertyCategory';
import { HistorySection } from '@/src/features/history/HistorySection';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import { typeFamily } from '@/src/domain/comparison/catalogChecks';
import {
  DefinitionSubRows,
  UsedByModal,
  toggleAll,
  toggleId,
  type PropertyDefinitionSummary,
  type PropertyUsageEvent,
} from '@/src/features/properties/components/PropertyRowParts';
import { CommentsPanel } from '@/src/features/comments/CommentsPanel';

interface PropertyRow {
  id: string;
  project_id: string;
  scope: string;
  name: string;
  description: string | null;
  /** Bloomreach Data Manager group name (free text). */
  category: string | null;
  /** D-64 (T-4-20): manual override of the derived property category; `null` = derived. */
  category_override?: string | null;
  notes: string | null;
  data_type: string;
  data_formats_json: string[];
  item_schema_json?: ItemSchemaFieldRow[] | null;
  /** D-63 (T-4-17). */
  kind?: string;
  derivation_json?: unknown;
  pii: boolean;
  property_type: string;
  allowed_values_json: AllowedValueRow[];
  priority: string | null;
  status: string | null;
  bloomreach_customer_property: string | null;
  bundle_ids?: string[];
  /** D-61 (T-4-11B): the catalog field the property looks up into. */
  mapped_catalog_id?: string | null;
  mapped_catalog_field_id?: string | null;
  /** T-4-23: discriminator on at least one event (the standard-event binding only applies then). */
  is_discriminator?: boolean;
  /** T-4-26: batched with the list. */
  definitions?: PropertyDefinitionSummary[];
  used_by_events?: PropertyUsageEvent[];
}

interface CatalogFieldOption {
  id: string;
  catalog_id: string;
  catalog_name: string;
  catalog_label: string;
  name: string;
  data_type: string | null;
  is_lookup_key: boolean;
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
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  // T-4-24: Properties | Bundles tabs, debounced client-side search, column sorting.
  const [view, setView] = useState<'properties' | 'bundles'>('properties');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 200);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusDefinitions, setFocusDefinitions] = useState(false);
  const [usedByFor, setUsedByFor] = useState<string | null>(null);
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const openEvent = useCallback(
    (id: string) => { setUsedByFor(null); setEventCardEventId(id); setRequestedTab('eventCard'); },
    [setEventCardEventId, setRequestedTab]
  );

  // T-4-02 fix round (ERROR 1): the Comments page (and any other cross-page link) sets
  // `selectedItemIdToEdit` + `requestedTab: 'properties'` (Layout.tsx) to deep-link straight to a
  // property's editor sheet; consumed once below, then cleared so a later render does not re-open it.
  const selectedItemIdToEdit = useStore((s) => s.selectedItemIdToEdit);
  const setSelectedItemIdToEdit = useStore((s) => s.setSelectedItemIdToEdit);

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
  // D-64: the category filter applies to the (possibly frozen) display order, client-side.
  const filteredProperties = useMemo(
    () =>
      displayProperties
        .filter((p) => !categoryFilter || classifyProperty(p) === categoryFilter)
        .filter(
          (p) =>
            !debouncedSearch ||
            p.name.toLowerCase().includes(debouncedSearch) ||
            (p.description ?? '').toLowerCase().includes(debouncedSearch)
        ),
    [displayProperties, categoryFilter, debouncedSearch]
  );
  const { sorted: visibleProperties, sort } = useSortableTable(filteredProperties, {
    name: (p) => p.name,
    scope: (p) => p.scope,
    data_type: (p) => p.data_type,
    kind: (p) => p.kind ?? 'event',
    enum: (p) => (Array.isArray(p.allowed_values_json) ? p.allowed_values_json.length : 0),
    priority: (p) => ['critical', 'high', 'medium', 'low'].indexOf(p.priority ?? '') + 1 || null,
    status: (p) => p.status,
  });

  const propertyGroups = useMemo(() => groupRowsByCategory<PropertyRow>(visibleProperties, classifyProperty), [visibleProperties]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<PropertyCategory>>(new Set());
  const expandable = useMemo(() => visibleProperties.filter((p) => (p.definitions ?? []).length > 0).map((p) => p.id), [visibleProperties]);
  const allExpanded = expandable.length > 0 && expandable.every((id) => expandedIds.has(id));
  const openDrawer = (id: string, defs: boolean) => { setSelectedId(id); setIsCreating(false); setFocusDefinitions(defs); setIsSheetOpen(true); setOrderFrozen(true); };
  const deleteRow = async (p: PropertyRow) => {
    if (!activeProjectId || !window.confirm(`Delete property "${p.name}"?`)) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/properties/${p.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const data = await parseJson(res);
      window.alert(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
      return;
    }
    await load();
  };

  useEffect(() => {
    if (selectedItemIdToEdit && properties.some((p) => p.id === selectedItemIdToEdit)) {
      setSelectedId(selectedItemIdToEdit);
      setIsCreating(false);
      setIsSheetOpen(true);
      setOrderFrozen(true);
      setSelectedItemIdToEdit(null);
    }
  }, [selectedItemIdToEdit, properties, setSelectedItemIdToEdit]);

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-1">Event and customer properties. Each property has one or more named <GlossaryTerm glossaryKey="definition">definitions</GlossaryTerm>.</p>
        </div>
        <Button onClick={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); setOrderFrozen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Property
        </Button>
      </PageHeader>

      <PageBody>
        <div className="mb-4 flex gap-1 border-b" role="tablist">
          {(['properties', 'bundles'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? 'border-[var(--brand-primary)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {v === 'properties' ? 'Properties' : `Bundles (${bundles.length})`}
            </button>
          ))}
        </div>

        {view === 'bundles' ? (
          <BundlesSection projectId={activeProjectId} onChanged={() => void load()} />
        ) : (
        <>
        <div className="mb-6 flex gap-2">
          <Input
            type="search"
            aria-label="Search properties"
            placeholder="Search name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64"
          />
          <EnumSelect kind="scope" values={PROPERTY_SCOPES} emptyLabel="All scopes" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">All categories</option>
            {PROPERTY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{PROPERTY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setExpandedIds(toggleAll(expandedIds, expandable))} disabled={expandable.length === 0} className="h-10">
            {allExpanded ? 'Collapse all definitions' : 'Expand all definitions'}
          </Button>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[88px]" />
              <col className="w-[88px]" />
              <col className="w-[104px]" />
              <col className="w-[96px]" />
              <col className="w-[88px]" />
              <col className="w-[140px]" />
              <col className="w-[170px]" />
            </colgroup>
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-1 py-3" hintScope="Properties"><span className="sr-only">Expand</span></HintTh>
                <SortableTh sort={sort} column="name" className="px-4 py-3 font-medium text-gray-500" hint="Name" hintScope="Properties">Name</SortableTh>
                <SortableTh sort={sort} column="scope" className="px-4 py-3 font-medium text-gray-500" hint="Scope" hintScope="Properties">Scope</SortableTh>
                <SortableTh sort={sort} column="data_type" className="px-4 py-3 font-medium text-gray-500" hint="Data type" hintScope="Properties">Data type</SortableTh>
                <SortableTh sort={sort} column="kind" className="px-4 py-3 font-medium text-gray-500" hint="Property type" hintScope="Properties">Type</SortableTh>
                <SortableTh sort={sort} column="enum" className="px-4 py-3 font-medium text-gray-500" hint="Enum" hintScope="Properties">Enum</SortableTh>
                <SortableTh sort={sort} column="priority" className="px-4 py-3 font-medium text-gray-500" hint="Priority" hintScope="Properties">Priority</SortableTh>
                <SortableTh sort={sort} column="status" className="px-4 py-3 font-medium text-gray-500" hint="Status" hintScope="Properties">Status</SortableTh>
                <HintTh className="px-4 py-3 font-medium text-gray-500" hintScope="Properties">Actions</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {propertyGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.category);
                return (
                  <React.Fragment key={group.category}>
                    <tr className="bg-gray-100" data-testid={`property-group-${group.category}`}>
                      <HintTh colSpan={9} scope="colgroup" hint="" hintScope="Properties" className="px-2 py-1 text-left text-xs font-semibold text-gray-700">
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          onClick={() => setCollapsedGroups((c) => toggleCollapsed(c, group.category))}
                          className="inline-flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-200"
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                          <CategoryBadge category={group.category} />
                          <span className="font-normal text-gray-500">({group.rows.length})</span>
                        </button>
                      </HintTh>
                    </tr>
                    {!isCollapsed && group.rows.map((p) => {
                      const enumCount = Array.isArray(p.allowed_values_json) ? p.allowed_values_json.length : 0;
                      const defCount = (p.definitions ?? []).length;
                      const usedCount = (p.used_by_events ?? []).length;
                      return (
                        <React.Fragment key={p.id}>
                          <tr onClick={() => openDrawer(p.id, false)} className="hover:bg-gray-50 cursor-pointer">
                            <td className="px-1 py-2">
                              {defCount > 0 && (
                                <ExpandChevron
                                  expanded={expandedIds.has(p.id)}
                                  label={`${defCount} definition(s): click to ${expandedIds.has(p.id) ? 'collapse' : 'expand'}`}
                                  onToggle={() => setExpandedIds((s) => toggleId(s, p.id))}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="whitespace-nowrap truncate" title={p.name}>{p.name}</span>
                                <CopyNameButton name={p.name} />
                                {isPropertyCategory(p.category_override) && <span className="text-xs font-normal text-gray-400" title="Category set by hand">(set)</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500">{p.scope}</td>
                            <td className="px-4 py-3 text-gray-500">{p.data_type}</td>
                            <td className="px-4 py-3"><KindBadge kind={p.kind} /></td>
                            <td className="px-4 py-3">
                              {enumCount > 0 ? <Badge tone="blue">enum · {enumCount}</Badge> : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-500"><PriorityBadge priority={p.priority} /></td>
                            <td className="px-2 py-3 text-gray-500"><StatusBadge status={p.status} /></td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex gap-1">
                                <Button variant="outline" size="sm" className="gap-1 px-2" title={`Definitions (${defCount})`} aria-label={`Definitions (${defCount})`} onClick={(e) => { e.stopPropagation(); openDrawer(p.id, true); }}><Layers className="h-4 w-4" />{defCount}</Button>
                                <Button variant="outline" size="sm" className="gap-1 px-2" title={`Used by (${usedCount})`} aria-label={`Used by (${usedCount})`} onClick={(e) => { e.stopPropagation(); setUsedByFor(p.id); }}><Link2 className="h-4 w-4" />{usedCount}</Button>
                                <Button variant="outline" size="sm" className="px-2" title="Delete" aria-label={`Delete ${p.name}`} onClick={(e) => { e.stopPropagation(); void deleteRow(p); }}><Trash2 className="h-4 w-4" /></Button>
                              </span>
                            </td>
                          </tr>
                          {expandedIds.has(p.id) && <DefinitionSubRows definitions={p.definitions ?? []} colSpan={9} onOpenEvent={openEvent} />}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {visibleProperties.length === 0 && (
                <EmptyState
                  colSpan={9}
                  message={
                    properties.length > 0 || scopeFilter || categoryFilter || debouncedSearch
                      ? 'No properties match the filter.'
                      : 'No properties yet. Import a data mapping from the Import page, or add one by hand.'
                  }
                  actionLabel="Add Property"
                  onAction={() => { setSelectedId(null); setIsCreating(true); setIsSheetOpen(true); setOrderFrozen(true); }}
                />
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </PageBody>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onExitComplete={() => setOrderFrozen(false)}
        title={isCreating ? 'Create Property' : 'Edit Property'}
      >
        <PropertyEditor
          key={isCreating ? 'create' : selectedId ?? 'none'}
          property={selected}
          focusDefinitions={focusDefinitions}
          isCreating={isCreating}
          bundles={bundles}
          standardEventAdditions={standardEventAdditions}
          projectId={activeProjectId}
          onSaved={async () => { await load(); setIsSheetOpen(false); }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
      {usedByFor && (() => {
        const p = properties.find((x) => x.id === usedByFor);
        return p ? (
          <UsedByModal propertyName={p.name} events={p.used_by_events ?? []} definitions={p.definitions ?? []} onOpenEvent={openEvent} onClose={() => setUsedByFor(null)} />
        ) : null;
      })()}
    </div>
  );
}

function PropertyEditor({
  property,
  focusDefinitions,
  isCreating,
  bundles,
  standardEventAdditions,
  projectId,
  onSaved,
  onClose,
}: {
  property: PropertyRow | null | undefined;
  focusDefinitions?: boolean;
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
  const [categoryOverride, setCategoryOverride] = useState<string>(property?.category_override ?? '');
  const [notes, setNotes] = useState(property?.notes ?? '');
  const [dataType, setDataType] = useState(property?.data_type ?? 'string');
  const [dataFormats, setDataFormats] = useState<string[]>(property?.data_formats_json ?? []);
  const [itemSchema, setItemSchema] = useState<ItemSchemaFieldRow[]>(property?.item_schema_json ?? []);
  const [kind, setKind] = useState(property?.kind ?? 'event');
  const [derivationDraft, setDerivationDraft] = useState<DerivationDraft>(draftFromDerivation(property?.derivation_json));
  const [pii, setPii] = useState(property?.pii ?? false);
  const [propertyType, setPropertyType] = useState(property?.property_type ?? 'custom');
  const [allowedValues, setAllowedValues] = useState<AllowedValueRow[]>(property?.allowed_values_json ?? []);
  const [priority, setPriority] = useState(property?.priority ?? '');
  const [status, setStatus] = useState(property?.status ?? '');
  const [bloomreachCustomerProperty, setBloomreachCustomerProperty] = useState(property?.bloomreach_customer_property ?? '');
  const [bundleIds, setBundleIds] = useState<string[]>(property?.bundle_ids ?? []);
  const [mappedCatalogFieldId, setMappedCatalogFieldId] = useState(property?.mapped_catalog_field_id ?? '');
  const [catalogFieldOptions, setCatalogFieldOptions] = useState<CatalogFieldOption[]>([]);
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

  // D-61 (T-4-11B): every catalog field of the project, for the catalog field picker.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs`);
      const list = await parseJson(res);
      if (!res.ok || !Array.isArray(list)) return;
      const options: CatalogFieldOption[] = [];
      for (const c of list as { id: string; name: string; market: string | null; language: string | null }[]) {
        const detailRes = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/catalogs/${c.id}`);
        const detail = await parseJson(detailRes);
        if (!detailRes.ok || !Array.isArray(detail.fields)) continue;
        const market = catalogMarketLabel(c.market, c.language);
        for (const f of detail.fields as { id: string; name: string; data_type: string | null; is_lookup_key: boolean }[]) {
          options.push({ id: f.id, catalog_id: c.id, catalog_name: c.name, catalog_label: market ? `${c.name} (${market})` : c.name, name: f.name, data_type: f.data_type, is_lookup_key: f.is_lookup_key });
        }
      }
      if (!cancelled) setCatalogFieldOptions(options);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const selectedCatalogField = catalogFieldOptions.find((o) => o.id === mappedCatalogFieldId) ?? null;
  const catalogTypeClash =
    selectedCatalogField !== null &&
    typeFamily(selectedCatalogField.data_type) !== null &&
    typeFamily(dataType) !== null &&
    typeFamily(selectedCatalogField.data_type) !== typeFamily(dataType);

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
        category_override: categoryOverride || null,
        notes: notes.trim() || null,
        data_type: dataType,
        data_formats_json: dataFormats,
        item_schema_json:
          dataType === 'array'
            ? itemSchema.filter((f) => f.field.trim()).map((f) => ({ field: f.field.trim(), data_type: f.data_type, data_formats: f.data_formats ?? [], required: f.required ?? false }))
            : null,
        // D-64: an SDK default property whose kind is still the default `event` is saved as `context`.
        kind:
          scope === 'event'
            ? kind === 'event' && classifyProperty({ scope, name: trimmedName, category_override: categoryOverride || null }) === 'sdk_default'
              ? 'context'
              : kind
            : 'event',
        derivation_json: scope === 'event' ? derivationFromDraft(kind, derivationDraft) : null,
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
        // D-61: a link whose field is not (yet) in the loaded options is left untouched; clearing the picker clears the link.
        ...(selectedCatalogField
          ? { mapped_catalog_id: selectedCatalogField.catalog_id, mapped_catalog_field_id: selectedCatalogField.id }
          : mappedCatalogFieldId === ''
            ? property?.mapped_catalog_field_id
              ? { mapped_catalog_id: null, mapped_catalog_field_id: null }
              : {}
            : {}),
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
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Scope" hintScope="Properties">Scope</FieldLabel>
        <EnumSelect kind="scope" values={PROPERTY_SCOPES} value={scope} onChange={(e) => setScope(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Name" hintScope="Properties">Name</FieldLabel>
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. total_price" />
          {trimmedName && <CopyNameButton name={trimmedName} />}
        </div>
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
        <NamingWarning entity={{ kind: 'property', scope, name: trimmedName, category_override: categoryOverride || null }} name={trimmedName} />
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Description" hintScope="Properties">Description</FieldLabel>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Category" hintScope="Properties">Category</FieldLabel>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Data type" hintScope="Properties">Data type</FieldLabel>
          <EnumSelect kind="data_type" values={PROPERTY_DATA_TYPES} value={dataType} onChange={(e) => setDataType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Data formats" hintScope="Properties">Data formats</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_DATA_FORMATS.map((fmt) => (
            <FieldLabel key={fmt} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1" hintScope="Properties">
              <input type="checkbox" checked={dataFormats.includes(fmt)} onChange={() => toggleFormat(fmt)} />
              {formatDisplayName(fmt)}
            </FieldLabel>
          ))}
        </div>
      </div>

      <AllowedValuesEditor
        values={allowedValues}
        onChange={setAllowedValues}
        standardEventAdditions={standardEventAdditions}
        showStandardEvent={property?.is_discriminator === true || allowedValues.some((v) => !!v.standard_event)}
      />

      {dataType === 'array' && <ItemSchemaEditor fields={itemSchema} onChange={setItemSchema} />}

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" htmlFor="property-category-override" hint="Property category" hintScope="Properties">Property category</FieldLabel>
        <select
          id="property-category-override"
          value={categoryOverride}
          onChange={(e) => {
            setCategoryOverride(e.target.value);
            // D-64: an SDK default property is a context property unless a kind was chosen.
            if (e.target.value === 'sdk_default' && kind === 'event') setKind('context');
          }}
          className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Automatic ({PROPERTY_CATEGORY_LABELS[classifyProperty({ scope, name: trimmedName })]})</option>
          {PROPERTY_CATEGORIES.map((c: PropertyCategory) => (
            <option key={c} value={c}>{PROPERTY_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500">Derived from the scope and name; set it only to override.</p>
      </div>

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" htmlFor="property-catalog-field" hint="Catalog field" hintScope="Properties">Catalog field</FieldLabel>
        <select
          id="property-catalog-field"
          value={mappedCatalogFieldId}
          onChange={(e) => setMappedCatalogFieldId(e.target.value)}
          className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Not linked</option>
          {mappedCatalogFieldId && !selectedCatalogField && <option value={mappedCatalogFieldId}>(current link)</option>}
          {catalogFieldOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.catalog_label} · {o.name}{o.is_lookup_key ? ' (lookup key)' : ''} · {o.data_type ?? 'string'}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500">The catalog field this property looks up into. An id property (product_id, variant_id) should link to the lookup key of its catalog kind.</p>
        {catalogTypeClash && selectedCatalogField && (
          <p className="text-xs text-red-700" role="alert">This property is {dataType}, but {selectedCatalogField.catalog_name}.{selectedCatalogField.name} is {selectedCatalogField.data_type}; the comparison reports it as an error.</p>
        )}
      </div>

      {scope === 'event' && (
        <DerivationEditor kind={kind} onKindChange={setKind} draft={derivationDraft} onDraftChange={setDerivationDraft} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Priority" hintScope="Properties">Priority</FieldLabel>
          <EnumSelect kind="priority" values={PRIORITIES} emptyLabel="—" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Status" hintScope="Properties">Status</FieldLabel>
          <EnumSelect kind="status" values={ENTITY_STATUSES} emptyLabel="—" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Property type" hintScope="Properties">Property type</FieldLabel>
        <EnumSelect kind="origin_type" values={ORIGIN_TYPES} value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" />
      </div>
      <FieldLabel className="flex items-center gap-2 text-sm text-gray-700" hintScope="Properties">
        <input type="checkbox" checked={pii} onChange={(e) => setPii(e.target.checked)} /> Contains PII
      </FieldLabel>
      {scope === 'customer' && (
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Bloomreach customer property" hintScope="Properties">Bloomreach customer property</FieldLabel>
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
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Notes" hintScope="Properties">Notes</FieldLabel>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {bundles.length > 0 && (
        <div className="space-y-2">
          <FieldLabel className="text-sm font-medium text-gray-700" hint="Bundles" hintScope="Properties">Bundles</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {bundles.map((b) => (
              <FieldLabel key={b.id} className="flex items-center gap-1 text-xs bg-gray-50 border rounded px-2 py-1" hintScope="Properties">
                <input type="checkbox" checked={bundleIds.includes(b.id)} onChange={() => toggleBundle(b.id)} />
                {b.name}
              </FieldLabel>
            ))}
          </div>
        </div>
      )}

      {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>}

      {!isCreating && property && <DefinitionsSection projectId={projectId} propertyId={property.id} focus={focusDefinitions} />}

      {!isCreating && property && (
        <CommentsPanel entityType="property" entityId={property.id} api={{ mode: 'internal', projectId }} />
      )}

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
function DefinitionsSection({ projectId, propertyId, focus }: { projectId: string; propertyId: string; focus?: boolean }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [definitions, setDefinitions] = useState<DefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!focus || loading) return;
    sectionRef.current?.focus?.({ preventScroll: true });
    sectionRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focus, loading]);
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
    <div ref={sectionRef} tabIndex={-1} className="space-y-2 pt-4 border-t outline-none">
      <div className="flex items-center justify-between">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Definitions" hintScope="Properties">Definitions</FieldLabel>
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
                {definitions.length > 1 && d.name !== PROPERTY_DEFINITION_DEFAULT_NAME && (
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
        <FieldLabel className="text-xs font-medium text-gray-700" hint="Name" hintScope="Properties">Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. consent_action"
          disabled={definition?.name === PROPERTY_DEFINITION_DEFAULT_NAME}
        />
        {definition?.name === PROPERTY_DEFINITION_DEFAULT_NAME && (
          <p className="text-xs text-gray-500">
            The &quot;{PROPERTY_DEFINITION_DEFAULT_NAME}&quot; definition stays in sync with the property&apos;s own fields and cannot be renamed.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <FieldLabel className="text-xs font-medium text-gray-700" hint="Description" hintScope="Properties">Description</FieldLabel>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1">
        <FieldLabel className="text-xs font-medium text-gray-700" hint="Formats" hintScope="Properties">Formats</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_DATA_FORMATS.map((fmt) => (
            <FieldLabel key={fmt} className="flex items-center gap-1 text-xs bg-white border rounded px-2 py-1" hintScope="Properties">
              <input type="checkbox" checked={formats.includes(fmt)} onChange={() => toggleFormat(fmt)} />
              {formatDisplayName(fmt)}
            </FieldLabel>
          ))}
        </div>
      </div>
      <AllowedValuesEditor values={allowedValues} onChange={setAllowedValues} standardEventAdditions={null} />
      <div className="space-y-1">
        <FieldLabel className="text-xs font-medium text-gray-700" hint="Example value" hintScope="Properties">Example value</FieldLabel>
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
