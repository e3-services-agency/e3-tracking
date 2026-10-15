/**
 * Portal Standard events view (T-5-42): the shared `StandardEventsTable` (one row per mapping),
 * and a mapping's own page at `standard-events/<slug>` with its field map.
 */
import React, { useMemo } from 'react';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { StandardMappingBlock } from '@/src/features/events/components/EventCardView';
import { StandardEventsTable, standardEventRowsFromDocument } from '@/src/features/views';
import { usePortal } from '../PortalContext';
import { CopyPortalLink, NotInShare, PortalPage, usePortalRef } from '../PortalParts';

export function PortalStandardEventsView() {
  const { location } = usePortal();
  return location.id ? <PortalMappingDetail key={location.id} slug={location.id} /> : <PortalStandardEventsList />;
}

function PortalStandardEventsList() {
  const { summary, navigate, index } = usePortal();
  const rows = useMemo(() => standardEventRowsFromDocument(summary), [summary]);
  // One row per mapping, in document order, so a row's position is its mapping's index.
  const slugOf = useMemo(() => new Map(rows.map((r, i) => [r.id, index.mappingSlugs[i]])), [rows, index]);
  const target = (id: string) => ({ view: 'standard-events' as const, id: slugOf.get(id) ?? null });
  return (
    <PortalPage view="standard-events" count={rows.length}>
      <StandardEventsTable
        rows={rows}
        readOnly
        onOpen={(row) => navigate(target(row.id))}
        rowActions={(row) => <CopyPortalLink target={target(row.id)} label={row.key} />}
        empty={{ message: 'No standard event mappings in this tracking plan.' }}
      />
    </PortalPage>
  );
}

function PortalMappingDetail({ slug }: { slug: string }) {
  const { summary, index } = usePortal();
  const renderRef = usePortalRef();
  const i = index.mappingIndexBySlug.get(slug);
  const mapping = i === undefined ? undefined : summary.standard_event_mappings[i];
  if (!mapping) return <NotInShare view="standard-events" />;
  return (
    <PortalPage
      view="standard-events"
      back
      title={mapping.standard_event}
      actions={
        <>
          <CopyPortalLink target={{ view: 'standard-events', id: slug }} label={mapping.standard_event} />
          <CopyNameButton name={mapping.standard_event} />
        </>
      }
      notes={
        <p className="text-sm text-gray-600">
          Project event: {mapping.event_name ? renderRef({ kind: 'event', name: mapping.event_name }, mapping.event_name) : '—'}
          {mapping.variant_name && <> · variant {mapping.variant_name}</>}
        </p>
      }
    >
      <StandardMappingBlock mapping={mapping} eventName={mapping.event_name} />
    </PortalPage>
  );
}
