/**
 * The identification flow block of the portal's Identity view (T-5-42), kept in its own module as
 * the drop-in point for the structured `IdentificationFlowView` of the session "Structured
 * identification flow in the client portal". Until that lands, it renders the generated paragraph
 * (D-67) exactly as the single page did; that session replaces this body with its view.
 */
import React from 'react';
import type { TrackingDocumentSummary } from '@/src/domain/document/trackingDocument';

export function PortalIdentificationFlow({ doc }: { doc: Pick<TrackingDocumentSummary, 'identification_flow'> }) {
  if (!doc.identification_flow) return null;
  return (
    <section className="space-y-1" data-testid="shared-identification-flow">
      <h2 className="text-base font-semibold text-gray-900">Identification flow</h2>
      <p className="text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{doc.identification_flow}</p>
    </section>
  );
}
