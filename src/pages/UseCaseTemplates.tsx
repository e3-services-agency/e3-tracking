/**
 * Use case templates page (T-3-06, D-47, D-57): the global library's own page, separate from the
 * project's Use cases page (which keeps its single-template "Create from template" select). Plain
 * table + form UI (D-07): facet filter bar, import paste box with a preview table and Apply,
 * Export, per-template Instantiate, multi-select "Add to project", and a template detail panel
 * with the prerequisites card (resolve status per group for the current project).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import {
  LIBRARY_CHANNELS,
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

interface TemplateRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  default_requirements_json: DefaultRequirement[];
  tags_json: TemplateTags;
  flags_json: TemplateFlags;
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

interface ResolvePreviewResult {
  groups: ResolvePreviewGroup[];
  unresolved_count: number;
  total_count: number;
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

  const toggleFacetValue = (facet: string, value: string) => {
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

  const instantiate = async (templateId: string) => {
    if (!activeProjectId) {
      setActionError('Select a project first.');
      return;
    }
    setActionError(null);
    setActionMessage(null);
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${templateId}`, {
      method: 'POST',
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

  const addSelectedToProject = async () => {
    if (!activeProjectId || selectedIds.size === 0) return;
    setActionError(null);
    setActionMessage(null);
    let created = 0;
    for (const id of selectedIds) {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/use-cases/from-template/${id}`, {
        method: 'POST',
      });
      if (res.ok) created += 1;
    }
    setActionMessage(`Created ${created} of ${selectedIds.size} use case${selectedIds.size === 1 ? '' : 's'}.`);
    setSelectedIds(new Set());
  };

  const detailTemplate = detailId ? templates.find((t) => t.id === detailId) ?? null : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Use case templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            The shared library (D-06): import, filter, and instantiate into the current project.
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
      </div>

      <div className="p-8 space-y-6">
        {actionError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>}
        {actionMessage && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{actionMessage}</div>}

        <ImportLibraryBox onImported={load} />

        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          <div className="flex flex-wrap gap-6">
            {FACETS.map(({ key, label, values }) => (
              <div key={key} className="space-y-1">
                <div className="text-xs font-medium text-gray-500">{label}</div>
                <div className="flex flex-wrap gap-1 max-w-xs">
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
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 w-8" />
                <th className="px-4 py-2 font-medium text-gray-500">Code</th>
                <th className="px-4 py-2 font-medium text-gray-500">Name</th>
                <th className="px-4 py-2 font-medium text-gray-500">Type</th>
                <th className="px-4 py-2 font-medium text-gray-500">Flags</th>
                <th className="px-4 py-2 font-medium text-gray-500">Requirements</th>
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
                    <td className="px-4 py-2 font-medium text-gray-900">{t.name}</td>
                    <td className="px-4 py-2 text-gray-500">{t.type}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {t.flags_json?.new && <span className="text-xs text-emerald-700 mr-2">new</span>}
                      {t.flags_json?.popular && <span className="text-xs text-amber-700">popular</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{t.default_requirements_json?.length ?? 0}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => void instantiate(t.id)} disabled={!activeProjectId}>
                        Instantiate
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && filteredTemplates.length === 0 && (
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
          <TemplateDetail template={detailTemplate} projectId={activeProjectId} onClose={() => setDetailId(null)} />
        )}
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  projectId,
  onClose,
}: {
  template: TemplateRow;
  projectId: string | null;
  onClose: () => void;
}) {
  const [resolvePreview, setResolvePreview] = useState<ResolvePreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

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
        </div>
        <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900">
          Close
        </button>
      </div>

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
              <th className="px-3 py-2 font-medium text-gray-500">Target kind</th>
              <th className="px-3 py-2 font-medium text-gray-500">Target</th>
              <th className="px-3 py-2 font-medium text-gray-500">Level</th>
              <th className="px-3 py-2 font-medium text-gray-500">Note</th>
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
                <th className="px-3 py-2 font-medium text-gray-500">Op</th>
                <th className="px-3 py-2 font-medium text-gray-500">Code</th>
                <th className="px-3 py-2 font-medium text-gray-500">Changes</th>
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
