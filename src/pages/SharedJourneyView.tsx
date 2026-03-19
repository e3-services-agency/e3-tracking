/**
 * Public read-only journey view at /share/:token.
 * Fetches journey from GET /api/shared/journeys/:token and renders JourneyCanvas with readOnly.
 */
import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { getSharedJourneyByIdApi, getSharedJourneyByTokenApi } from '@/src/features/journeys/hooks/useJourneysApi';
import type { Journey } from '@/src/types';
import { API_BASE } from '@/src/config/env';
import { computeQARunStatusForRun, getQARunDisplayName } from '@/src/features/journeys/lib/qaRunUtils';
import { Check, ChevronDown, FileText, Lock, LockOpen, PenTool } from 'lucide-react';

type SharedResponse = {
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  nodes: unknown;
  edges: unknown;
  eventSnippets?: Record<
    string,
    { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }
  >;
};

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
    const v = new URL(window.location.href).searchParams.get('view');
    if (v === 'brief') return 'brief';
    if (v === 'qa') return 'qa';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetcher = journeyId ? getSharedJourneyByIdApi(journeyId) : getSharedJourneyByTokenApi(token ?? '');
    fetcher.then((result) => {
      if (cancelled) return;
      setLoading(false);
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
          description: j.description ?? undefined,
          testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
          nodes: enrichedNodes,
          edges: Array.isArray(j.edges) ? j.edges : [],
          qaRuns: enrichedQaRuns,
        });
      } else {
        setError(result.error ?? 'Failed to load journey');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, journeyId]);

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
    <div className="flex h-screen w-full flex-col bg-[var(--surface-default)]">
      <div className="shrink-0 px-4 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{journey.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Read-only view — design, docs, and QA runs
            </p>
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
                  ) : ((journey.qaRuns || []).find((r: any) => r.id === activeQARunId)?.endedAt ? (
                    <Lock className="w-3.5 h-3.5 text-gray-600" />
                  ) : (
                    <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                  ))}
                  <span className="truncate">
                    {view === 'journey'
                      ? 'Design Mode'
                      : view === 'brief'
                        ? 'Docs Mode'
                        : getQARunDisplayName((journey.qaRuns || []).find((r: any) => r.id === activeQARunId) || null)}
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
                  {(journey.qaRuns || []).length > 0 && <div className="border-t" />}
                  {(journey.qaRuns || []).map((run: any) => {
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
            <iframe title="Docs" className="w-full h-full border-0 bg-white" srcDoc={briefHtml} />
          )
        ) : (
          <ReactFlowProvider>
            <JourneyCanvas journey={journey} activeQARunId={view === 'qa' ? activeQARunId : null} readOnly />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
