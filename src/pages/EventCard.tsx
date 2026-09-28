/**
 * Event card page (T-2-09, T-2-09 fix round, T-2-09 pre-QA fixes, D-07 simplified UI, T-4-03: split
 * into this data-fetching page and the presentational `EventCardView`, D-50). Fetches the card and
 * the coverage grid, then hands them to `EventCardView` with a `fileUrl` resolver pointing at this
 * project's authenticated file route (trigger screenshots, D-50).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { EventCardView, type EventCardData, type CoverageGridData } from '@/src/features/events/components/EventCardView';

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function EventCard({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const [card, setCard] = useState<EventCardData | null>(null);
  const [grid, setGrid] = useState<CoverageGridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId || !eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events/${eventId}/card`);
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load this event card.');
        setCard(null);
        return;
      }
      setCard(data);
      const gridRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events/${eventId}/coverage`);
      const gridData = await parseJson(gridRes);
      if (gridRes.ok) setGrid(gridData);
    } catch {
      setError('Failed to load this event card.');
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBack = () => {
    setEventCardEventId(null);
    onBack();
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white">
        <button type="button" onClick={handleBack} className="text-sm text-[var(--brand-primary)] hover:underline">
          &larr; Back to Events
        </button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-4">{error}</div>}
        {loading && <div className="text-sm text-gray-400">Loading…</div>}

        {card && (
          <EventCardView
            card={card}
            grid={grid}
            fileUrl={(path) => `${API_BASE}/api/projects/${activeProjectId}/files/${path}`}
          />
        )}
      </div>
    </div>
  );
}
