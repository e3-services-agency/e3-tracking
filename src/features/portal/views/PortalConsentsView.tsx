/**
 * Portal Consent categories view (T-5-42): the shared `ConsentTable`. Consents carry no comments
 * and no detail page; `consents/<slug>` (an old `#consent-…` link) marks the row.
 */
import React, { useMemo } from 'react';
import { ConsentTable, consentRowsFromDocument } from '@/src/features/views';
import { usePortal } from '../PortalContext';
import { CopyPortalLink, PortalPage } from '../PortalParts';

export function PortalConsentsView() {
  const { summary, location, index } = usePortal();
  const rows = useMemo(() => consentRowsFromDocument(summary), [summary]);
  const highlightId = location.id ? index.consentIdBySlug.get(location.id) ?? null : null;
  return (
    <PortalPage view="consents" count={rows.length}>
      <ConsentTable
        rows={rows}
        readOnly
        highlightId={highlightId}
        rowActions={(row) => <CopyPortalLink target={{ view: 'consents', id: index.consentSlugById.get(row.id) ?? null }} label={row.name} />}
        empty={{ message: 'No consent categories in this tracking plan.' }}
      />
    </PortalPage>
  );
}
