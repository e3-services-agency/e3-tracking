import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { Journey } from '@/src/types';
import type { JourneyRow } from '@/src/types/schema';
import { useActiveWorkspaceId } from '@/src/features/journeys/hooks/useJourneysApi';

type ApiError = { status: number; message: string };

function mapJourneyRowToUi(j: JourneyRow): Journey {
  return {
    id: j.id,
    name: j.name,
    nodes: (Array.isArray(j.canvas_nodes_json) ? j.canvas_nodes_json : []) as any[],
    edges: (Array.isArray(j.canvas_edges_json) ? j.canvas_edges_json : []) as any[],
    qaRuns: [],
    type_counts: j.type_counts ?? null,
    testing_instructions_markdown: j.testing_instructions_markdown ?? null,
  };
}

export function useJourneys(): {
  journeys: Journey[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
} {
  const activeWorkspaceId = useActiveWorkspaceId();
  const journeys = useStore((s) => s.mainData.journeys); // derived via useActiveData in UI, but keep simple here
  const setJourneys = useStore((s) => s.setJourneys);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/journeys`, {
        headers: { 'x-workspace-id': activeWorkspaceId },
      });
      if (!res.ok) {
        setError({ status: res.status, message: res.statusText || 'Failed to load journeys' });
        return;
      }
      const data = (await res.json()) as JourneyRow[];
      const mapped = Array.isArray(data) ? data.map(mapJourneyRowToUi) : [];
      setJourneys(mapped);
    } catch (e) {
      setError({ status: 0, message: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, setJourneys]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { journeys, isLoading, error, refetch };
}

