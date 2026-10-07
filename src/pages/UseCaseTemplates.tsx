/**
 * Use case templates page (T-3-06, D-47, D-57): the global library's own page, separate from the
 * project's Use cases page (which keeps its single-template "Create from template" select). Plain
 * table + form UI (D-07): facet filter bar, import paste box with a preview table and Apply,
 * Export, per-template Instantiate, multi-select "Add to project", and a template detail panel
 * with the prerequisites card (resolve status per group for the current project).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { suggestUseCaseType } from '@/src/domain/useCaseType';
import {
  LIBRARY_CHANNELS,
  USE_CASE_TYPES,
  LIBRARY_GOALS,
  LIBRARY_TIERS,
  LIBRARY_KPIS,
  LIBRARY_INDUSTRIES,
} from '@/src/domain/enums';

const FACETS: { key: keyof TemplateTags; label: string; values: readonly string[] }[] = [
  { key: 'channels', label: 'Channel', values: LIBRARY_CHANNELS },
  { key: 'goals', label: 'Goal', values: LIBRARY_GOALS },
  { key: 'tiers', label: 'Tier', values: LIBRARY_TIERS },
  { key: 'kpis', label: 'KPI', values: LIBRARY_KPIS },
  { key: 'industries', label: 'Industry', values: LIBRARY_INDUSTRIES },
];

interface TemplateTags {
  channels: string[];
  goals: string[];
  tiers: string[];
  kpis: string[];
  industries: string[];
}

interface TemplateFlags {
  new?: boolean;
  popular?: boolean;
}

interface DefaultRequirement {
  target_kind: string;
  event_name?: string;
  property_name?: string;
  condition?: { property_name: string; value: string };
  level: string;
  note?: string;
}

interface TemplateExpectedAsset {
  type: string;
  headline: string;
}

interface TemplateSource {
  kind: string;
  template_id?: string;
  documentation_link?: string;
  callout?: string;
}

interface TemplateRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  default_requirements_json: DefaultRequirement[];
  tags_json: TemplateTags;
  flags_json: TemplateFlags;
  prerequisites_json: string[];
  expected_assets_json: TemplateExpectedAsset[];
  source_json: TemplateSource | null;
  documentation_url: string | null;
  internal_notes: string | null;
  internal_url: string | null;
}

interface DiffItem {
  id: string;
  op: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict';
  entity_type: string;
  entity_key: string;
  changes: { field: string; before: unknown; after: unknown }[];
  default_selected: boolean;
  note?: string;
}

interface PreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

interface ResolvePreviewGroup {
  group: 'events' | 'customer_properties' | 'catalog' | 'consents';
  total: number;
  resolved: number;
  status: 'all' | 'none' | 'mixed';
}

interface TemplateEventCandidate {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
  properties: { id: string; name: string }[];
}

interface ResolvedPreviewItem {
  index: number;
  target_kind: string;
  /** D-61 (T-4-11B): catalog attribute requirements carry the per-market result. */
  field_name?: string;
  partial?: boolean;
  partial_note?: string;
  catalog_markets?: { catalog_id: string; name: string; market: string | null; language: string | null; has_field: boolean }[];
}

interface UnresolvedPreviewItem {
  index: number;
  target_kind: string;
  standard_event?: string;
  property_name?: string;
  candidates: TemplateEventCandidate[];
}

interface ResolvePreviewResult {
  resolved: ResolvedPreviewItem[];
  unresolved: UnresolvedPreviewItem[];
  groups: ResolvePreviewGroup[];
  unresolved_count: number;
  total_count: number;
}

/** T-3-10 (D-55): which of `event`/`variant`/`property` an unresolved row's target_kind needs a picker for. */
function pickersFor(targetKind: string): { event: boolean; variant: boolean; property: boolean } {
  return {
    event: targetKind === 'event' || targetKind === 'event_property' || targetKind === 'variant' || targetKind === 'variant_property',
    variant: targetKind === 'variant' || targetKind === 'variant_property',
    property: targetKind === 'event_property' || targetKind === 'variant_property',
  };
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function UseCaseTemplates() {
  const { activeProjectId } = useProjectShell();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [instantiateDialogTemplateId, setInstantiateDialogTemplateId] = useState<string | null>(null);
  // Fix round LOW 3 (reviewer, 2026-09-28 03:15): the preview `openInstantiate` already fetched to
  // decide whether to open the dialog is handed straight to it, instead of the dialog re-fetching
  // the same preview again on mount (one request per Instantiate click, not two).
  const [instantiateDialogPreview, setInstantiateDialogPreview] = useState<ResolvePreviewResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth(`${API_BASE}/api/use-case-templates`);
    const data = await parseJson(res);
    if (res.ok) setTemplates(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // T-3-10 (D-57), fix round WARNING 2 (reviewer, 2026-09-28 03:15): the project's own free-text
  // `industry` is the default `industries` facet filter, but only when it matches one of the
  // rendered `LIBRARY_INDUSTRIES` chips case-insensitively -- a value like "aerospace" or
  // "Ecommerce" (different casing) must never silently hide every template with no visible,
  // clickable chip to undo it. `defaultIndustryApplied` names the matched chip so the facet bar can
  // show it as an explicit "Default: <value>" pill with its own Clear control (distinct from the
  // ordinary chip toggle, which stays available too); `offVocabularyIndustry` carries the raw value
  // for a plain hint when it did not match, applied once per project switch.
  const [defaultIndustryApplied, setDefaultIndustryApplied] = useState<string | null>(null);
  const [offVocabularyIndustry, setOffVocabularyIndustry] = useState<string | null>(null);
  const appliedDefaultIndustryFor = useRef<string | null>(null);
  // Fix round LOW 2/LOW 3 (reviewer, 2026-09-28 03:45): plain refs, kept in sync every render, so
  // the project-switch effect below can read the *current* filters and the *previously* applied
  // default value synchronously, instead of either reaching for a stale closure or calling one
  // setState from inside another's updater function (the original LOW 2 side effect).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const defaultIndustryAppliedRef = useRef(defaultIndustryApplied);
  defaultIndustryAppliedRef.current = defaultIndustryApplied;

  useEffect(() => {
    if (!activeProjectId || appliedDefaultIndustryFor.current === activeProjectId) return;
    appliedDefaultIndustryFor.current = activeProjectId;

    // LOW 3: retire the *previous* project's own auto-applied default from the actual filter set,
    // not just the pill/hint state -- otherwise it keeps silently filtering as an ordinary chip with
    // no visible "this was a default" marker, and the new project's own default is never applied
    // (the "never override an existing choice" guard below would see it and back off).
    const previousDefault = defaultIndustryAppliedRef.current;
    if (previousDefault) {
      setFilters((prev) => {
        const set = new Set(prev.industries ?? []);
        set.delete(previousDefault);
        return { ...prev, industries: set };
      });
    }
    setDefaultIndustryApplied(null);
    setOffVocabularyIndustry(null);

    fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}`)
      .then(parseJson)
      .then((data) => {
        const industry = typeof data?.industry === 'string' ? data.industry.trim() : '';
        if (!industry) return;
        const matched = LIBRARY_INDUSTRIES.find((v) => v.toLowerCase() === industry.toLowerCase());
        if (!matched) {
          setOffVocabularyIndustry(industry);
          return;
        }
        if (filtersRef.current.industries?.size) return; // never override an existing filter choice
        setDefaultIndustryApplied(matched);
        setFilters((prev) => ({ ...prev, industries: new Set([matched]) }));
      })
      .catch(() => {});
  }, [activeProjectId]);

  const clearDefaultIndustry = () => {
    if (!defaultIndustryApplied) return;
    setFilters((prev) => {
      const next = { ...prev };
      const set = new Set(next.industries ?? []);
      set.delete(defaultIndustryApplied);
      next.industries = set;
      return next;
    });
    setDefaultIndustryApplied(null);
  };

  const toggleFacetValue = (facet: string, value: string) => {
    // Manually toggling the auto-applied default chip (either way) retires the "Default:" pill --
    // the ordinary chip toggle already does the un-filtering; there is no separate default to clear.
    if (facet === 'industries' && value === defaultIndustryApplied) setDefaultIndustryApplied(null);
    setFilters((prev) => {
      const next = { ...prev };
      const set = new Set(next[facet] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next[facet] = set;
      return next;
    });
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) =>
      FACETS.every(({ key }) => {
        const selected = filters[key];
        if (!selected || selected.size === 0) return true;
        const values = t.tags_json?.[key] ?? [];
        return values.some((v) => selected.has(v));
      })
    );
  }, [templates, filters]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Fast path: no mapping step needed, or the user chose to skip it entirely. */
  const instantiate = async (
    templateId: string,
    mappings?: { index: number; event_id: string; variant_id?: string; property_id?: string }[],
    type?: string
  ) => {
    if (!activeProjectId) {
      setActionError('Select a project first.');
      return;
    }
    setActionError(null);
    setActionMessage(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${templateId}`, {
      method: 'POST',
      body: mappings || type ? JSON.stringify({ ...(mappings ? { mappings } : {}), ...(type ? { type } : {}) }) : undefined,
    });
    const data = await parseJson(res);
    if (!res.ok) {
      setActionError(typeof data?.error === 'string' ? data.error : 'Failed to create use case.');
      return;
    }
    setActionMessage(
      `Created use case "${data.name}"${data.unresolved_count ? ` (${data.unresolved_count} gap requirement${data.unresolved_count === 1 ? '' : 's'})` : ''}.`
    );
  };

  /** T-3-10 (D-55): previews resolution first; opens the mapping dialog only when something is
   * unresolved, otherwise instantiates directly (unchanged fast path for a fully-resolving template). */
  const openInstantiate = async (templateId: string) => {
    if (!activeProjectId) {
      setActionError('Select a project first.');
      return;
    }
    setActionError(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${templateId}/preview`, {
      method: 'POST',
    });
    const data = (await parseJson(res)) as ResolvePreviewResult;
    // T-4-21: the dialog always opens (Type step); its mapping table only shows unresolved rows.
    setInstantiateDialogPreview(res.ok && Array.isArray(data.unresolved) ? data : ({ ...data, unresolved: [] } as ResolvePreviewResult));
    setInstantiateDialogTemplateId(templateId);
  };

  const addSelectedToProject = async () => {
    if (!activeProjectId || selectedIds.size === 0) return;
    setActionError(null);
    setActionMessage(null);
    let created = 0;
    // Fix round LOW 7 (2026-09-27 23:26): surface the first per-template failure's own message
    // (e.g. 409 USE_CASE_CODE_TAKEN, TEMPLATE_IN_USE) instead of only a bare success count, so a
    // multi-add that partially fails tells the user why, not just how many.
    let firstError: string | null = null;
    for (const id of selectedIds) {
      const template = templates.find((t) => t.id === id);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${id}`, {
        method: 'POST',
        // No silent suggestion in the bulk add: the template's own type stands (the server default).
        body: undefined,
      });
      if (res.ok) {
        created += 1;
      } else if (!firstError) {
        const data = await parseJson(res);
        const message = typeof data?.error === 'string' ? data.error : 'Failed to create use case.';
        firstError = `"${template?.code ?? id}": ${message}`;
      }
    }
    setActionMessage(`Created ${created} of ${selectedIds.size} use case${selectedIds.size === 1 ? '' : 's'}.`);
    if (firstError) setActionError(firstError);
    setSelectedIds(new Set());
  };

  const detailTemplate = detailId ? templates.find((t) => t.id === detailId) ?? null : null;

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Use case templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            The shared library: import, filter, and add use cases to the current project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`${API_BASE}/api/use-case-templates/export.json`} download="use-case-library.json">
            <Button variant="outline">Export</Button>
          </a>
          <Button onClick={addSelectedToProject} disabled={selectedIds.size === 0 || !activeProjectId}>
            Add {selectedIds.size || ''} to project
          </Button>
        </div>
      </PageHeader>

      <PageBody className="space-y-6">
        {actionError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>}
        {actionMessage && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{actionMessage}</div>}

        <div id="import-library-box">
          <ImportLibraryBox onImported={load} />
        </div>

        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          <div className="flex flex-wrap gap-6">
            {FACETS.map(({ key, label, values }) => (
              <div key={key} className="space-y-1">
                <div className="text-xs font-medium text-gray-500">{label}</div>
                <div className="flex flex-wrap gap-1 max-w-xs items-center">
                  {values.map((v) => {
                    const active = filters[key]?.has(v) ?? false;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleFacetValue(key, v)}
                        className={`text-xs px-2 py-1 rounded-full border ${
                          active ? 'bg-[var(--color-info)]/10 border-[var(--color-info)] text-[var(--color-info)]' : 'border-gray-300 text-gray-600'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                  {/* Fix round WARNING 2 (2026-09-28): the project industry's auto-applied default
                      chip is visibly distinct, with its own Clear control (never a hidden filter). */}
                  {key === 'industries' && defaultIndustryApplied && (
                    <span className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-600 flex items-center gap-1">
                      Default: {defaultIndustryApplied}
                      <button type="button" onClick={clearDefaultIndustry} className="underline hover:text-gray-900">
                        Clear
                      </button>
                    </span>
                  )}
                </div>
                {/* An off-vocabulary project industry is a hint only, never a hidden filter. */}
                {key === 'industries' && offVocabularyIndustry && (
                  <div className="text-xs text-gray-400">
                    Project industry "{offVocabularyIndustry}" is not in this list; no default filter applied.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 w-8" />
                <HintTh className="px-4 py-2 font-medium text-gray-500" hintScope="Templates">Code</HintTh>
                <HintTh className="px-4 py-2 font-medium text-gray-500" hintScope="Templates">Name</HintTh>
                <HintTh className="px-4 py-2 font-medium text-gray-500" hintScope="Templates">Type</HintTh>
                <HintTh className="px-4 py-2 font-medium text-gray-500" hintScope="Templates">Flags</HintTh>
                <HintTh className="px-4 py-2 font-medium text-gray-500" hintScope="Templates">Requirements</HintTh>
                <th className="px-4 py-2 w-48" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                filteredTemplates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelected(t.id)} />
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      <button type="button" className="hover:underline" onClick={() => setDetailId(t.id)}>
                        {t.code}
                      </button>
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {t.name}
                      {t.documentation_url && (
                        <a
                          href={t.documentation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-xs font-normal text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.source_json?.kind === 'pnp_usecase' ? 'Bloomreach documentation' : 'Documentation'}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{t.type}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {t.flags_json?.new && <span className="text-xs text-emerald-700 mr-2">new</span>}
                      {t.flags_json?.popular && <span className="text-xs text-amber-700">popular</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{t.default_requirements_json?.length ?? 0}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => void openInstantiate(t.id)} disabled={!activeProjectId}>
                        Add to project
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && filteredTemplates.length === 0 && templates.length === 0 && (
                <EmptyState
                  colSpan={7}
                  message="No use case templates yet. Import the library JSON below to get started."
                  actionLabel="Import library"
                  onAction={() => document.getElementById('import-library-box')?.scrollIntoView({ behavior: 'smooth' })}
                />
              )}
              {!loading && filteredTemplates.length === 0 && templates.length > 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No templates match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {detailTemplate && (
          <TemplateDetail
            template={detailTemplate}
            projectId={activeProjectId}
            onClose={() => setDetailId(null)}
            onUpdated={load}
          />
        )}

        {instantiateDialogTemplateId && activeProjectId && instantiateDialogPreview && (
          <InstantiateMappingDialog
            preview={instantiateDialogPreview}
            defaultType={(() => {
              const t = templates.find((x) => x.id === instantiateDialogTemplateId);
              return t ? suggestUseCaseType({ type: t.type, name: t.name, channels: t.tags_json?.channels }) : 'marketing';
            })()}
            onClose={() => {
              setInstantiateDialogTemplateId(null);
              setInstantiateDialogPreview(null);
            }}
            onInstantiate={async (mappings, type) => {
              await instantiate(instantiateDialogTemplateId, mappings, type);
              setInstantiateDialogTemplateId(null);
              setInstantiateDialogPreview(null);
            }}
          />
        )}
      </PageBody>
    </div>
  );
}

/**
 * T-3-10 (D-55): the mapping-step dialog. One row per unresolved `default_requirements_json` entry
 * with an event/variant/property picker (only the ones its `target_kind` needs) plus a Skip option
 * (the row's default -- no mapping is applied for that index, matching the plan's "Skip option");
 * "Create use case" sends every non-skipped row as a `mappings` entry.
 *
 * Fix round LOW 3 (reviewer, 2026-09-28 03:15): takes the `preview` its caller already fetched
 * (`openInstantiate` has to preview first anyway, to decide whether to open this dialog at all)
 * instead of fetching the same preview again on mount -- one request per Instantiate click.
 */
function InstantiateMappingDialog({
  preview,
  defaultType,
  onClose,
  onInstantiate,
}: {
  preview: ResolvePreviewResult;
  /** T-4-21: suggested type from the template's channels and name; the user can change it. */
  defaultType: string;
  onClose: () => void;
  onInstantiate: (mappings: { index: number; event_id: string; variant_id?: string; property_id?: string }[], type: string) => Promise<void>;
}) {
  const [useCaseType, setUseCaseType] = useState(defaultType);
  const [rowEventId, setRowEventId] = useState<Record<number, string>>({});
  const [rowVariantId, setRowVariantId] = useState<Record<number, string>>({});
  const [rowPropertyId, setRowPropertyId] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const setEvent = (index: number, eventId: string) => {
    setRowEventId((prev) => ({ ...prev, [index]: eventId }));
    // Changing the event invalidates any previously-picked variant/property from a different event.
    setRowVariantId((prev) => ({ ...prev, [index]: '' }));
    setRowPropertyId((prev) => ({ ...prev, [index]: '' }));
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const mappings = preview.unresolved
        .filter((item) => rowEventId[item.index])
        .map((item) => ({
          index: item.index,
          event_id: rowEventId[item.index],
          variant_id: rowVariantId[item.index] || undefined,
          property_id: rowPropertyId[item.index] || undefined,
        }));
      await onInstantiate(mappings, useCaseType);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-8">
      <div className="bg-white rounded-lg border shadow-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add use case to project</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
            Close
          </button>
        </div>
        <div className="space-y-1">
          <FieldLabel className="text-xs font-medium text-gray-500" htmlFor="instantiate-type" hintScope="Templates">
            Type
          </FieldLabel>
          <select
            id="instantiate-type"
            value={useCaseType}
            onChange={(e) => setUseCaseType(e.target.value)}
            className="block h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
          >
            {USE_CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">Marketing or transactional; suggested from the template's channels and name.</p>
        </div>
        {preview.resolved.some((r) => r.catalog_markets && r.catalog_markets.length > 0) && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900">Catalog attributes per market</h3>
            <table className="w-full text-left text-xs border rounded-md overflow-hidden">
              <tbody className="divide-y">
                {preview.resolved
                  .filter((r) => r.catalog_markets && r.catalog_markets.length > 0)
                  .map((r) => (
                    <tr key={r.index}>
                      <td className="px-3 py-2 font-medium">{r.field_name}</td>
                      <td className="px-3 py-2">
                        {r.catalog_markets!.map((m) => (
                          <span key={m.catalog_id} className={`inline-block mr-3 ${m.has_field ? 'text-green-700' : 'text-red-700'}`}>
                            {[m.market, m.language].filter(Boolean).join(' / ') || m.name}: {m.has_field ? 'has it' : 'missing'}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {preview.resolved.some((r) => r.partial) && (
              <p className="text-xs text-gray-500">An attribute missing in a market is created as a gap requirement listing the markets.</p>
            )}
          </div>
        )}
        {preview.unresolved.length === 0 ? (
          <p className="text-sm text-gray-500">Every requirement resolves against this project.</p>
        ) : (
          <p className="text-sm text-gray-500">
            These requirements did not resolve against this project. Pick an event (and, where needed, a variant and
            property) for each, or leave it as Skip to create it as a gap.
          </p>
        )}

        {preview.unresolved.length > 0 && (
        <table className="w-full text-left text-xs border rounded-md overflow-hidden">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Target</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Event</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Variant</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Property</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.unresolved.map((item) => {
                const needs = pickersFor(item.target_kind);
                const candidates = item.candidates;
                const selectedEventId = rowEventId[item.index] ?? '';
                const selectedEvent = candidates.find((c) => c.id === selectedEventId) ?? null;
                return (
                  <tr key={item.index}>
                    <td className="px-3 py-2">
                      {item.target_kind}
                      {item.standard_event ? ` (${item.standard_event})` : ''}
                      {item.property_name ? ` · ${item.property_name}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      {needs.event ? (
                        <select
                          className="border rounded px-1 py-0.5"
                          value={selectedEventId}
                          onChange={(e) => setEvent(item.index, e.target.value)}
                        >
                          <option value="">Skip</option>
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {needs.variant && selectedEvent ? (
                        <select
                          className="border rounded px-1 py-0.5"
                          value={rowVariantId[item.index] ?? ''}
                          onChange={(e) => setRowVariantId((prev) => ({ ...prev, [item.index]: e.target.value }))}
                        >
                          <option value="">(none)</option>
                          {selectedEvent.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {needs.property && selectedEvent ? (
                        <select
                          className="border rounded px-1 py-0.5"
                          value={rowPropertyId[item.index] ?? ''}
                          onChange={(e) => setRowPropertyId((prev) => ({ ...prev, [item.index]: e.target.value }))}
                        >
                          <option value="">(none)</option>
                          {selectedEvent.properties.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={submitting}>
            Create use case
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  projectId,
  onClose,
  onUpdated,
}: {
  template: TemplateRow;
  projectId: string | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [resolvePreview, setResolvePreview] = useState<ResolvePreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const saveTemplateField = async (field: 'internal_notes' | 'internal_url', value: string) => {
    await fetchWithAuth(`${API_BASE}/api/use-case-templates/${template.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value.trim() || null }),
    });
    await onUpdated();
  };

  useEffect(() => {
    if (!projectId) return;
    setLoadingPreview(true);
    fetchWithAuth(`${API_BASE}/api/projects/${projectId}/use-cases/from-template/${template.id}/preview`, {
      method: 'POST',
    })
      .then(parseJson)
      .then((data) => setResolvePreview(data as ResolvePreviewResult))
      .finally(() => setLoadingPreview(false));
  }, [projectId, template.id]);

  const groupLabel: Record<ResolvePreviewGroup['group'], string> = {
    events: 'Events',
    customer_properties: 'Customer properties',
    catalog: 'Catalog',
    consents: 'Consents',
  };

  const statusColor: Record<ResolvePreviewGroup['status'], string> = {
    all: 'text-green-700 bg-green-50 border-green-200',
    mixed: 'text-amber-700 bg-amber-50 border-amber-200',
    none: 'text-gray-500 bg-gray-50 border-gray-200',
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {template.code} — {template.name}
          </h2>
          {template.description && <p className="text-sm text-gray-500 mt-1">{template.description}</p>}
          {template.documentation_url && (
            <p className="text-sm mt-1">
              <a
                href={template.documentation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {template.source_json?.kind === 'pnp_usecase' ? 'Bloomreach documentation' : 'Documentation'}
              </a>
            </p>
          )}
          {template.source_json?.callout && (
            <p className="text-sm italic text-gray-500 mt-1">"{template.source_json.callout}"</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
          Close
        </button>
      </div>

      {(template.prerequisites_json.length > 0 || template.expected_assets_json.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {template.prerequisites_json.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Prerequisites (not tracking-resolvable)</h3>
              <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1">
                {template.prerequisites_json.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {template.expected_assets_json.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Expected assets</h3>
              <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1">
                {template.expected_assets_json.map((a, i) => (
                  <li key={i}>
                    {a.type} — {a.headline}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Prerequisites (for the current project)</h3>
        {!projectId && <p className="text-sm text-gray-500">Select a project to see resolve status.</p>}
        {projectId && loadingPreview && <p className="text-sm text-gray-500">Checking…</p>}
        {projectId && resolvePreview && (
          <div className="flex flex-wrap gap-2">
            {resolvePreview.groups.map((g) => (
              <div key={g.group} className={`text-xs px-3 py-2 rounded-md border ${statusColor[g.status]}`}>
                <div className="font-medium">{groupLabel[g.group]}</div>
                <div>
                  {g.resolved} / {g.total} resolved ({g.status})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Default requirements</h3>
        <table className="w-full text-left text-xs border rounded-md overflow-hidden">
          <thead className="bg-gray-50 border-b">
            <tr>
              <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Target kind</HintTh>
              <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Target</HintTh>
              <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Level</HintTh>
              <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Note</HintTh>
            </tr>
          </thead>
          <tbody className="divide-y">
            {template.default_requirements_json.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2">{r.target_kind}</td>
                <td className="px-3 py-2">
                  {r.event_name ?? ''}
                  {r.condition ? `[${r.condition.property_name}=${r.condition.value}]` : ''}
                  {r.property_name ? ` · ${r.property_name}` : ''}
                </td>
                <td className="px-3 py-2">{r.level}</td>
                <td className="px-3 py-2 text-gray-500">{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Internal (never shown to the client)</h3>
        <div className="space-y-2">
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-700" hintScope="Templates">Internal notes</FieldLabel>
            <textarea
              className="w-full h-16 rounded-md border border-gray-300 px-3 py-2 text-xs"
              defaultValue={template.internal_notes ?? ''}
              onBlur={(e) => void saveTemplateField('internal_notes', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-700" hintScope="Templates">Internal link</FieldLabel>
            <Input
              defaultValue={template.internal_url ?? ''}
              onBlur={(e) => void saveTemplateField('internal_url', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportLibraryBox({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ applied: string[]; skipped: string[] } | null>(null);

  const handlePreview = async () => {
    setError(null);
    setSummary(null);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      setError('This is not valid JSON.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/use-case-templates/import/preview`, {
        method: 'POST',
        body: JSON.stringify(json),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Preview failed.');
        setPreview(null);
        return;
      }
      setPreview(data as PreviewResult);
      setSelected(new Set((data.items as DiffItem[]).filter((i) => i.default_selected).map((i) => i.id)));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      setError('This is not valid JSON.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/use-case-templates/import/apply`, {
        method: 'POST',
        body: JSON.stringify({ payload, payload_hash: preview.payload_hash, selected_item_ids: Array.from(selected) }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        if (data?.code === 'PAYLOAD_CHANGED') {
          setError('The pasted JSON changed since preview; re-run preview before applying.');
        } else {
          setError(typeof data?.error === 'string' ? data.error : 'Apply failed.');
        }
        return;
      }
      setSummary(data);
      setPreview(null);
      setText('');
      await onImported();
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Import library</h2>
      <textarea
        className="w-full h-32 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono"
        placeholder="Paste e3-use-case-library JSON here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={!text.trim() || loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Preview
        </Button>
        {preview && (
          <Button type="button" onClick={() => void handleApply()} disabled={loading || selected.size === 0}>
            Apply ({selected.size} selected)
          </Button>
        )}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {preview && preview.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-1">
          {preview.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      {summary && (
        <div className="text-sm text-gray-600">
          Applied {summary.applied.length}, skipped {summary.skipped.length}.
        </div>
      )}

      {preview && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 w-8" />
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Op</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Code</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Templates">Changes</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td className="px-3 py-2">{item.op}</td>
                  <td className="px-3 py-2">{item.entity_key}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {item.changes.map((c, i) => (
                      <div key={i}>
                        {c.field}: {formatChangeValue(c.before)} → {formatChangeValue(c.after)}
                      </div>
                    ))}
                    {item.changes.length === 0 && item.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
