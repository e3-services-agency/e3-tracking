/**
 * Public `TrackingDocument` to view rows (D-88 plan section 1, T-5-40). Pure. The portal feeds the
 * shared views only through these, so a view never sees anything the public projection
 * (`toPublicTrackingDocument`) did not already expose. Fields the document does not carry
 * (priority, owner, internal statuses) come out as `null` and the views drop those columns in
 * read-only mode.
 */
import type {
  EventCard,
  EventCardExpiration,
  TrackingDocument,
  TrackingDocumentCatalog,
  TrackingDocumentConsentCategory,
  TrackingDocumentCustomerProperty,
  TrackingDocumentEventProperty,
  TrackingDocumentIdentityRule,
  TrackingDocumentPropertyDefinition,
  TrackingDocumentStandardEventMapping,
  TrackingDocumentUseCase,
} from '@/src/domain/document/trackingDocument';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import type {
  CatalogViewRow,
  ConsentViewRow,
  EventViewRow,
  IdentityRuleViewRow,
  PropertyViewRow,
  StandardEventViewRow,
  UseCaseViewRow,
} from '../types';

/** Effective expiration as one label; anything that is not the event's own setting reads as the project default. */
export function expirationFromDocument(expiration: EventCardExpiration | null | undefined): EventViewRow['expiration'] {
  const effective = expiration?.effective;
  if (!expiration || expiration.source !== 'event' || !effective) return { label: 'project default', inherited: true };
  if (!effective.enabled) return { label: 'Disabled', inherited: false };
  return { label: `${effective.count ?? ''} ${effective.units ?? ''}`.trim(), inherited: false };
}

export function eventRowFromCard(card: EventCard): EventViewRow {
  const cert = card.certification;
  return {
    id: card.id,
    name: card.name,
    business_name: card.business_name,
    description: card.description,
    class: card.class,
    sources: (card.sources ?? []).map((s) => ({ id: s.id, name: s.name, system: s.system, method: s.method, color: s.color ?? null })),
    status: card.status,
    certified: !cert?.applicable ? 'n/a' : cert.certified ? 'yes' : 'no',
    certified_reasons: cert?.reasons ?? [],
    expiration: expirationFromDocument(card.expiration),
    property_count: card.properties?.length ?? 0,
    variants: (card.variants ?? []).map((v) => ({ id: v.id, name: v.name, description: null })),
  };
}

export function eventRowsFromDocument(doc: Pick<TrackingDocument, 'events'>): EventViewRow[] {
  return doc.events.map(eventRowFromCard);
}

/** The largest allowed-value list across a property's definitions. */
function enumCount(definitions: readonly TrackingDocumentPropertyDefinition[] | undefined): number {
  return Math.max(0, ...(definitions ?? []).map((d) => d.allowed_values?.length ?? 0));
}

function customerPropertyRow(p: TrackingDocumentCustomerProperty): PropertyViewRow {
  return {
    id: p.property_id,
    name: p.name,
    scope: 'customer',
    description: p.description,
    category: p.category,
    category_set_by_hand: false,
    data_type: p.data_type,
    kind: null,
    enum_count: enumCount(p.definitions),
    priority: null,
    status: null,
    definition_count: p.definitions?.length ?? 0,
    used_by_count: 0,
  };
}

function eventPropertyRow(p: TrackingDocumentEventProperty): PropertyViewRow {
  return {
    id: p.property_id,
    name: p.name,
    scope: 'event',
    description: p.description,
    category: p.category,
    category_set_by_hand: false,
    data_type: p.data_type,
    kind: p.kind,
    enum_count: enumCount(p.definitions),
    priority: null,
    status: null,
    definition_count: p.definitions?.length ?? 0,
    used_by_count: p.used_in_events?.length ?? 0,
  };
}

/** Customer-scope `properties[]` then event-scope `event_properties[]`; the table groups by category. */
export function propertyRowsFromDocument(doc: Pick<TrackingDocument, 'properties' | 'event_properties'>): PropertyViewRow[] {
  return [...doc.properties.map(customerPropertyRow), ...(doc.event_properties ?? []).map(eventPropertyRow)];
}

export function useCaseRowFromDocument(uc: TrackingDocumentUseCase): UseCaseViewRow {
  return {
    id: uc.id,
    code: uc.code,
    name: uc.name,
    type: uc.type,
    description: uc.narrative,
    priority: null,
    status: uc.status,
    owner: null,
    requirement_count: uc.requirements?.length ?? 0,
  };
}

export function useCaseRowsFromDocument(doc: Pick<TrackingDocument, 'use_cases'>): UseCaseViewRow[] {
  return doc.use_cases.map(useCaseRowFromDocument);
}

/** Acts per identifier, counted across every rule of the project. */
export function actCounts(rules: readonly { identifier_name: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rules) counts.set(r.identifier_name, (counts.get(r.identifier_name) ?? 0) + 1);
  return counts;
}

export function identityRowsFromDocument(doc: Pick<TrackingDocument, 'identity_rules'>): IdentityRuleViewRow[] {
  const counts = actCounts(doc.identity_rules);
  return doc.identity_rules.map((r: TrackingDocumentIdentityRule) => ({
    id: r.id,
    name: r.name,
    identifier_name: r.identifier_name,
    identifier_act_count: counts.get(r.identifier_name) ?? 1,
    identity_type: r.identity_type,
    sdk_call: r.sdk_call,
    trigger_event: r.set_by?.kind === 'event' ? r.set_by.event.name : null,
    set_by: r.set_by,
    binds: r.binds ?? [],
    // The document names the carrying events only; the name doubles as the id.
    carried_by: (r.carried_by ?? []).map((name) => ({ id: name, name })),
    status: null,
  }));
}

export function catalogRowFromDocument(c: TrackingDocumentCatalog): CatalogViewRow {
  return {
    id: c.id ?? c.name,
    name: c.name,
    description: c.description ?? null,
    kind: c.kind ?? null,
    market_label: catalogMarketLabel(c.market, c.language),
    version: c.version ?? null,
    live: !!c.live_at,
    mapping_role: c.mapping_role,
    status: c.status,
    field_count: c.fields?.length ?? 0,
  };
}

export function catalogRowsFromDocument(doc: Pick<TrackingDocument, 'catalogs'>): CatalogViewRow[] {
  return doc.catalogs.map(catalogRowFromDocument);
}

export function consentRowsFromDocument(doc: Pick<TrackingDocument, 'consent_categories'>): ConsentViewRow[] {
  return doc.consent_categories.map((c: TrackingDocumentConsentCategory) => ({
    id: c.id ?? c.name,
    name: c.name,
    standard_key: c.standard_key,
    status: c.status,
  }));
}

/** One row per mapping; a standard event mapped by more than one variant keeps one row each. */
export function standardEventRowsFromDocument(doc: Pick<TrackingDocument, 'standard_event_mappings'>): StandardEventViewRow[] {
  const seen = new Map<string, number>();
  return doc.standard_event_mappings.map((m: TrackingDocumentStandardEventMapping) => {
    const n = (seen.get(m.standard_event) ?? 0) + 1;
    seen.set(m.standard_event, n);
    const fields = Object.values(m.field_map);
    return {
      id: n === 1 ? m.standard_event : `${m.standard_event}#${n}`,
      key: m.standard_event,
      field_count: fields.length,
      mapped_field_count: fields.filter(Boolean).length,
      event_name: m.event_name,
      variant_name: m.variant_name,
    };
  });
}
