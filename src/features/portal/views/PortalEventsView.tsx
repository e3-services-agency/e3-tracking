/**
 * Portal Events view (T-5-42): the shared `EventsTable` on the document summary, and the event's
 * own page at `events/<name>`. The detail page is the interim one until T-5-44: the existing
 * `EventCardView` (mode `shared`) fed by the per-event `card.json` route, fetched on open only.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import { Collaboration, CopyPortalLink, NotInShare, PortalPage, useCommentCount, usePortalRef } from '../PortalParts';

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
    <PortalPage view="events" count={rows.length} notes={<><NamingNote /><SourcesNote /></>}>
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
    </PortalPage>
  );
}

function PortalEventDetail({ name }: { name: string }) {
  const { summary, index, token, fileUrl, location } = usePortal();
  const renderRef = usePortalRef();
  const id = index.eventIdByName.get(name);
  const event = summary.events.find((e) => e.id === id);
  const [card, setCard] = useState<EventCard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setCard(null);
    setFailed(false);
    fetch(shareApiUrl(token, `events/${encodeURIComponent(id)}/card.json`))
      .then(async (res) => {
        if (!res.ok) throw new Error('card');
        const data = (await res.json()) as EventCard;
        if (active) setCard(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, token]);
  // An old `#variants-event-…` link scrolls to the card's variants block once it is there.
  useEffect(() => {
    if (!card || !location.hash) return;
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
          <Collaboration entityType="event" entityId={id} label={`event ${name}`} />
          {card && <CopyMarkdownButton iconOnly getMarkdown={() => eventCardToMarkdown(card)} label={`Copy event ${name} as Markdown`} />}
          <CopyPortalLink target={{ view: 'events', id: name }} label={name} />
          <CopyNameButton name={name} />
        </>
      }
      notes={
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {event.business_name && event.business_name !== name && <span>{event.business_name}</span>}
          {(event.sources ?? []).map((s) => <SourceBadge key={s.id} system={s.system} method={s.method} color={s.color} />)}
          <CertificationBadge certification={event.certification} compact />
          {event.description && <p className="basis-full whitespace-pre-wrap [overflow-wrap:anywhere]">{event.description}</p>}
        </div>
      }
    >
      {failed && <p role="alert" className="text-sm text-red-700">This event could not be loaded. Reload the page to try again.</p>}
      {!card && !failed && <p className="text-sm text-gray-400">Loading…</p>}
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
    </PortalPage>
  );
}
