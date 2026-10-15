/**
 * The portal's sections in sidebar order with their counts (T-5-42). Pure. A section without
 * content is left out, as the single page left it out; QA is always there (reports can exist
 * without open findings).
 */
import type { TrackingDocumentSummary } from '../../domain/document/trackingDocument';
import { sectionPresence, type NavDocInput } from '../shared/viewHelpers';
import type { PortalView } from './portalModel';

export interface PortalSection {
  view: Exclude<PortalView, 'overview'>;
  /** Items in the section; for QA the open findings. */
  count: number | null;
}

export function portalSections(doc: TrackingDocumentSummary): PortalSection[] {
  const present = sectionPresence(doc as unknown as NavDocInput);
  const open = doc.findings_summary.open;
  const all: (PortalSection & { present: boolean })[] = [
    { view: 'events', count: doc.events.length, present: present.events },
    { view: 'properties', count: doc.properties.length + (doc.event_properties?.length ?? 0), present: present.properties },
    { view: 'use-cases', count: doc.use_cases.length, present: present.useCases },
    { view: 'identity', count: doc.identity_rules.length, present: present.identity },
    { view: 'catalogs', count: doc.catalogs.length, present: present.catalogs },
    { view: 'consents', count: doc.consent_categories.length, present: present.consents },
    { view: 'standard-events', count: doc.standard_event_mappings.length, present: present.mapping },
    { view: 'qa', count: open.error + open.warning + open.info, present: true },
  ];
  return all.filter((s) => s.present).map(({ view, count }) => ({ view, count }));
}
