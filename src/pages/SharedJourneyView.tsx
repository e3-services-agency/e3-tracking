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
              Read-only view — journey, brief, and QA runs
            </p>
          </div>
          {journeyId && (
            <select
              className="text-xs border rounded-md px-2 py-1.5 bg-gray-50 text-gray-900"
              value={view === 'qa' ? `qa:${activeQARunId || ''}` : view}
              onChange={(e) => {
                const v = e.target.value;
                const u = new URL(window.location.href);
                if (v === 'journey') {
                  setView('journey');
                  setActiveQARunId(null);
                  u.searchParams.delete('view');
                  u.searchParams.delete('qa');
                  window.history.replaceState({}, '', u.toString());
                  return;
                }
                if (v === 'brief') {
                  setView('brief');
                  setActiveQARunId(null);
                  u.searchParams.set('view', 'brief');
                  u.searchParams.delete('qa');
                  window.history.replaceState({}, '', u.toString());
                  return;
                }
                if (v.startsWith('qa:')) {
                  const qaId = v.slice(3) || null;
                  setView('qa');
                  setActiveQARunId(qaId);
                  u.searchParams.set('view', 'qa');
                  if (qaId) u.searchParams.set('qa', qaId);
                  else u.searchParams.delete('qa');
                  window.history.replaceState({}, '', u.toString());
                }
              }}
            >
              <option value="journey">Journey</option>
              <option value="brief">Implementation brief</option>
              {(journey.qaRuns || []).length > 0 && <option disabled>──────────</option>}
              {(journey.qaRuns || []).map((run: any) => (
                <option key={run.id} value={`qa:${run.id}`}>
                  QA: {run.name || run.id}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {view === 'brief' && journeyId ? (
          briefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load brief</p>
                <p className="text-sm text-gray-600 mt-1">{briefError}</p>
              </div>
            </div>
          ) : briefLoading || !briefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading implementation brief…</p>
              </div>
            </div>
          ) : (
            <iframe title="Implementation brief" className="w-full h-full border-0 bg-white" srcDoc={briefHtml} />
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
