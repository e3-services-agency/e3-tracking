/**
 * QA runs page (T-1-09, D-07 simplified UI): a table of runs (auto-created by the customer events
 * export import, T-1-09; `agent_session`/`manual` runs are phase 2) and a detail sheet per run
 * with its observations, archive/finish actions, and a "Run comparison" button (D-21: comparison
 * always recomputes over the whole project; this button is a convenience trigger after a run).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { parseQaRunsResponse } from '@/src/domain/qaRunsResponse';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';

interface QaRunRow {
  id: string;
  kind: string;
  actor: string | null;
  environment: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  archived: boolean;
  customer_id: string | null;
}

interface ObservationRow {
  id: string;
  event_type: string;
  event_id: string | null;
  variant_id: string | null;
  timestamp: number;
  properties_json: Record<string, unknown>;
  page_url: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function QaRuns() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [runs, setRuns] = useState<QaRunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks every load from the moment it starts, including on activeProjectId change and SPA
  // navigation (fix round re-sweep 02:16 FAIL: "No QA runs yet" showed briefly before the runs
  // fetch resolved). Starts `true` since the mount effect below fires a load immediately.
  const [isLoading, setIsLoading] = useState(true);

  // Fetch race guard (fix round FAIL-2 observation, same pattern as StandardEvents.tsx): only the
  // latest `load()` call for the current project may write to state, so an in-flight request for a
  // project the user has since navigated away from can't overwrite the current project's runs with
  // a stale (e.g. empty) list.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) {
      setIsLoading(false);
      return;
    }
    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/qa-runs`);
      const data = await parseJson(res);
      if (token !== loadTokenRef.current) return; // a newer load() has since started; discard this one
      const result = parseQaRunsResponse<QaRunRow>(res.ok, data);
      if (result.kind === 'not-ok') {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load QA runs.');
        setRuns([]);
        return;
      }
      if (result.kind === 'invalid-shape') {
        // A 200 whose body isn't a JSON array (unreadable body, or an unexpected shape) is an
        // error, never a silent empty list (reviewer PASS finding 1 on 7de9a5b).
        console.error('Unexpected qa-runs response shape', data);
        setError('Unexpected response');
        setRuns([]);
        return;
      }
      setRuns(result.runs);
    } catch {
      if (token !== loadTokenRef.current) return;
      setError('Failed to load QA runs.');
      setRuns([]);
    } finally {
      if (token === loadTokenRef.current) setIsLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">QA runs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Observation batches (customer events exports; agent sessions in a later phase).
        </p>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Kind</th>
                <th className="px-6 py-3 font-medium text-gray-500">Actor</th>
                <th className="px-6 py-3 font-medium text-gray-500">Environment</th>
                <th className="px-6 py-3 font-medium text-gray-500">Started</th>
                <th className="px-6 py-3 font-medium text-gray-500">Finished</th>
                <th className="px-6 py-3 font-medium text-gray-500">Archived</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => {
                    setSelectedId(run.id);
                    setIsSheetOpen(true);
                  }}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{run.kind}</td>
                  <td className="px-6 py-4 text-gray-500">{run.actor ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{run.environment ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-gray-500">{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{run.archived ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {showLoadingPlaceholder(isLoading, runs.length) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {showEmptyState(isLoading, runs.length) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No QA runs yet — apply a customer events export from the Import page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title="QA run">
        {selectedId && (
          <QaRunDetail
            projectId={activeProjectId}
            runId={selectedId}
            onChanged={async () => {
              await load();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function QaRunDetail({
  projectId,
  runId,
  onChanged,
}: {
  projectId: string;
  runId: string;
  onChanged: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<QaRunRow | null>(null);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{ open: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setPendingFindingsRunId = useStore((s) => s.setPendingFindingsRunId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/qa-runs/${runId}`);
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load this QA run.');
        return;
      }
      setRun(data);
      setObservations(Array.isArray(data.observations) ? data.observations : []);
      setNotes(data.notes ?? '');
    } catch {
      setError('Failed to load this QA run.');
    } finally {
      setLoading(false);
    }
  }, [projectId, runId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArchive = async () => {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/qa-runs/${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !run.archived }),
      });
      if (res.ok) {
        await load();
        await onChanged();
      } else {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update this QA run.');
      }
    } catch {
      setError('Failed to update this QA run.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/qa-runs/${runId}/finish`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        await load();
        await onChanged();
      } else {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to finish this QA run.');
      }
    } catch {
      setError('Failed to finish this QA run.');
    } finally {
      setBusy(false);
    }
  };

  const runComparison = async () => {
    setBusy(true);
    setComparisonResult(null);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/comparison/run`, { method: 'POST' });
      const data = await parseJson(res);
      if (res.ok) {
        setComparisonResult(data);
      } else {
        setError(typeof data?.error === 'string' ? data.error : 'Comparison run failed.');
      }
    } catch {
      setError('Comparison run failed.');
    } finally {
      setBusy(false);
    }
  };

  const viewFindings = () => {
    setPendingFindingsRunId(runId);
    setRequestedTab('findings');
  };

  if (!loading && !run && error) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 m-4">{error}</div>;
  }
  if (loading || !run) return <div className="text-sm text-gray-500 p-4">Loading…</div>;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">Kind</div>
          <div className="font-medium text-gray-900">{run.kind}</div>
        </div>
        <div>
          <div className="text-gray-500">Actor</div>
          <div className="font-medium text-gray-900">{run.actor ?? '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">Customer id</div>
          <div className="font-medium text-gray-900">{run.customer_id ?? '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">Started</div>
          <div className="font-medium text-gray-900">{new Date(run.started_at).toLocaleString()}</div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Notes</label>
        <textarea
          className="w-full h-20 rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void toggleArchive()} disabled={busy}>
          {run.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button type="button" variant="outline" onClick={() => void finish()} disabled={busy || !!run.finished_at}>
          {run.finished_at ? 'Finished' : 'Finish'}
        </Button>
        <Button type="button" onClick={() => void runComparison()} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run comparison
        </Button>
        <Button type="button" variant="outline" onClick={viewFindings}>
          View findings for this run
        </Button>
      </div>

      {comparisonResult && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Open findings: {comparisonResult.open.error ?? 0} error, {comparisonResult.open.warning ?? 0} warning,{' '}
          {comparisonResult.open.info ?? 0} info.
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Observations ({observations.length})</h3>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 font-medium text-gray-500">Timestamp</th>
                <th className="px-3 py-2 font-medium text-gray-500">Resolved</th>
                <th className="px-3 py-2 font-medium text-gray-500">Properties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {observations.map((obs) => (
                <tr key={obs.id}>
                  <td className="px-3 py-2 font-mono">{obs.event_type}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(obs.timestamp * 1000).toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-500">{obs.event_id ? (obs.variant_id ? 'event + variant' : 'event') : '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={JSON.stringify(obs.properties_json)}>
                    {JSON.stringify(obs.properties_json)}
                  </td>
                </tr>
              ))}
              {observations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    No observations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
