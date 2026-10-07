/**
 * Event card page (T-2-09, T-2-09 fix round, T-2-09 pre-QA fixes, D-07 simplified UI, T-4-03: split
 * into this data-fetching page and the presentational `EventCardView`, D-50). Fetches the card and
 * the coverage grid, then hands them to `EventCardView` with a `fileUrl` resolver pointing at this
 * project's authenticated file route (trigger screenshots, D-50).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import React, { useCallback, useEffect, useState } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type { IdentityVariants } from '@/src/domain/codegen/identity';
import { EventCardView, type EventCardData, type CoverageGridData } from '@/src/features/events/components/EventCardView';
import { CommentsPanel, type CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { CommentCountButton } from '@/src/features/comments/CommentCountButton';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { InternalRefLink } from '@/src/features/shared/RefLink';
import { resolveReference, buildReferenceIndex } from '@/src/features/shared/references';
import { eventCardToMarkdown } from '@/src/domain/document/markdown';
import type { EventCard as EventCardDocument } from '@/src/domain/document/trackingDocument';

const EMPTY_INDEX = buildReferenceIndex({ events: [], properties: [] });

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function EventCard({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const [card, setCard] = useState<EventCardData | null>(null);
  const [grid, setGrid] = useState<CoverageGridData | null>(null);
  const [identifyCodegen, setIdentifyCodegen] = useState<IdentityVariants | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentPanelRow[]>([]);
  const [threadOpen, setThreadOpen] = useState(false);

  const reloadComments = useCallback(async () => {
    if (!activeProjectId || !eventId) return;
    try {
      const params = new URLSearchParams({ entity_type: 'event', entity_id: eventId });
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/comments?${params.toString()}`);
      const data = await parseJson(res);
      if (res.ok && Array.isArray(data)) setComments(data);
    } catch {
      // best-effort; the panel reports its own post errors
    }
  }, [activeProjectId, eventId]);

  useEffect(() => {
    void reloadComments();
  }, [reloadComments]);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId || !eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setIdentifyCodegen(null);
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
      const idRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/identity-rules/codegen`);
      const idData = await parseJson(idRes);
      if (idRes.ok && idData?.identify) setIdentifyCodegen(idData.identify);
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
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <button type="button" onClick={handleBack} className="text-sm text-[var(--brand-primary)] hover:underline">
          &larr; Back to Events
        </button>
        {card && <CopyMarkdownButton getMarkdown={() => eventCardToMarkdown(card as unknown as EventCardDocument)} />}
      </PageHeader>

      <PageBody>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-4">{error}</div>}
        {loading && <div className="text-sm text-gray-400">Loading…</div>}

        {card && (
          <EventCardView
            identifyCodegen={identifyCodegen}
            card={card}
            grid={grid}
            fileUrl={(path) => `${API_BASE}/api/projects/${activeProjectId}/files/${path}`}
            renderPropertyLink={(p, label) => {
              const target = resolveReference({ kind: 'property', id: p.property_id }, 'internal', EMPTY_INDEX);
              return target && target.mode === 'internal' ? <InternalRefLink target={target}>{label}</InternalRefLink> : label;
            }}
            headerActions={
              <CommentCountButton count={comments.length} open={threadOpen} label="this event" onClick={() => setThreadOpen((o) => !o)} />
            }
            commentsSlot={
              threadOpen ? (
                <CommentsPanel
                  entityType="event"
                  entityId={card.id}
                  api={{ mode: 'internal', projectId: activeProjectId }}
                  rows={comments}
                  onChanged={reloadComments}
                />
              ) : undefined
            }
          />
        )}
      </PageBody>
    </div>
  );
}
