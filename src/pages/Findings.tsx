import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import { SeverityBadge, StatusBadge } from '@/src/components/ui/badges';
/**
 * Findings page (T-1-09, D-07 simplified UI; T-2-04 adds comparison 4, `data_manager`): a table of
 * findings from every comparison engine `POST /comparison/run` orchestrates, with filters
 * (comparison, kind, severity, event, status), from `enums.ts` — never hardcoded. Reads
 * `pendingFindingsRunId` from the store once (set by `QaRuns.tsx`'s "View findings for this run"
 * and by `Import.tsx`'s customer-events-export apply) to pre-filter by the observation's run.
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { GlossaryTerm, FindingTerm } from '@/src/components/ui/GlossaryTerm';
import { comparisonLabel, kindLabel } from '@/src/domain/findingsCatalog';
import { Button } from '@/src/components/ui/Button';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { COMPARISON_IDS, FINDING_KINDS, FINDING_SEVERITIES, FINDING_STATUSES } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';
import { EmptyState } from '@/src/components/ui/EmptyState';

interface FindingRow {
  id: string;
  comparison: string;
  kind: string;
  severity: string;
  event_id: string | null;
  property_id: string | null;
  observation_id: string | null;
  qa_run_id: string | null;
  expected_json?: unknown;
  message: string | null;
  status: string;
  last_seen_at: string;
}

/** T-2-09: the rule name for rule-kind findings, echoed onto `expected_json.rule_name`
 * (`document.service.ts`'s `findingRuleName` does the same lookup for the event card). */
function ruleNameOf(finding: FindingRow): string | null {
  const expected = finding.expected_json;
  if (expected && typeof expected === 'object' && 'rule_name' in (expected as Record<string, unknown>)) {
    const name = (expected as Record<string, unknown>).rule_name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

interface EventOption {
  id: string;
  name: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

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
  const setRequestedTab = useStore((s) => s.setRequestedTab);
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const openEventCard = useCallback(
    (eventId: string) => {
      setEventCardEventId(eventId);
      setRequestedTab('eventCard');
    },
    [setEventCardEventId, setRequestedTab]
  );

  useEffect(() => {
    if (pendingFindingsRunId) {
      setRunIdFilter(pendingFindingsRunId);
      setStatus('');
      setPendingFindingsRunId(null);
    }
  }, [pendingFindingsRunId, setPendingFindingsRunId]);

  const eventNameById = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);
  const { sorted: sortedFindings, sort } = useSortableTable(findings, {
    severity: (f) => ({ error: 1, warning: 2, info: 3 } as Record<string, number>)[f.severity] ?? 9,
    kind: (f) => f.kind,
    rule: (f) => ruleNameOf(f),
    comparison: (f) => f.comparison,
    event: (f) => (f.event_id ? eventNameById.get(f.event_id) ?? f.event_id : null),
    message: (f) => f.message,
    status: (f) => f.status,
    last_seen: (f) => f.last_seen_at,
  });

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

  // T-2-09: manual resolve/reopen toggle, `PATCH .../findings/:id` (D-21 lifecycle: this is a
  // manual override on top of recompute, not a third status -- `finding.dal.ts`'s
  // `setFindingStatus` documents the reopen rule).
  const toggleResolved = async (finding: FindingRow) => {
    if (!activeProjectId) return;
    setResolvingId(finding.id);
    setError(null);
    try {
      const nextStatus = finding.status === 'resolved' ? 'open' : 'resolved';
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/findings/${finding.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await parseJson(res);
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update this finding.');
        return;
      }
      await load();
    } catch {
      setError('Failed to update this finding.');
    } finally {
      setResolvingId(null);
    }
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Findings</h1>
          <p className="text-sm text-gray-500 mt-1">Definition vs mapping (1), mapping vs observations (2), definition vs observations (3) and definition vs Data Manager (4). A finding resolved by hand while it still reproduces is <GlossaryTerm glossaryKey="acknowledged">acknowledged</GlossaryTerm>.</p>
        </div>
        <Button type="button" onClick={() => void runComparison()} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run comparison
        </Button>
      </PageHeader>

      <PageBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <div className="bg-white rounded-lg border shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Comparison" hintScope="Findings">Comparison</FieldLabel>
            <select value={comparison} onChange={(e) => setComparison(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {COMPARISON_IDS.map((c) => <option key={c} value={c}>{comparisonLabel(c)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Kind" hintScope="Findings">Kind</FieldLabel>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {FINDING_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Severity" hintScope="Findings">Severity</FieldLabel>
            <EnumSelect kind="severity" values={FINDING_SEVERITIES} emptyLabel="All" value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" />
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Event" hintScope="Findings">Event</FieldLabel>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel className="text-xs font-medium text-gray-500" hint="Status" hintScope="Findings">Status</FieldLabel>
            <EnumSelect kind="status" values={FINDING_STATUSES} emptyLabel="All" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm" />
          </div>
          {runIdFilter && (
            <Button type="button" variant="outline" onClick={() => setRunIdFilter(null)}>
              Clear run filter
            </Button>
          )}
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableTh sort={sort} column="severity" className="px-6 py-3 font-medium text-gray-500" hint="Severity" hintScope="Findings">Severity</SortableTh>
                <SortableTh sort={sort} column="kind" className="px-6 py-3 font-medium text-gray-500" hint="Kind" hintScope="Findings">Kind</SortableTh>
                <SortableTh sort={sort} column="rule" className="px-6 py-3 font-medium text-gray-500" hint="Rule" hintScope="Findings">Rule</SortableTh>
                <SortableTh sort={sort} column="comparison" className="px-6 py-3 font-medium text-gray-500" hint="Comparison" hintScope="Findings">Comparison</SortableTh>
                <SortableTh sort={sort} column="event" className="px-6 py-3 font-medium text-gray-500" hint="Event" hintScope="Findings">Event</SortableTh>
                <SortableTh sort={sort} column="message" className="px-6 py-3 font-medium text-gray-500" hint="Message" hintScope="Findings">Message</SortableTh>
                <SortableTh sort={sort} column="status" className="px-6 py-3 font-medium text-gray-500" hint="Status" hintScope="Findings">Status</SortableTh>
                <SortableTh sort={sort} column="last_seen" className="px-6 py-3 font-medium text-gray-500" hint="Last seen" hintScope="Findings">Last seen</SortableTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Actions" hintScope="Findings">Actions</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedFindings.map((f) => (
                <tr key={f.id}>
                  <td className="px-6 py-4">
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-700"><FindingTerm kind={f.kind} /></td>
                  <td className="px-6 py-4 text-gray-700 text-xs">{ruleNameOf(f) ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs"><FindingTerm comparison={f.comparison} /></td>
                  <td className="px-6 py-4 text-gray-900">
                    {f.event_id ? (
                      <button
                        type="button"
                        onClick={() => openEventCard(f.event_id as string)}
                        className="text-[var(--brand-primary)] hover:underline"
                      >
                        {eventNameById.get(f.event_id) ?? f.event_id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{f.message ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-500"><StatusBadge status={f.status} /></td>
                  <td className="px-6 py-4 text-gray-500">{new Date(f.last_seen_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resolvingId === f.id}
                      onClick={() => void toggleResolved(f)}
                    >
                      {f.status === 'resolved' ? 'Reopen' : 'Resolve'}
                    </Button>
                  </td>
                </tr>
              ))}
              {showEmptyState(loading, findings.length) && (
                <EmptyState
                  colSpan={9}
                  message="No findings match these filters. Run a comparison to check the current definition, mapping and observations."
                  actionLabel="Run comparison"
                  onAction={() => void runComparison()}
                />
              )}
              {showLoadingPlaceholder(loading, findings.length) && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </div>
  );
}
