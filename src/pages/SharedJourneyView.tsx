/**
 * Public read-only journey view at /share/:token.
 * Fetches journey from GET /api/shared/journeys/:token and renders JourneyCanvas with readOnly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { getSharedJourneyByIdApi, getSharedJourneyByTokenApi } from '@/src/features/journeys/hooks/useJourneysApi';
import type { Journey } from '@/src/types';
import { API_BASE, buildAppPageUrl } from '@/src/config/env';
import { computeQARunStatusForRun, getQARunDisplayName } from '@/src/features/journeys/lib/qaRunUtils';
import { ArrowLeft, Check, ChevronDown, FileText, Lock, LockOpen, PenTool } from 'lucide-react';
import type { QARun, QAVerification, QAStatus } from '@/src/types';

type SharedResponse = {
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
  nodes: unknown;
  edges: unknown;
  eventSnippets?: Record<
    string,
    { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }
  >;
};

function qaStatusChipClass(status: QAStatus): string {
  if (status === 'Passed') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'Failed') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

type QaReportNode = {
  id: string;
  type: string;
  label: string;
  connectedEvent?: { eventId?: string; name?: string } | null;
};

function isQaReportNodeType(t: unknown): t is 'journeyStepNode' | 'triggerNode' {
  return t === 'journeyStepNode' || t === 'triggerNode';
}

function toQaReportNodesFromRun(qaRun: QARun | null | undefined): QaReportNode[] {
  const nodes = Array.isArray(qaRun?.nodes) ? (qaRun?.nodes as any[]) : [];
  const out: QaReportNode[] = [];
  for (const n of nodes) {
    const id = typeof n?.id === 'string' ? n.id : '';
    const type = typeof n?.type === 'string' ? n.type : '';
    if (!id || !isQaReportNodeType(type)) continue;
    const label =
      typeof n?.data?.label === 'string' && n.data.label.trim()
        ? n.data.label.trim()
        : type === 'triggerNode'
          ? 'Trigger'
          : 'Step';
    const connectedEvent =
      type === 'triggerNode' && n?.data?.connectedEvent ? (n.data.connectedEvent as any) : null;
    out.push({ id, type, label, connectedEvent });
  }
  return out;
}

function getVerificationForNode(
  qaRun: QARun,
  nodeId: string
): QAVerification {
  const v = qaRun.verifications?.[nodeId];
  return v ?? { nodeId, status: 'Pending', proofs: [] };
}

function SharedJourneyQaReport({
  qaRun,
}: {
  qaRun: QARun;
}) {
  const derived = computeQARunStatusForRun(qaRun);
  const reportNodes = useMemo(() => toQaReportNodesFromRun(qaRun), [qaRun]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(() => reportNodes[0]?.id ?? null);

  useEffect(() => {
    if (!activeNodeId && reportNodes.length > 0) setActiveNodeId(reportNodes[0].id);
    if (activeNodeId && !reportNodes.some((n) => n.id === activeNodeId)) {
      setActiveNodeId(reportNodes[0]?.id ?? null);
    }
  }, [activeNodeId, reportNodes]);

  const counts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let pending = 0;
    for (const n of reportNodes) {
      const st = getVerificationForNode(qaRun, n.id).status;
      if (st === 'Passed') passed += 1;
      else if (st === 'Failed') failed += 1;
      else pending += 1;
    }
    return { passed, failed, pending, total: reportNodes.length };
  }, [qaRun, reportNodes]);

  const activeNode = reportNodes.find((n) => n.id === activeNodeId) ?? null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0">
      <div className="w-[300px] shrink-0 border-r bg-white flex flex-col min-h-0">
        <div className="p-4 border-b">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">QA Report</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">{getQARunDisplayName(qaRun)}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${derived === 'PASSED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : derived === 'FAILED' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
              {derived}
            </span>
            <span className="text-xs text-gray-600">
              {counts.failed} failed · {counts.pending} pending · {counts.passed} passed
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y">
          {reportNodes.map((n) => {
            const v = getVerificationForNode(qaRun, n.id);
            const active = n.id === activeNodeId;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveNodeId(n.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active ? 'bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{n.label}</div>
                    <div className="text-[11px] text-gray-500">
                      {n.type === 'triggerNode' ? 'Trigger' : 'Step'}
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${qaStatusChipClass(v.status)}`}>
                    {v.status}
                  </span>
                </div>
              </button>
            );
          })}
          {reportNodes.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No QA-eligible nodes in this run.</div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-[var(--surface-default)]">
        <div className="max-w-[980px] mx-auto p-6 space-y-4">
          {activeNode ? (
            (() => {
              const v = getVerificationForNode(qaRun, activeNode.id);
              return (
                <div className="bg-white border rounded-lg p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{activeNode.label}</div>
                      <div className="text-xs text-gray-500">
                        {activeNode.type === 'triggerNode' ? 'Trigger' : 'Step'} · Node ID: <span className="font-mono">{activeNode.id}</span>
                      </div>
                      {activeNode.type === 'triggerNode' && activeNode.connectedEvent?.eventId && (
                        <div className="text-xs text-gray-600 mt-1">
                          Event: <span className="font-mono">{activeNode.connectedEvent.name ?? activeNode.connectedEvent.eventId}</span>
                        </div>
                      )}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${qaStatusChipClass(v.status)}`}>
                      {v.status}
                    </span>
                  </div>

                  {v.notes?.trim() && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{v.notes}</div>
                    </div>
                  )}

                  {Array.isArray(v.proofs) && v.proofs.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Proofs</div>
                      <div className="mt-2 space-y-2">
                        {v.proofs.map((p) => (
                          <div key={p.id} className="border rounded p-3 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-900">{p.name}</div>
                            <div className="text-[11px] text-gray-600 mt-0.5">{p.type}</div>
                            {p.type === 'image' ? (
                              <a className="text-xs text-blue-700 break-all" href={p.content} target="_blank" rel="noreferrer">
                                {p.content}
                              </a>
                            ) : (
                              <pre className="mt-2 text-xs font-mono whitespace-pre-wrap text-gray-800">{p.content}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="bg-white border rounded-lg p-5 text-sm text-gray-600">Select an item to view QA details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SharedJourneyView({
  token,
  journeyId,
}: {
  token?: string;
  journeyId?: string;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'journey' | 'brief' | 'qa'>(() => {
    if (typeof window === 'undefined') return 'journey';
    const params = new URL(window.location.href).searchParams;
    const v = params.get('view');
    if (v === 'brief') return 'brief';
    if (v === 'qa') return 'qa';
    if (v === 'journey') return 'journey';
    if (params.get('hub')) return 'brief';
    return 'journey';
  });
  const [activeQARunId, setActiveQARunId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URL(window.location.href).searchParams.get('qa') || null;
  });
  const [briefHtml, setBriefHtml] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [sharedHubReturnToken] = useState(() =>
    typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('hub') : null,
  );
  const sortedQARuns = useMemo(() => {
    const runs = journey?.qaRuns || [];
    return [...runs].sort((a: any, b: any) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [journey?.qaRuns]);

  const inFlightRef = React.useRef(false);
  const fetchSharedJourney = React.useCallback(
    async ({ showLoadingScreen }: { showLoadingScreen: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      let cancelled = false;
      try {
        if (showLoadingScreen) {
          setLoading(true);
          setError(null);
        }
        const fetcher = journeyId
          ? getSharedJourneyByIdApi(journeyId)
          : getSharedJourneyByTokenApi(token ?? '');
        const result = await fetcher;
        if (cancelled) return;
        if (showLoadingScreen) setLoading(false);
        if (result.success) {
          const j = result.journey as SharedResponse;
          const snippetMap = j.eventSnippets ?? {};
          const nodes = Array.isArray(j.nodes) ? j.nodes : [];
          const enrichedNodes = nodes.map((n: any) => {
            if (n?.type !== 'triggerNode') return n;
            const eventId = n?.data?.connectedEvent?.eventId;
            if (typeof eventId !== 'string') return n;
            const sn = snippetMap[eventId]?.snippets;
            if (!sn) return n;
            return { ...n, data: { ...n.data, codegenSnippets: sn } };
          });
          const rawQaRuns = Array.isArray((j as any).qaRuns) ? ((j as any).qaRuns as any[]) : [];
          const enrichedQaRuns = rawQaRuns.map((run: any) => {
            if (!Array.isArray(run?.nodes)) return run;
            const runNodes = run.nodes.map((n: any) => {
              if (n?.type !== 'triggerNode') return n;
              const eventId = n?.data?.connectedEvent?.eventId;
              if (typeof eventId !== 'string') return n;
              const sn = snippetMap[eventId]?.snippets;
              if (!sn) return n;
              return { ...n, data: { ...n.data, codegenSnippets: sn } };
            });
            return { ...run, nodes: runNodes };
          });
          setJourney({
            id: j.id,
            name: j.name,
            testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
            codegen_preferred_style: j.codegen_preferred_style ?? null,
            nodes: enrichedNodes,
            edges: Array.isArray(j.edges) ? j.edges : [],
            qaRuns: enrichedQaRuns,
          });
          setError(null);
          if (showLoadingScreen) setLoading(false);
        } else {
          setError('error' in result ? result.error : 'Failed to load journey');
          if (showLoadingScreen) setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
      return () => {
        cancelled = true;
      };
    },
    [journeyId, token]
  );

  useEffect(() => {
    void fetchSharedJourney({ showLoadingScreen: true });
  }, [fetchSharedJourney]);

  useEffect(() => {
    const onFocus = () => {
      // Refresh shared payload (QA runs, snippets, nodes) when user returns.
      void fetchSharedJourney({ showLoadingScreen: false });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchSharedJourney({ showLoadingScreen: false });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchSharedJourney]);

  useEffect(() => {
    if (!journeyId) return;
    if (view !== 'brief') return;
    let cancelled = false;
    setBriefLoading(true);
    setBriefError(null);
    setBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load brief';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setBriefHtml(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setBriefError(e instanceof Error ? e.message : 'Failed to load brief');
      })
      .finally(() => {
        if (cancelled) return;
        setBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, journeyId]);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = modeMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isModeMenuOpen]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading shared journey…</p>
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium">Invalid or expired link</p>
          <p className="text-sm text-gray-600 mt-1">{error ?? 'This share link may have been removed or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full min-w-0 flex-col bg-[var(--surface-default)]">
      <div className="shrink-0 px-4 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {sharedHubReturnToken && typeof journeyId === 'string' && journeyId.length > 0 ? (
              <a
                href={buildAppPageUrl(`share/hub/${encodeURIComponent(sharedHubReturnToken)}`)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-panel)] px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-[var(--surface-default)]"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[var(--color-info)]" />
                Back to Shared Journey Homepage
              </a>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{journey.name}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Read-only view — design, docs, and QA runs
              </p>
            </div>
          </div>
          {journeyId && (
            <div className="relative" ref={modeMenuRef}>
              <button
                type="button"
                className="text-xs border rounded-md px-2 py-1.5 bg-gray-50 text-gray-900 min-w-[290px] flex items-center justify-between gap-2"
                onClick={() => setIsModeMenuOpen((v) => !v)}
              >
                <span className="flex items-center gap-2 truncate">
                  {view === 'journey' ? (
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : view === 'brief' ? (
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : (sortedQARuns.find((r: any) => r.id === activeQARunId)?.endedAt ? (
                    <Lock className="w-3.5 h-3.5 text-gray-600" />
                  ) : (
                    <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                  ))}
                  <span className="truncate">
                    {view === 'journey'
                      ? 'Design Mode'
                      : view === 'brief'
                        ? 'Docs Mode'
                        : getQARunDisplayName(sortedQARuns.find((r: any) => r.id === activeQARunId) || null)}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {isModeMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-full bg-white border rounded-md shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('journey');
                      setActiveQARunId(null);
                      u.searchParams.delete('view');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Design Mode</span>
                    {view === 'journey' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('brief');
                      setActiveQARunId(null);
                      u.searchParams.set('view', 'brief');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Docs Mode</span>
                    {view === 'brief' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  {sortedQARuns.length > 0 && <div className="border-t" />}
                  {sortedQARuns.map((run: any) => {
                    const runStatus = computeQARunStatusForRun(run);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => {
                          const u = new URL(window.location.href);
                          setView('qa');
                          setActiveQARunId(run.id);
                          u.searchParams.set('view', 'qa');
                          u.searchParams.set('qa', run.id);
                          window.history.replaceState({}, '', u.toString());
                          setIsModeMenuOpen(false);
                        }}
                      >
                        {run.endedAt ? (
                          <Lock className="w-3.5 h-3.5 text-gray-600" />
                        ) : (
                          <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span className="flex-1 truncate">{getQARunDisplayName(run)}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                          runStatus === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : runStatus === 'FAILED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {runStatus}
                        </span>
                        {view === 'qa' && activeQARunId === run.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {view === 'brief' && journeyId ? (
          briefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load docs</p>
                <p className="text-sm text-gray-600 mt-1">{briefError}</p>
              </div>
            </div>
          ) : briefLoading || !briefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading docs…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="Docs"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              srcDoc={briefHtml}
            />
          )
        ) : (
          <ReactFlowProvider>
            {view === 'qa' && activeQARunId ? (
              (() => {
                const run = (journey.qaRuns || []).find((r: any) => r?.id === activeQARunId) as QARun | undefined;
                return run ? (
                  <SharedJourneyQaReport qaRun={run} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
                    <div className="text-center max-w-md px-4">
                      <p className="text-red-600 font-medium">QA run not found</p>
                      <p className="text-sm text-gray-600 mt-1">This run may have been deleted or is unavailable.</p>
                    </div>
                  </div>
                );
              })()
            ) : (
              <JourneyCanvas
                journey={journey}
                workspaceId={null}
                activeQARunId={null}
                readOnly
              />
            )}
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
