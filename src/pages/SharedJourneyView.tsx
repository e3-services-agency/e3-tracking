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
import type { QARun, QAStatus } from '@/src/types';

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

function injectQaOverlayIntoExportHtml(html: string, qaRun: QARun): string {
  const safeJson = JSON.stringify(qaRun).replace(/<\/script/gi, '<\\/script');
  const style = `
<style>
  .qa-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px; border:1px solid #e2e8f0; font-size:12px; font-weight:600; line-height:18px; }
  .qa-chip--Passed { background:#dcfce7; color:#166534; border-color:#bbf7d0; }
  .qa-chip--Failed { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
  .qa-chip--Pending { background:#fef3c7; color:#92400e; border-color:#fde68a; }
  .qa-block { margin-top: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; }
  .qa-block-title { font-size: 12px; font-weight: 700; color: #475569; letter-spacing: 0.03em; text-transform: uppercase; margin-bottom: 8px; }
  .qa-proof { border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; background:#f8fafc; margin-top:8px; }
  .qa-proof-name { font-size:12px; font-weight:700; color:#0f172a; }
  .qa-proof-meta { font-size:11px; color:#64748b; margin-top:2px; }
  .qa-proof-content { margin-top:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; white-space: pre-wrap; color:#0f172a; }
</style>`;
  const script = `
<script>
(function(){
  var qaRun = ${safeJson};
  function statusFor(nodeId){
    var v = qaRun && qaRun.verifications ? qaRun.verifications[nodeId] : null;
    return (v && (v.status === 'Passed' || v.status === 'Failed' || v.status === 'Pending')) ? v.status : 'Pending';
  }
  function chip(status){
    var el = document.createElement('span');
    el.className = 'qa-chip qa-chip--' + status;
    el.textContent = status;
    return el;
  }
  function renderDetails(container, verification){
    if (!verification) return;
    var notes = typeof verification.notes === 'string' ? verification.notes.trim() : '';
    var proofs = Array.isArray(verification.proofs) ? verification.proofs : [];
    if (!notes && proofs.length === 0) return;
    var block = document.createElement('div');
    block.className = 'qa-block';
    var title = document.createElement('div');
    title.className = 'qa-block-title';
    title.textContent = 'QA Details';
    block.appendChild(title);
    if (notes){
      var n = document.createElement('div');
      n.style.whiteSpace = 'pre-wrap';
      n.style.fontSize = '13px';
      n.style.color = '#334155';
      n.textContent = notes;
      block.appendChild(n);
    }
    for (var i=0;i<proofs.length;i++){
      var p = proofs[i];
      var wrap = document.createElement('div');
      wrap.className = 'qa-proof';
      var nm = document.createElement('div');
      nm.className = 'qa-proof-name';
      nm.textContent = (p && p.name) ? p.name : 'Proof';
      wrap.appendChild(nm);
      var meta = document.createElement('div');
      meta.className = 'qa-proof-meta';
      meta.textContent = (p && p.type) ? String(p.type) : '';
      wrap.appendChild(meta);
      if (p && p.type === 'image' && p.content){
        var a = document.createElement('a');
        a.href = p.content;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.textContent = p.content;
        a.style.fontSize = '12px';
        a.style.color = '#1d4ed8';
        a.style.wordBreak = 'break-all';
        wrap.appendChild(a);
      } else if (p && p.content){
        var pre = document.createElement('div');
        pre.className = 'qa-proof-content';
        pre.textContent = String(p.content);
        wrap.appendChild(pre);
      }
      block.appendChild(wrap);
    }
    container.appendChild(block);
  }

  // Build ordered step node ids from QA run snapshot.
  var runNodes = Array.isArray(qaRun && qaRun.nodes) ? qaRun.nodes : [];
  var stepIds = [];
  var triggerNodesByEventId = {};
  for (var i=0;i<runNodes.length;i++){
    var n = runNodes[i];
    if (!n || typeof n.id !== 'string') continue;
    if (n.type === 'journeyStepNode') stepIds.push(n.id);
    if (n.type === 'triggerNode'){
      var eid = n && n.data && n.data.connectedEvent && n.data.connectedEvent.eventId;
      if (typeof eid === 'string' && eid) triggerNodesByEventId[eid] = n.id;
    }
  }

  // Step sections: map by index (export steps are rendered in canvas stepNodes order).
  var stepSections = document.querySelectorAll('section.export-step');
  for (var s=0;s<stepSections.length;s++){
    var sec = stepSections[s];
    var nodeId = stepIds[s];
    if (!nodeId) continue;
    var header = sec.querySelector('button.export-step-header');
    if (header){
      var st = statusFor(nodeId);
      header.appendChild(chip(st));
    }
    var v = qaRun && qaRun.verifications ? qaRun.verifications[nodeId] : null;
    renderDetails(sec.querySelector('.export-step-body') || sec, v);

    // Triggers inside this step: match by eventId shown in the export block.
    var triggerBlocks = sec.querySelectorAll('.export-tracking-block');
    for (var tb=0;tb<triggerBlocks.length;tb++){
      var blk = triggerBlocks[tb];
      var idEl = blk.querySelector('.export-tracking-id');
      if (!idEl) continue;
      var txt = (idEl.textContent || '').trim();
      // txt looks like "(<eventId>)"
      var m = txt.match(/\\(([0-9a-f\\-]{8,})\\)/i);
      if (!m) continue;
      var eventId = m[1];
      var trigNodeId = triggerNodesByEventId[eventId];
      if (!trigNodeId) continue;
      var st2 = statusFor(trigNodeId);
      var title = blk.querySelector('.export-tracking-title');
      if (title){
        title.appendChild(document.createTextNode(' '));
        title.appendChild(chip(st2));
      }
      var v2 = qaRun && qaRun.verifications ? qaRun.verifications[trigNodeId] : null;
      renderDetails(blk.querySelector('.export-tracking-body') || blk, v2);
    }
  }
})();
</script>`;

  // Inject right before </head> and </body> to keep it self-contained.
  const withStyle = html.includes('</head>') ? html.replace('</head>', style + '\n</head>') : style + html;
  return withStyle.includes('</body>') ? withStyle.replace('</body>', script + '\n</body>') : withStyle + script;
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
  const [qaBriefHtml, setQaBriefHtml] = useState<string | null>(null);
  const [qaBriefError, setQaBriefError] = useState<string | null>(null);
  const [qaBriefLoading, setQaBriefLoading] = useState(false);
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
    if (view !== 'qa') return;
    if (!activeQARunId) return;
    if (!journey) return;
    const run = (journey.qaRuns || []).find((r: any) => r?.id === activeQARunId) as QARun | undefined;
    if (!run) return;
    let cancelled = false;
    setQaBriefLoading(true);
    setQaBriefError(null);
    setQaBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journey.id}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load QA docs';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setQaBriefHtml(injectQaOverlayIntoExportHtml(t, run));
      })
      .catch((e) => {
        if (cancelled) return;
        setQaBriefError(e instanceof Error ? e.message : 'Failed to load QA docs');
      })
      .finally(() => {
        if (cancelled) return;
        setQaBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, activeQARunId, journey]);

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
        ) : view === 'qa' && activeQARunId ? (
          qaBriefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load QA report</p>
                <p className="text-sm text-gray-600 mt-1">{qaBriefError}</p>
              </div>
            </div>
          ) : qaBriefLoading || !qaBriefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading QA report…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="QA Report"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              srcDoc={qaBriefHtml}
            />
          )
        ) : (
          <ReactFlowProvider>
            <JourneyCanvas
              journey={journey}
              workspaceId={null}
              activeQARunId={null}
              readOnly
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
