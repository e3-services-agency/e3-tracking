/**
 * Import page (T-1-08/T-1-09, D-04, D-22): one paste box per Bloomreach format, a Preview button, a
 * checkbox table of the proposed diff, an Apply button, and a result summary. The third box
 * (`CustomerEventsImportBox`, T-1-09) is a different shape from the other two — its "diff" is a
 * resolution preview (per-type counts, resolved/unknown, duplicates), not proposed entity writes —
 * and its apply lands on the Findings page filtered to the new run. Export buttons below download
 * the two data-mapping/expiration-settings formats as `.json`.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { HintTh } from '@/src/components/ui/FieldHint';
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

interface DiffItem {
  id: string;
  op: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict';
  entity_type: string;
  entity_key: string;
  changes: { field: string; before: unknown; after: unknown }[];
  default_selected: boolean;
  note?: string;
  /** Always applied regardless of the checkbox (D-35's Data Manager snapshot items). */
  locked?: boolean;
  /** `EventClass` (T-2-03): set on the Data Manager events per-event items only. */
  class?: string;
}

/** `null`/`undefined` render as "(none)"; objects/arrays are JSON-stringified; everything else as-is. */
function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface PreviewFinding {
  kind: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

interface PreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
  /** T-2-05: only the data-mapping preview sets this (comparison 1 against the pasted file, D-22, never persisted). */
  findings?: PreviewFinding[];
}

interface ApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

type Format = 'data-mapping' | 'expiration-settings' | 'data-manager-customers' | 'data-manager-events';

function ImportBox({
  format,
  title,
  disabled,
  projectId,
  showClassColumn,
}: {
  format: Format;
  title: string;
  disabled?: boolean;
  projectId: string;
  /** T-2-03: Data Manager events box shows the `class` column and a "select all custom" toggle. */
  showClassColumn?: boolean;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApplySummary | null>(null);

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
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/import/${format}/preview`, {
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
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/import/${format}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          payload,
          payload_hash: preview.payload_hash,
          selected_item_ids: Array.from(selected),
        }),
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
      setSummary(data as ApplySummary);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (item: DiffItem) => {
    if (item.locked) return; // not deselectable (D-35); checkbox is rendered disabled
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  /** T-2-03: selects every `class: "custom"` item (events, plus the properties/links that come with
   * them) and deselects every sdk/platform item, leaving locked (always-applied) items untouched. */
  const selectAllCustom = () => {
    if (!preview) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of preview.items) {
        if (item.locked || item.class === undefined) continue;
        if (item.class === 'custom') next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <textarea
        className="w-full h-32 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono disabled:bg-gray-50 disabled:text-gray-400"
        placeholder={disabled ? 'Available in a later task (T-1-09).' : `Paste ${title} JSON here…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={disabled || !text.trim() || loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Preview
        </Button>
        {preview && (
          <Button type="button" onClick={() => void handleApply()} disabled={loading || selected.size === 0}>
            Apply ({selected.size} selected)
          </Button>
        )}
        {preview && showClassColumn && (
          <Button type="button" variant="outline" onClick={selectAllCustom}>
            Select all custom
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

      {preview && preview.findings && preview.findings.length > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 space-y-1">
          <div className="font-medium">Definition vs mapping (comparison 1, not applied):</div>
          {preview.findings.map((f, i) => (
            <div key={i}>
              [{f.severity}] {f.kind}: {f.message}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 w-8" />
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Op</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Entity</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Key</HintTh>
                {showClassColumn && <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Class</HintTh>}
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Changes</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Note</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.items.length === 0 && (
                <tr>
                  <td colSpan={showClassColumn ? 7 : 6} className="px-3 py-4 text-center text-gray-400">
                    Nothing to propose — everything already matches.
                  </td>
                </tr>
              )}
              {preview.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={item.locked || selected.has(item.id)}
                      disabled={item.locked}
                      onChange={() => toggle(item)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{item.op}</td>
                  <td className="px-3 py-2">{item.entity_type}</td>
                  <td className="px-3 py-2 font-mono">{item.entity_key}</td>
                  {showClassColumn && <td className="px-3 py-2 font-mono">{item.class ?? '—'}</td>}
                  <td className="px-3 py-2 text-gray-500">
                    {item.changes.length > 0 && (
                      <ul className="space-y-0.5">
                        {item.changes.map((c, i) => (
                          <li key={i}>
                            <span className="font-mono">{c.field}</span>: {formatChangeValue(c.before)} →{' '}
                            {formatChangeValue(c.after)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Applied {summary.applied.length} item(s){summary.skipped.length > 0 ? `, skipped ${summary.skipped.length}` : ''}.
        </div>
      )}

      {summary && summary.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-1">
          {summary.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CustomerEventsTypeSummary {
  type: string;
  count: number;
  resolved: boolean;
  known_system: boolean;
  variants: string[];
}

interface CustomerEventsPreviewResult {
  items: DiffItem[];
  type_summary: CustomerEventsTypeSummary[];
  duplicate_count: number;
  warnings: string[];
  payload_hash: string;
  run_header: { kind: string; customer_id: string | null };
}

interface CustomerEventsApplyResult {
  run: { id: string; kind: string };
  inserted: number;
  skipped: number;
  comparison: { open: Record<string, number> };
}

/**
 * The third Import box (T-1-09): unlike `ImportBox` (T-1-08 data-mapping/expiration-settings),
 * this format proposes no definition writes — the "diff" is a resolution preview (per-type counts,
 * resolved/unknown, duplicates) and `apply` creates a `QaRun` + `Observation`s and runs comparison
 * 3, landing on the Findings page filtered to the new run (plan T-1-09 acceptance).
 */
function CustomerEventsImportBox({ projectId }: { projectId: string }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<CustomerEventsPreviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CustomerEventsApplyResult | null>(null);
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setPendingFindingsRunId = useStore((s) => s.setPendingFindingsRunId);

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
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/import/customer-events-export/preview`, {
        method: 'POST',
        body: JSON.stringify(json),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Preview failed.');
        setPreview(null);
        return;
      }
      const result = data as CustomerEventsPreviewResult;
      setPreview(result);
      setSelected(new Set(result.items.filter((i) => i.default_selected).map((i) => i.id)));
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
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/import/customer-events-export/apply`, {
        method: 'POST',
        body: JSON.stringify({
          payload,
          payload_hash: preview.payload_hash,
          selected_item_ids: Array.from(selected),
        }),
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
      const result = data as CustomerEventsApplyResult;
      setSummary(result);
      setPreview(null);
      // Land on the Findings page filtered to this run (T-1-09 acceptance).
      setPendingFindingsRunId(result.run.id);
      setRequestedTab('findings');
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
      <h2 className="text-base font-semibold text-gray-900">Customer events export</h2>
      <textarea
        className="w-full h-32 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono"
        placeholder="Paste customer-events-export.json here…"
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

      {preview && (
        <>
          <div className="text-sm text-gray-600">
            {preview.items.length} event(s) parsed, {preview.duplicate_count} duplicate(s) already present elsewhere in
            this project (deselected by default).
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Type</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Count</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Resolution</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Variant(s)</HintTh>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.type_summary.map((t) => (
                  <tr key={t.type}>
                    <td className="px-3 py-2 font-mono">{t.type}</td>
                    <td className="px-3 py-2">{t.count}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {t.resolved ? 'resolved' : t.known_system ? 'known system type (unresolved)' : 'unknown (unexpected_event)'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{t.variants.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 w-8" />
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Event</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Import">Note</HintTh>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono">{item.entity_key}</td>
                    <td className="px-3 py-2 text-gray-500">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {summary && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Created QA run with {summary.inserted} observation(s) ({summary.skipped} skipped). Open findings:{' '}
          {summary.comparison.open.error ?? 0} error, {summary.comparison.open.warning ?? 0} warning,{' '}
          {summary.comparison.open.info ?? 0} info. See the Findings page.
        </div>
      )}
    </div>
  );
}

interface QaSamplePreview {
  facts: {
    sample_method: string | null;
    requested: number | null;
    read: number | null;
    matched: number | null;
    redacted: boolean;
    values_masked: number | null;
    redaction_note: string | null;
    build: string | null;
  };
  run_name: string;
  customers: number;
  events: number;
  event_types: number;
  duplicate_count: number;
  data_manager: { events: number; properties: number; items: DiffItem[]; warnings: string[] };
  warnings: string[];
  payload_hash: string;
}

/** T-5-30: one zip from the QA sampler extension: preview, then one confirm (D-04, D-22). */
function QaSampleImportBox({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QaSamplePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const url = (path: string) => `${API_BASE}/api/projects/${projectId}/import/qa-sample/${path}`;

  async function runPreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithAuth(url('preview'), { method: 'POST', body: form });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Preview failed.');
      setPreview(data);
      setPage(0);
      setSelected(
        new Set((data.data_manager.items as DiffItem[]).filter((i) => i.default_selected || i.locked).map((i) => i.id))
      );
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'Preview failed.');
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    if (!file || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('payload_hash', preview.payload_hash);
      form.append('selected_item_ids', JSON.stringify([...selected]));
      const res = await fetchWithAuth(url('apply'), { method: 'POST', body: form });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? 'Apply failed.');
      setDone(
        `Created QA run "${data.run.notes}" with ${data.inserted} observation(s); applied ${data.data_manager.applied.length} Data Manager item(s). Open findings: ${data.comparison.open.error ?? 0} error, ${data.comparison.open.warning ?? 0} warning, ${data.comparison.open.info ?? 0} info.`
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3" data-testid="qa-sample-import">
      <h2 className="text-base font-semibold text-gray-900">Import QA sample archive</h2>
      <p className="text-sm text-gray-500">
        Upload the zip from the QA sampler extension. It creates one QA run from the sampled events and updates the Data
        Manager schema after you confirm the diff.
      </p>
      <div className="flex gap-2 items-center">
        <input
          type="file"
          accept=".zip,application/zip"
          aria-label="QA sample archive"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setDone(null);
          }}
        />
        <Button type="button" variant="outline" disabled={!file || loading} onClick={runPreview}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview'}
        </Button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {preview && (
        <div className="space-y-3 text-sm">
          <div>
            <strong>{preview.run_name}</strong>: {preview.customers} customer(s), {preview.events} event(s),{' '}
            {preview.event_types} event type(s); Data Manager: {preview.data_manager.events} event(s),{' '}
            {preview.data_manager.properties} property(ies).
          </div>
          <div>
            Sample: {preview.facts.sample_method ?? 'unknown method'}, read {preview.facts.read ?? '?'} of{' '}
            {preview.facts.requested ?? '?'} requested, {preview.facts.matched ?? '?'} matched
            {preview.facts.build ? ` (${preview.facts.build})` : ''}.
          </div>
          {preview.facts.redacted && (
            <div>
              Redaction: {preview.facts.values_masked ?? '?'} value(s) masked. {preview.facts.redaction_note}
            </div>
          )}
          {preview.duplicate_count > 0 && (
            <div>{preview.duplicate_count} event(s) already present elsewhere in this project.</div>
          )}
          {[...preview.warnings, ...preview.data_manager.warnings].map((w, i) => (
            <div key={i} className="text-amber-700">
              {w}
            </div>
          ))}
          <div className="font-medium">Data Manager changes</div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-8" />
                <HintTh hintScope="Import">Op</HintTh>
                <HintTh hintScope="Import">Entity</HintTh>
                <HintTh hintScope="Import">Key</HintTh>
                <HintTh hintScope="Import">Changes</HintTh>
              </tr>
            </thead>
            <tbody>
              {preview.data_manager.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item) => (
                <tr key={item.id} className="border-t">
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Apply ${item.entity_key}`}
                      checked={selected.has(item.id)}
                      disabled={item.locked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td>{item.op}</td>
                  <td>{item.entity_type}</td>
                  <td>{item.entity_key}</td>
                  <td>
                    {item.changes
                      .map((c) => `${c.field}: ${formatChangeValue(c.before)} -> ${formatChangeValue(c.after)}`)
                      .join('; ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(preview.data_manager.items.length / PAGE_SIZE))}; {selected.size} of{' '}
              {preview.data_manager.items.length} selected
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={(page + 1) * PAGE_SIZE >= preview.data_manager.items.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
          <Button type="button" disabled={loading} onClick={runApply}>
            Confirm import
          </Button>
        </div>
      )}
      {done && <div className="text-sm text-green-700">{done}</div>}
    </div>
  );
}

export function Import() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  const downloadUrl = (path: string) => `${API_BASE}/api/projects/${activeProjectId}/${path}`;

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a Bloomreach JSON export, preview the diff, select what to apply.
        </p>
      </PageHeader>

      <PageBody className="space-y-6">
        <ImportBox format="data-mapping" title="Data mapping" projectId={activeProjectId} />
        <ImportBox format="expiration-settings" title="Expiration settings" projectId={activeProjectId} />
        <ImportBox format="data-manager-customers" title="Data Manager customers" projectId={activeProjectId} />
        <ImportBox
          format="data-manager-events"
          title="Data Manager events"
          projectId={activeProjectId}
          showClassColumn
        />
        <CustomerEventsImportBox projectId={activeProjectId} />
        <QaSampleImportBox projectId={activeProjectId} />

        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Export</h2>
          <div className="flex gap-2">
            <a href={downloadUrl('export/data-mapping.json')} download="data-mapping.json">
              <Button type="button" variant="outline">
                Download data-mapping.json
              </Button>
            </a>
            <a href={downloadUrl('export/expiration-settings.json')} download="expiration-settings.json">
              <Button type="button" variant="outline">
                Download expiration-settings.json
              </Button>
            </a>
            <a href={downloadUrl('export/data-manager-customers.json')} download="data-manager-customers.json">
              <Button type="button" variant="outline">
                Download data-manager-customers.json
              </Button>
            </a>
            <a href={downloadUrl('export/data-manager-events.json')} download="data-manager-events.json">
              <Button type="button" variant="outline">
                Download data-manager-events.json
              </Button>
            </a>
          </div>
        </div>
      </PageBody>
    </div>
  );
}
