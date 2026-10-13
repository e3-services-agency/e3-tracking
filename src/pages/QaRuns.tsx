import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
/**
 * QA runs page (T-1-09, D-07 simplified UI): a table of runs (auto-created by the customer events
 * export import, T-1-09; `agent_session`/`manual` runs are phase 2) and a detail sheet per run
 * with its observations, archive/finish actions, and a "Run comparison" button (D-21: comparison
 * always recomputes over the whole project; this button is a convenience trigger after a run).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { Button } from '@/src/components/ui/Button';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { parseQaRunsResponse } from '@/src/domain/qaRunsResponse';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';
import { QaSamplesTable } from '@/src/components/ui/QaSamplesTable';
import { qaSampleFacts, qaSampleSummaryLine, type QaSampleEntry } from '@/src/domain/import/qaSampleManifest';
import { EmptyState } from '@/src/components/ui/EmptyState';

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
  source?: string | null;
  manifest_json?: unknown;
  samples_json?: QaSampleEntry[] | null;
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
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const [runs, setRuns] = useState<QaRunRow[]>([]);
  const { sorted: sortedRuns, sort } = useSortableTable(runs, {
    kind: (r) => r.kind,
    actor: (r) => r.actor,
    environment: (r) => r.environment,
    started: (r) => r.started_at,
    finished: (r) => r.finished_at,
    archived: (r) => r.archived,
  });
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
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">QA runs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Runs group <GlossaryTerm glossaryKey="observation">observations</GlossaryTerm> in <GlossaryTerm glossaryKey="batch">batches</GlossaryTerm> (customer events exports; agent sessions in a later phase).
        </p>
      </PageHeader>

      <PageBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableTh sort={sort} column="kind" className="px-6 py-3 font-medium text-gray-500" hint="Kind" hintScope="QaRuns">Kind</SortableTh>
                <SortableTh sort={sort} column="actor" className="px-6 py-3 font-medium text-gray-500" hint="Actor" hintScope="QaRuns">Actor</SortableTh>
                <SortableTh sort={sort} column="environment" className="px-6 py-3 font-medium text-gray-500" hint="Environment" hintScope="QaRuns">Environment</SortableTh>
                <SortableTh sort={sort} column="started" className="px-6 py-3 font-medium text-gray-500" hint="Started" hintScope="QaRuns">Started</SortableTh>
                <SortableTh sort={sort} column="finished" className="px-6 py-3 font-medium text-gray-500" hint="Finished" hintScope="QaRuns">Finished</SortableTh>
                <SortableTh sort={sort} column="archived" className="px-6 py-3 font-medium text-gray-500" hint="Archived" hintScope="QaRuns">Archived</SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedRuns.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => {
                    setSelectedId(run.id);
                    setIsSheetOpen(true);
                  }}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{run.kind}{run.source && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700" data-testid="run-source">{run.source}</span>}{run.notes && <div className="text-xs font-normal text-gray-500">{run.notes}</div>}</td>
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
                <EmptyState
                  colSpan={6}
                  message="No QA runs yet. Apply a customer events export from the Import page to create one."
                  actionLabel="Go to Import"
                  onAction={() => setRequestedTab('import')}
                />
              )}
            </tbody>
          </table>
        </div>
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title="QA run">
        {selectedId && (
          <QaRunDetail
            projectId={activeProjectId}
            runId={selectedId}
            onChanged={async () => {
              await load();
            }}
            onDeleted={() => {
              setIsSheetOpen(false);
              setSelectedId(null);
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
  onDeleted,
}: {
  projectId: string;
  runId: string;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<QaRunRow | null>(null);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{ open: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // D-52, T-3-07: one observation's properties JSON textarea open for editing at a time.
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [obsError, setObsError] = useState<string | null>(null);
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

  const deleteRun = async () => {
    if (!window.confirm('Delete this QA run and all its observations? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/qa-runs/${runId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        // LOW 4 (fix round): close the sheet -- the deleted run's Archive/Finish/Edit/Delete
        // controls would otherwise stay visible and 404 on the next click.
        onDeleted();
        await onChanged();
      } else {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to delete this QA run.');
      }
    } catch {
      setError('Failed to delete this QA run.');
    } finally {
      setBusy(false);
    }
  };

  const startEditObservation = (obs: ObservationRow) => {
    setEditingObsId(obs.id);
    setEditText(JSON.stringify(obs.properties_json, null, 2));
    setObsError(null);
  };

  const cancelEditObservation = () => {
    setEditingObsId(null);
    setEditText('');
    setObsError(null);
  };

  const saveEditObservation = async (obsId: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editText);
    } catch {
      setObsError('Properties must be valid JSON.');
      return;
    }
    // Fix round WARNING 2: only submit when the parsed JSON is a plain object -- a bare number,
    // string, array or null parses fine but is not a valid `properties` value (the API itself now
    // rejects it with 400, but catching it here avoids the round trip and gives a clearer message).
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setObsError('Properties must be a JSON object, e.g. {"total_price": 28}.');
      return;
    }
    const properties = parsed as Record<string, unknown>;
    setBusy(true);
    setObsError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/observations/${obsId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
      const data = await parseJson(res);
      if (res.ok) {
        setEditingObsId(null);
        setEditText('');
        await load();
        await onChanged();
      } else {
        setObsError(typeof data?.error === 'string' ? data.error : 'Failed to save this observation.');
      }
    } catch {
      setObsError('Failed to save this observation.');
    } finally {
      setBusy(false);
    }
  };

  const deleteObservation = async (obsId: string) => {
    if (!window.confirm('Delete this observation?')) return;
    setBusy(true);
    setObsError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/observations/${obsId}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        await load();
        await onChanged();
      } else {
        const data = await parseJson(res);
        setObsError(typeof data?.error === 'string' ? data.error : 'Failed to delete this observation.');
      }
    } catch {
      setObsError('Failed to delete this observation.');
    } finally {
      setBusy(false);
    }
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
      {run.manifest_json != null && (() => {
        const f = qaSampleFacts(run.manifest_json);
        return (
          <div className="text-sm space-y-1 rounded border p-3" data-testid="qa-sample-facts">
            <div className="font-medium text-gray-900">Extension sample ({run.source ?? 'extension'})</div>
            <div>Sample: {qaSampleSummaryLine(f) || '-'}</div>
            <div>Tool build: {f.tool ?? '-'} {f.build ?? ''}</div>
            {f.redacted && <div>Redaction: {f.values_masked ?? '?'} values masked. {f.redaction_note ?? ''}</div>}
            <QaSamplesTable samples={run.samples_json} />
          </div>
        );
      })()}

      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Notes" hintScope="QaRuns">Notes</FieldLabel>
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
        <a href={`${API_BASE}/api/projects/${projectId}/export/qa-runs/${runId}/customer-events-export.json`} download="customer-events-export.json">
          <Button type="button" variant="outline">
            Download customer-events-export.json
          </Button>
        </a>
        <Button type="button" variant="destructive" onClick={() => void deleteRun()} disabled={busy}>
          Delete run
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
        {obsError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-2">{obsError}</div>
        )}
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hint="Type" hintScope="QaRuns">Type</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hint="Timestamp" hintScope="QaRuns">Timestamp</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hint="Resolved" hintScope="QaRuns">Resolved</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hint="Properties" hintScope="QaRuns">Properties</HintTh>
                <HintTh className="px-3 py-2 font-medium text-gray-500" hint="Actions" hintScope="QaRuns">Actions</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {observations.map((obs) => (
                <React.Fragment key={obs.id}>
                  <tr>
                    <td className="px-3 py-2 font-mono">{obs.event_type}</td>
                    <td className="px-3 py-2 text-gray-500">{new Date(obs.timestamp * 1000).toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-500">{obs.event_id ? (obs.variant_id ? 'event + variant' : 'event') : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={JSON.stringify(obs.properties_json)}>
                      {JSON.stringify(obs.properties_json)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => startEditObservation(obs)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => void deleteObservation(obs.id)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingObsId === obs.id && (
                    <tr>
                      <td colSpan={5} className="px-3 py-2 bg-gray-50">
                        <textarea
                          className="w-full h-32 rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="flex gap-2 mt-2">
                          <Button type="button" size="sm" onClick={() => void saveEditObservation(obs.id)} disabled={busy}>
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={cancelEditObservation} disabled={busy}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {observations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
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
