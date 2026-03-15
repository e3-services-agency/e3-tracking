/**
 * Public read-only journey view at /share/:token.
 * Fetches journey from GET /api/shared/journeys/:token and renders JourneyCanvas with readOnly.
 */
import React, { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { getSharedJourneyByTokenApi } from '@/src/features/journeys/hooks/useJourneysApi';
import type { Journey } from '@/src/types';

export function SharedJourneyView({ token }: { token: string }) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSharedJourneyByTokenApi(token).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.success) {
        const j = result.journey;
        setJourney({
          id: j.id,
          name: j.name,
          description: j.description ?? undefined,
          testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
          nodes: Array.isArray(j.nodes) ? j.nodes : [],
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
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F9FAFB]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#3E52FF] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading shared journey…</p>
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F9FAFB]">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium">Invalid or expired link</p>
          <p className="text-sm text-gray-600 mt-1">{error ?? 'This share link may have been removed or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#F9FAFB]">
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
