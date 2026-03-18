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
        setJourney({
          id: j.id,
          name: j.name,
          description: j.description ?? undefined,
          testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
          nodes: enrichedNodes,
          edges: Array.isArray(j.edges) ? j.edges : [],
          qaRuns: [],
        });
      } else {
        setError(result.error ?? 'Failed to load journey');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, journeyId]);

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
        <h1 className="text-lg font-bold text-gray-900">{journey.name}</h1>
        <p className="text-xs text-gray-500 mt-0.5">Read-only view — pan and zoom to explore</p>
      </div>
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <JourneyCanvas journey={journey} activeQARunId={null} readOnly />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
