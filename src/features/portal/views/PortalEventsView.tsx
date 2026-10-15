/**
 * Portal Events view (T-5-42, T-5-44): the shared `EventsTable` on the document summary, and the
 * event's own page at `events/<name>`: the `EventCardView` (mode `shared`) fed by the per-event
 * `card.json` route, fetched on open only, with the event's comments on the page. The list keeps
 * its search, filters, sort and scroll while the visitor is on an event's page (`PortalListScope`).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { SourceBadge } from '@/src/components/ui/badges';
import { eventCardToMarkdown } from '@/src/domain/document/markdown';
import { namingNote } from '@/src/domain/naming';
import { sourceViaLabel } from '@/src/domain/sources';
import type { EventCard } from '@/src/domain/document/trackingDocument';
import { CertificationBadge, EventCardView, type EventCardData } from '@/src/features/events/components/EventCardView';
import { EventsTable, eventRowsFromSummary } from '@/src/features/views';
import { shareApiUrl, usePortal } from '../PortalContext';
import {
  Collaboration,
  CopyPortalLink,
  NotInShare,
  PageCollaboration,
  PageComments,
  PortalListScope,
  PortalPage,
  useCommentCount,
  usePortalRef,
} from '../PortalParts';

export function NamingNote() {
  const { summary } = usePortal();
  return (
    <p data-testid="naming-note" className="text-xs text-gray-500">
      {namingNote(summary.project.naming_convention ?? 'snake_case')}
    </p>
  );
}

function SourcesNote() {
  const { summary } = usePortal();
  const sources = summary.sources ?? [];
  if (sources.length === 0) return null;
  return (
    <p className="text-xs text-gray-500 [overflow-wrap:anywhere]" data-testid="shared-sources">
      Collected from:{' '}
      {sources.map((s) => `${s.name} (${sourceViaLabel(s.system, s.method)}, ${s.event_count} event${s.event_count === 1 ? '' : 's'})`).join('; ')}
    </p>
  );
}

export function PortalEventsView() {
  const { location } = usePortal();
  return location.id ? <PortalEventDetail key={location.id} name={location.id} /> : <PortalEventsList />;
}

function PortalEventsList() {
  const { summary, navigate } = usePortal();
  const commentCount = useCommentCount();
  const rows = useMemo(() => eventRowsFromSummary(summary), [summary]);
  return (
    <PortalPage
      view="events"
      count={rows.length}
      notes={
        <>
          <NamingNote />
          <SourcesNote />
        </>
      }
    >
      <PortalListScope scope="events">
        <EventsTable
          rows={rows}
          readOnly
          onOpen={(row) => navigate({ view: 'events', id: row.name })}
          commentCount={(row) => commentCount('event', row.id)}
          commentsInActions
          rowActions={(row) => (
            <>
              <Collaboration entityType="event" entityId={row.id} label={`event ${row.name}`} />
              <CopyPortalLink target={{ view: 'events', id: row.name }} label={row.name} />
            </>
          )}
          empty={{ message: 'No events in this tracking plan.' }}
        />
      </PortalListScope>
    </PortalPage>
  );
}

type CardState = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; card: EventCard };

/** The event's card from `card.json`, fetched when the page opens (and again on "Try again"). */
function useEventCard(token: string, id: string | undefined) {
  const [result, setResult] = useState<CardState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setResult({ state: 'loading' });
    fetch(shareApiUrl(token, `events/${encodeURIComponent(id)}/card.json`))
      .then(async (res) => {
        if (!res.ok) throw new Error('card');
        const card = (await res.json()) as EventCard;
        if (active) setResult({ state: 'ready', card });
      })
      .catch(() => {
        if (active) setResult({ state: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [id, token, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { result, retry };
}

/** Placeholder blocks in the card's shape while `card.json` loads, so the page does not jump. */
function CardLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the event card" className="space-y-6" data-testid="event-card-loading">
      {[0, 1, 2].map((n) => (
        <div key={n} className="animate-pulse space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-5/6 rounded bg-gray-100" />
          <div className="h-3 w-2/3 rounded bg-gray-100" />
        </div>
      ))}
      <span className="sr-only">Loading the event card…</span>
    </div>
  );
}

function PortalEventDetail({ name }: { name: string }) {
  const { summary, index, token, fileUrl, location } = usePortal();
  const renderRef = usePortalRef();
  const id = index.eventIdByName.get(name);
  const event = summary.events.find((e) => e.id === id);
  const { result, retry } = useEventCard(token, id);
  const card = result.state === 'ready' ? result.card : null;
  // An old `#variants-event-…` link scrolls to the card's variants block once it is there.
  useEffect(() => {
    if (!card || !location.hash || location.hash.startsWith('#comment=')) return;
    let anchor = location.hash.slice(1);
    try {
      anchor = decodeURIComponent(anchor);
    } catch {
      // keep the raw text
    }
    const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView?.({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [card, location.hash]);

  if (!id || !event) return <NotInShare view="events" />;
  return (
    <PortalPage
      view="events"
      back
      title={name}
      actions={
        <>
          <PageCollaboration entityType="event" entityId={id} label={`event ${name}`} />
          {card && <CopyMarkdownButton iconOnly getMarkdown={() => eventCardToMarkdown(card)} label={`Copy event ${name} as Markdown`} />}
          <CopyPortalLink target={{ view: 'events', id: name }} label={name} />
          <CopyNameButton name={name} />
        </>
      }
      notes={
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {event.business_name && event.business_name !== name && <span>{event.business_name}</span>}
          {(event.sources ?? []).map((s) => (
            <SourceBadge key={s.id} system={s.system} method={s.method} color={s.color} />
          ))}
          <CertificationBadge certification={event.certification} compact />
        </div>
      }
    >
      {/* The card beside its comments on wide screens; the comments follow the card below 1280px. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="min-w-0">
          {result.state === 'failed' && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              This event could not be loaded.
              <button type="button" onClick={retry} className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium hover:bg-red-100">
                Try again
              </button>
            </div>
          )}
          {result.state === 'loading' && <CardLoading />}
          {card && (
            <EventCardView
              card={card as unknown as EventCardData}
              identifyCodegen={summary.identity_codegen?.identify ?? null}
              fileUrl={fileUrl}
              mode="shared"
              hideHeader
              renderPropertyLink={(p, label) => renderRef({ kind: 'property', id: p.property_id }, label)}
            />
          )}
        </div>
        <PageComments entityType="event" entityId={id} />
      </div>
    </PortalPage>
  );
}
