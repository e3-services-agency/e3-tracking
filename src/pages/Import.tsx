/**
 * Import page (T-1-08, D-04, D-22): one paste box per Bloomreach format, a Preview button, a
 * checkbox table of the proposed diff, an Apply button, and a result summary. The "customer events
 * export" box is present but disabled — its preview/apply lands on the findings table in T-1-09.
 * Export buttons below download the two supported formats as `.json`.
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
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
}

interface PreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

interface ApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

type Format = 'data-mapping' | 'expiration-settings';

function ImportBox({
  format,
  title,
  disabled,
  projectId,
}: {
  format: Format;
  title: string;
  disabled?: boolean;
  projectId: string;
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
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/import/${format}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          payload: JSON.parse(text),
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
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 font-medium text-gray-500">Op</th>
                <th className="px-3 py-2 font-medium text-gray-500">Entity</th>
                <th className="px-3 py-2 font-medium text-gray-500">Key</th>
                <th className="px-3 py-2 font-medium text-gray-500">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                    Nothing to propose — everything already matches.
                  </td>
                </tr>
              )}
              {preview.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono">{item.op}</td>
                  <td className="px-3 py-2">{item.entity_type}</td>
                  <td className="px-3 py-2 font-mono">{item.entity_key}</td>
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
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a Bloomreach JSON export, preview the diff, select what to apply (D-04, D-22).
        </p>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-6">
        <ImportBox format="data-mapping" title="Data mapping" projectId={activeProjectId} />
        <ImportBox format="expiration-settings" title="Expiration settings" projectId={activeProjectId} />
        <ImportBox format="data-mapping" title="Customer events export" disabled projectId={activeProjectId} />

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
          </div>
        </div>
      </div>
    </div>
  );
}
