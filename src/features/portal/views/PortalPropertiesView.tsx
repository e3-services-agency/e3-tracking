/**
 * Portal Properties view (T-5-42): the shared `PropertiesTable` (customer and event properties,
 * grouped by category, at most `ROW_LIMIT` rows at a time to keep the view within its DOM budget),
 * and a property's own page at `properties/<slug>` with its named definitions (D-58), each with its
 * own comments, and the events that use it.
 */
import React, { useMemo } from 'react';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { CategoryBadge } from '@/src/components/ui/CategoryBadge';
import { HintTh } from '@/src/components/ui/FieldHint';
import { ExampleCell } from '@/src/features/events/components/EventCardView';
import { formatExampleValues } from '@/src/domain/examples';
import { propertiesToMarkdown } from '@/src/domain/document/markdown';
import { formatDisplayName } from '@/src/domain/propertyCategory';
import type { TrackingDocumentCustomerProperty, TrackingDocumentEventProperty } from '@/src/domain/document/trackingDocument';
import { PropertiesTable, propertyRowsFromDocument } from '@/src/features/views';
import { PORTAL_ROW_LIMIT } from '@/src/features/views/ViewParts';
import { usePortal } from '../PortalContext';
import { Collaboration, CopyPortalLink, NotInShare, PortalPage, useCommentCount, usePortalRef } from '../PortalParts';
import { NamingNote } from './PortalEventsView';

/** Rows rendered at a time: 648 properties on the sandbox would otherwise exceed the view's budget. */
export const PROPERTY_ROW_LIMIT = PORTAL_ROW_LIMIT;

type PropertyItem = TrackingDocumentCustomerProperty | TrackingDocumentEventProperty;

export function PortalPropertiesView() {
  const { location } = usePortal();
  return location.id ? <PortalPropertyDetail key={location.id} slug={location.id} /> : <PortalPropertiesList />;
}

function PortalPropertiesList() {
  const { summary, navigate, index } = usePortal();
  const commentCount = useCommentCount();
  const rows = useMemo(() => propertyRowsFromDocument(summary), [summary]);
  const all = useMemo(() => [...summary.properties, ...(summary.event_properties ?? [])], [summary]);
  const target = (id: string) => ({ view: 'properties' as const, id: index.propertySlugById.get(id) ?? null });
  return (
    <PortalPage
      view="properties"
      count={rows.length}
      notes={<NamingNote />}
      actions={<CopyMarkdownButton getMarkdown={() => propertiesToMarkdown(all)} label="Copy properties as Markdown" />}
    >
      <PropertiesTable
        rows={rows}
        readOnly
        rowLimit={PROPERTY_ROW_LIMIT}
        onOpen={(row) => navigate(target(row.id))}
        commentCount={(row) => commentCount('property', row.id)}
        commentsInActions
        rowActions={(row) => (
          <>
            <Collaboration entityType="property" entityId={row.id} label={row.name} />
            <CopyPortalLink target={target(row.id)} label={row.name} />
          </>
        )}
        empty={{ message: 'No properties in this tracking plan.' }}
      />
    </PortalPage>
  );
}

function PortalPropertyDetail({ slug }: { slug: string }) {
  const { summary, index } = usePortal();
  const renderRef = usePortalRef();
  const id = index.propertyIdBySlug.get(slug);
  const property: PropertyItem | undefined = [...summary.properties, ...(summary.event_properties ?? [])].find((p) => p.property_id === id);
  if (!id || !property) return <NotInShare view="properties" />;
  const usedIn = 'used_in_events' in property ? property.used_in_events ?? [] : [];
  const scope = 'used_in_events' in property ? 'event' : 'customer';
  return (
    <PortalPage
      view="properties"
      back
      title={property.name}
      actions={
        <>
          <Collaboration entityType="property" entityId={id} label={property.name} />
          <CopyMarkdownButton iconOnly getMarkdown={() => propertiesToMarkdown([property])} label={`Copy property ${property.name} as Markdown`} />
          <CopyPortalLink target={{ view: 'properties', id: slug }} label={property.name} />
          <CopyNameButton name={property.name} />
        </>
      }
      notes={
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <CategoryBadge category={property.category} />
          <span>{scope} property</span>
          <span className="font-mono text-xs">{property.data_type}</span>
        </div>
      }
    >
      {property.description && <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{property.description}</p>}
      {property.data_formats.length > 0 && <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">Formats: {property.data_formats.map(formatDisplayName).join(', ')}</p>}
      {usedIn.length > 0 && (
        <p className="text-sm text-gray-600 [overflow-wrap:anywhere]" data-testid="property-used-in">
          Used in:{' '}
          {usedIn.map((name, i) => (
            <React.Fragment key={name}>
              {i > 0 && ', '}
              {renderRef({ kind: 'event', name }, name)}
            </React.Fragment>
          ))}
        </p>
      )}
      <section aria-label="Definitions" className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Definitions ({property.definitions.length})</h2>
        <div role="region" aria-label="Definitions table" tabIndex={0} className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                {['Definition', 'Description', 'Allowed values', 'Formats', 'Example', 'Actions'].map((h) => (
                  <HintTh scope="col" key={h} className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">
                    {h}
                  </HintTh>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {property.definitions.map((d) => (
                <tr key={d.id ?? d.name} className="align-top">
                  <td className="px-3 py-2 [overflow-wrap:anywhere]">
                    <span className="inline-flex flex-wrap items-center gap-1.5 font-medium text-gray-900">
                      {d.name}
                      <CopyNameButton name={d.name} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{d.description ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-700 [overflow-wrap:anywhere]">{d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{d.formats.map(formatDisplayName).join(', ') || '—'}</td>
                  <td className="px-3 py-2"><ExampleCell value={formatExampleValues(d.example_values)} /></td>
                  <td className="px-3 py-2">{d.id && <Collaboration entityType="property_definition" entityId={d.id} label={`${property.name}: ${d.name}`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PortalPage>
  );
}
