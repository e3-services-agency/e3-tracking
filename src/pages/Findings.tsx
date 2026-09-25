/**
 * Findings page (T-1-09, D-07 simplified UI; T-2-04 adds comparison 4, `data_manager`): a table of
 * findings from every comparison engine `POST /comparison/run` orchestrates, with filters
 * (comparison, kind, severity, event, status), from `enums.ts` — never hardcoded. Reads
 * `pendingFindingsRunId` from the store once (set by `QaRuns.tsx`'s "View findings for this run"
 * and by `Import.tsx`'s customer-events-export apply) to pre-filter by the observation's run.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { COMPARISON_IDS, FINDING_KINDS, FINDING_SEVERITIES, FINDING_STATUSES } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';

interface FindingRow {
  id: string;
  comparison: string;
  kind: string;
  severity: string;
  event_id: string | null;
  property_id: string | null;
  observation_id: string | null;
  qa_run_id: string | null;
  message: string | null;
  status: string;
  last_seen_at: string;
}

interface EventOption {
  id: string;
  name: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

const SEVERITY_BADGE: Record<string, string> = {
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
};

export function Findings() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [comparison, setComparison] = useState('');
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('open');
  // Starts `true`: the mount effect below fires a load immediately whenever the project context is
  // already valid (fix round re-sweep 02:16 FAIL: "No findings match these filters" showed briefly
  // before the findings fetch resolved on SPA navigation).
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingFindingsRunId = useStore((s) => s.pendingFindingsRunId);
  const setPendingFindingsRunId = useStore((s) => s.setPendingFindingsRunId);
  const [runIdFilter, setRunIdFilter] = useState<string | null>(null);

  useEffect(() => {
    if (pendingFindingsRunId) {
      setRunIdFilter(pendingFindingsRunId);
      setStatus('');
      setPendingFindingsRunId(null);
    }
  }, [pendingFindingsRunId, setPendingFindingsRunId]);

  const eventNameById = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);

  // Fetch race guard (fix round, same pattern as StandardEvents.tsx/QaRuns.tsx): filters and the
  // project id can both change quickly (e.g. project switch right after adjusting a filter), so
  // only the latest `load()` call may write to state.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) {
      setLoading(false);
      return;
    }
    const token = ++loadTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (comparison) params.set('comparison', comparison);
      if (kind) params.set('kind', kind);
      if (severity) params.set('severity', severity);
      if (eventId) params.set('event_id', eventId);
      if (status) params.set('status', status);
      if (runIdFilter) params.set('qa_run_id', runIdFilter);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/findings?${params.toString()}`);
      const data = await parseJson(res);
      const eventsRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events`);
      const eventsData = await parseJson(eventsRes);
      if (token !== loadTokenRef.current) return; // a newer load() has since started; discard this one
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load findings.');
        setFindings([]);
        return;
      }
      // A 200 whose body isn't a JSON array (unreadable body, or an unexpected shape) is an error,
      // never a silent empty list (reviewer PASS finding 1 on 7de9a5b, same pattern as QaRuns.tsx).
      if (!Array.isArray(data)) {
        console.error('Unexpected findings response shape', data);
        setError('Unexpected response');
        setFindings([]);
        return;
      }
      setFindings(data);
      if (eventsRes.ok) {
        if (Array.isArray(eventsData)) {
          setEvents(eventsData.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
        } else {
          console.error('Unexpected events response shape', eventsData);
        }
      }
    } catch {
      if (token !== loadTokenRef.current) return;
      setError('Failed to load findings.');
      setFindings([]);
    } finally {
      if (token === loadTokenRef.current) setLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId, comparison, kind, severity, eventId, status, runIdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const runComparison = async () => {
    if (!activeProjectId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comparison/run`, { method: 'POST' });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Comparison run failed.');
        return;
      }
      await load();
    } catch {
      setError('Comparison run failed.');
    } finally {
      setRunning(false);
    }
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Findings</h1>
          <p className="text-sm text-gray-500 mt-1">Definition vs observations (comparison 3) and definition vs Data Manager (comparison 4, D-21/D-28).</p>
        </div>
        <Button type="button" onClick={() => void runComparison()} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run comparison
        </Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Comparison</label>
            <select value={comparison} onChange={(e) => setComparison(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {COMPARISON_IDS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {FINDING_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {FINDING_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Event</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {FINDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {runIdFilter && (
            <Button type="button" variant="outline" onClick={() => setRunIdFilter(null)}>
              Clear run filter
            </Button>
          )}
        </div>

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Severity</th>
                <th className="px-6 py-3 font-medium text-gray-500">Kind</th>
                <th className="px-6 py-3 font-medium text-gray-500">Comparison</th>
                <th className="px-6 py-3 font-medium text-gray-500">Event</th>
                <th className="px-6 py-3 font-medium text-gray-500">Message</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {findings.map((f) => (
                <tr key={f.id}>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[f.severity] ?? ''}`}>
                      {f.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-700">{f.kind}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs">{f.comparison}</td>
                  <td className="px-6 py-4 text-gray-900">{f.event_id ? eventNameById.get(f.event_id) ?? f.event_id : '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{f.message ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500">{f.status}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(f.last_seen_at).toLocaleString()}</td>
                </tr>
              ))}
              {showEmptyState(loading, findings.length) && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No findings match these filters.
                  </td>
                </tr>
              )}
              {showLoadingPlaceholder(loading, findings.length) && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    Loading…
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
