import {useCommentLink} from '@/src/features/comments/useCommentLink';
import {QaReports} from '@/src/features/findings/QaReports';
import {TargetCollaboration,useProjectComments} from '@/src/features/comments/TargetCollaboration';
import { SortableTh, useSortableTable } from '@/src/hooks/useSortableTable';
import { HintTh } from '@/src/components/ui/FieldHint';
import { FindingPriorityBadge, SeverityBadge, StatusBadge } from '@/src/components/ui/badges';
/**
 * Findings page (T-1-09, D-07 simplified UI; T-2-04 adds comparison 4, `data_manager`): a table of
 * findings from every comparison engine `POST /comparison/run` orchestrates, with filters
 * (comparison, kind, severity, event, status), from `enums.ts` — never hardcoded. Reads
 * `pendingFindingsRunId` from the store once (set by `QaRuns.tsx`'s "View findings for this run"
 * and by `Import.tsx`'s customer-events-export apply) to pre-filter by the observation's run.
 * T-5-48 (D-89): a Priority column and filter; the natural order is the backend's priority order
 * (`priority_rank`), never recomputed here.
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
import { COMPARISON_IDS, FINDING_KINDS, FINDING_PRIORITIES, FINDING_SEVERITIES, FINDING_STATUSES } from '@/src/domain/enums';
import { showEmptyState, showLoadingPlaceholder } from '@/src/domain/loadingState';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { CELL, HEAD_TEXT, ViewFrame, ViewRow, ViewToolbar, useDensity } from '@/src/features/views/ViewParts';
import { FindingsOverview } from '@/src/features/findings/FindingsOverview';
import { FindingsPagination } from '@/src/features/findings/FindingsPagination';
import { enumLabel } from '@/src/domain/enumLabels';
import { searchFindings } from '@/src/features/findings/internalFindingsModel';

export interface FindingRow {
  id: string;
  finding_sequence:number;
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
  resolved_by?: string | null;
  last_seen_at: string;
  /** D-89 (T-5-47): derived by the backend at read time. */
  priority?: string;
  priority_rank?: number;
  priority_reasons?: string[];
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
  if (!hasValidProjectContext || !activeProjectId) return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  // A project switch discards its filters, pages, comments and in-flight result state together.
  return <ProjectFindings key={activeProjectId} activeProjectId={activeProjectId} />;
}

function ProjectFindings({ activeProjectId }: { activeProjectId: string }) {
  const findingCommentLink=useCommentLink();
  const discussions=useProjectComments(activeProjectId??'');
  const [reportRevision,setReportRevision]=useState(0);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [projectFindings, setProjectFindings] = useState<FindingRow[] | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [search, setSearch] = useState('');
  const [density, setDensity] = useDensity();
  const cell = `${CELL[density]} align-top`;
  const head = `${CELL[density]} ${HEAD_TEXT}`;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [comparison, setComparison] = useState('');
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [priority, setPriority] = useState('');
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
  const scope = JSON.stringify([comparison, kind, severity, priority, eventId, status, runIdFilter]);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
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
  const visibleFindings = useMemo(() => searchFindings(loadedScope === scope ? findings : [], search, eventNameById), [findings, loadedScope, scope, search, eventNameById]);
  const { sorted: sortedFindings, sort } = useSortableTable(visibleFindings, {
    priority: (f) => f.priority_rank ?? null,
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
    const token = ++loadTokenRef.current;
    setLoading(true);
    setError(null);
    setLoadedScope(null);
    try {
      const params = new URLSearchParams();
      if (comparison) params.set('comparison', comparison);
      if (kind) params.set('kind', kind);
      if (severity) params.set('severity', severity);
      if (priority) params.set('priority', priority);
      if (eventId) params.set('event_id', eventId);
      if (status) params.set('status', status);
      if (runIdFilter) params.set('qa_run_id', runIdFilter);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/findings?${params.toString()}`);
      const data = await parseJson(res);
      if (!live.current || token !== loadTokenRef.current) return; // a newer load() has since started; discard this one
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
      setLoadedScope(scope);

    } catch {
      if (!live.current || token !== loadTokenRef.current) return;
      setError('Failed to load findings.');
      setFindings([]);
    } finally {
      if (live.current && token === loadTokenRef.current) setLoading(false);
    }
  }, [activeProjectId, comparison, kind, severity, priority, eventId, status, runIdFilter, scope]);

  useEffect(() => {
    void load();
    return () => { loadTokenRef.current++; };
  }, [load]);

  // This independent snapshot is deliberately unfiltered: paging/search/status must never
  // turn project totals into page totals. Refresh it only after comparison or resolve/reopen.
  useEffect(() => {
    let active = true;
    setProjectFindings(null); setOverviewError(false);
    void Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/findings`),
      fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events`),
    ]).then(async ([rowsRes, eventsRes]) => {
      const [rows, eventRows] = await Promise.all([parseJson(rowsRes), parseJson(eventsRes)]);
      if (!active) return;
      if (!rowsRes.ok || !eventsRes.ok || !Array.isArray(rows) || !Array.isArray(eventRows)) throw new Error('overview');
      setProjectFindings(rows);
      setEvents(eventRows.map((e: EventOption) => ({ id: e.id, name: e.name })));
    }).catch(() => { if (active) setOverviewError(true); });
    return () => { active = false; };
  }, [activeProjectId, reportRevision]);

  const currentFindingIds = useMemo(() => visibleFindings.map(f => f.id), [visibleFindings]);
  const pageCount = Math.max(1, Math.ceil(sortedFindings.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageFindings = sortedFindings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setPage(1); }, [scope, search, sort.key, sort.dir, pageSize]);
  useEffect(() => { setPage(p => Math.min(p, pageCount)); }, [pageCount]);
  const linkedId = findingCommentLink.kind === 'target' && findingCommentLink.target.entityType === 'finding' ? findingCommentLink.target.entityId : null;
  const linkKey = findingCommentLink.kind === 'target' ? JSON.stringify(findingCommentLink.target) : null;
  const [revealedLink, setRevealedLink] = useState<string | null>(null);
  const tableLoading = loading || (!error && loadedScope !== scope);
  useEffect(() => {
    if (!linkedId) { setRevealedLink(null); return; }
    if (revealedLink === linkKey) return;
    const index = sortedFindings.findIndex(f => f.id === linkedId);
    if (index >= 0) {
      setPage(Math.floor(index / pageSize) + 1);
      setRevealedLink(linkKey);
    } else if (loadedScope === scope && projectFindings?.some(f => f.id === linkedId)) {
      setComparison(''); setKind(''); setSeverity(''); setPriority(''); setEventId(''); setStatus(''); setRunIdFilter(null); setSearch('');
    }
  }, [linkedId, linkKey, revealedLink, projectFindings, sortedFindings, pageSize, loadedScope, scope]);

  const latestLoad = useRef(load);
  latestLoad.current = load;

  const runComparison = async () => {
    if (!activeProjectId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comparison/run`, { method: 'POST' });
      if (!live.current) return;
      if (!res.ok) {
        const data = await parseJson(res);
        if (!live.current) return;
        setError(typeof data?.error === 'string' ? data.error : 'Comparison run failed.');
        return;
      }
      if (!live.current) return;
      await latestLoad.current();
      if (!live.current) return;
      setReportRevision(v=>v+1);
    } catch {
      if (live.current) setError('Comparison run failed.');
    } finally {
      if (live.current) setRunning(false);
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
      if (!live.current) return;
      if (!res.ok) {
        const data = await parseJson(res);
        if (!live.current) return;
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update this finding.');
        return;
      }
      if (!live.current) return;
      await latestLoad.current();
      if (!live.current) return;
      setReportRevision(v=>v+1);
    } catch {
      if (live.current) setError('Failed to update this finding.');
    } finally {
      if (live.current) setResolvingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex flex-wrap items-center justify-between gap-3">
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
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        <FindingsOverview findings={projectFindings} events={events} failed={overviewError} />
        <div className="min-w-0 [&_input]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full">
        <ViewToolbar search={search} onSearch={setSearch} searchLabel="Search findings" placeholder="Search number, message, event or kind" density={density} onDensity={setDensity}
          filters={[
            { label: 'Filter by comparison', value: comparison, onChange: setComparison, allLabel: 'All comparisons', options: COMPARISON_IDS.map(value => ({ value, label: comparisonLabel(value) })) },
            { label: 'Filter by kind', value: kind, onChange: setKind, allLabel: 'All kinds', options: FINDING_KINDS.map(value => ({ value, label: kindLabel(value) })) },
            { label: 'Filter by priority', value: priority, onChange: setPriority, allLabel: 'All priorities', options: FINDING_PRIORITIES.map(value => ({ value, label: value })) },
            { label: 'Filter by severity', value: severity, onChange: setSeverity, allLabel: 'All severities', options: FINDING_SEVERITIES.map(value => ({ value, label: enumLabel('severity', value) })) },
            { label: 'Filter by event', value: eventId, onChange: setEventId, allLabel: 'All events', options: events.map(e => ({ value: e.id, label: e.name })) },
            { label: 'Filter by status', value: status, onChange: setStatus, allLabel: 'All statuses', options: FINDING_STATUSES.map(value => ({ value, label: enumLabel('status', value) })) },
          ]}>
          {runIdFilter && <Button type="button" size="sm" variant="outline" onClick={() => setRunIdFilter(null)}>Clear run filter</Button>}
        </ViewToolbar>
        </div>
        <p className="text-xs text-gray-500">Current runtime findings. QA reports below keep their recorded results; historical file checks are separate.</p>
        <FindingsPagination total={sortedFindings.length} page={currentPage} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} loading={tableLoading} />
        <ViewFrame label="Findings">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableTh sort={sort} column="priority" className={head} hint="Priority" hintScope="Findings"><GlossaryTerm glossaryKey="finding_priority">Priority</GlossaryTerm></SortableTh>
                <SortableTh sort={sort} column="severity" className={head} hint="Severity" hintScope="Findings">Severity</SortableTh>
                <SortableTh sort={sort} column="kind" className={head} hint="Kind" hintScope="Findings">Kind</SortableTh>
                <SortableTh sort={sort} column="rule" className={head} hint="Rule" hintScope="Findings">Rule</SortableTh>
                <SortableTh sort={sort} column="comparison" className={head} hint="Comparison" hintScope="Findings">Comparison</SortableTh>
                <SortableTh sort={sort} column="event" className={head} hint="Event" hintScope="Findings">Event</SortableTh>
                <SortableTh sort={sort} column="message" className={head} hint="Message" hintScope="Findings">Message</SortableTh>
                <SortableTh sort={sort} column="status" className={head} hint="Status" hintScope="Findings">Status</SortableTh>
                <SortableTh sort={sort} column="last_seen" className={head} hint="Last seen" hintScope="Findings">Last seen</SortableTh>
                <HintTh className={head} hint="Actions" hintScope="Findings">Actions</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageFindings.map((f) => (
                <ViewRow key={f.id} rowId={f.id} highlighted={linkedId === f.id}>
                  <td className={cell}>
                    <FindingPriorityBadge priority={f.priority} reasons={f.priority_reasons} />
                  </td>
                  <td className={cell}>
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className={`${cell} text-xs text-gray-700`}><span>Finding #{String(f.finding_sequence).padStart(3,'0')}</span> <FindingTerm kind={f.kind} /></td>
                  <td className={`${cell} text-gray-700 text-xs`}>{ruleNameOf(f) ?? '—'}</td>
                  <td className={`${cell} text-gray-500 text-xs`}><FindingTerm comparison={f.comparison} /></td>
                  <td className={`${cell} text-gray-900`}>
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
                  <td className={`${cell} text-gray-500`}>{f.message ?? '—'}</td>
                  <td className={`${cell} text-gray-500`}><StatusBadge status={f.status} /></td>
                  <td className={`${cell} text-gray-500`}>{new Date(f.last_seen_at).toLocaleString()}</td>
                  <td className={cell}>
                    <TargetCollaboration api={{mode:'internal',projectId:activeProjectId!}} entityType="finding" entityId={f.id} label={`Finding #${String(f.finding_sequence).padStart(3,'0')}`} rows={discussions.rows} onChanged={discussions.reload} forceOpen={findingCommentLink.kind==='target'&&findingCommentLink.target.entityId===f.id}/>
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
                </ViewRow>
              ))}
              {!error && showEmptyState(tableLoading, sortedFindings.length) && (
                <EmptyState
                  colSpan={10}
                  message="No findings match these filters or search. Run a comparison to check the current definition, mapping and observations."
                  actionLabel="Run comparison"
                  onAction={() => void runComparison()}
                />
              )}
              {showLoadingPlaceholder(tableLoading, sortedFindings.length) && (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
        </ViewFrame>
        {activeProjectId&&<QaReports api={{mode:'internal',projectId:activeProjectId}} rows={discussions.rows} onChanged={discussions.reload} revision={reportRevision} currentFindingIds={currentFindingIds} currentFindingsLoading={tableLoading || (!projectFindings && !overviewError) || (!!linkedId && revealedLink !== linkKey && !!projectFindings?.some(f => f.id === linkedId))}/>}
      </PageBody>
    </div>
  );
}
