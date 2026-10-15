/**
 * Internal REST rows to view rows (T-5-40). Pure and thin: each input type lists only the fields
 * the view needs, so the pages pass their own row objects unchanged.
 */
import { classifyProperty, isPropertyCategory } from '@/src/domain/propertyCategory';
import { catalogMarketLabel } from '@/src/domain/catalogs';
import type { IdentifierSetBy } from '@/src/domain/identity/identifiers';
import type { StandardEventRow } from '@/src/domain/standardEventRows';
import { actCounts } from './document';
import type {
  CatalogViewRow,
  ConsentViewRow,
  EventVariantRow,
  EventViewRow,
  IdentityRuleViewRow,
  PropertyViewRow,
  StandardEventViewRow,
  UseCaseViewRow,
  ViewSource,
} from '../types';

export interface InternalEventLike {
  id: string;
  name: string;
  business_name: string | null;
  description: string | null;
  class: string;
  status: string;
  sources?: ViewSource[];
  certified?: 'yes' | 'no' | 'n/a';
  certified_reasons?: string[];
  expiration_json: { enabled: boolean; count: number; units: string } | null;
  attached_property_count?: number;
}

/** `GET /events` stores only the event's own expiration; `null` means the project default. */
export function expirationFromInternal(expiration: InternalEventLike['expiration_json']): EventViewRow['expiration'] {
  if (!expiration) return { label: 'project default', inherited: true };
  if (!expiration.enabled) return { label: 'Disabled', inherited: false };
  return { label: `${expiration.count} ${expiration.units}`, inherited: false };
}

export function eventRowsFromInternal(
  events: readonly InternalEventLike[],
  variantsByEventId: Readonly<Record<string, readonly EventVariantRow[]>> = {}
): EventViewRow[] {
  return events.map((ev) => ({
    id: ev.id,
    name: ev.name,
    business_name: ev.business_name,
    description: ev.description,
    class: ev.class,
    sources: ev.sources ?? [],
    status: ev.status,
    certified: ev.certified ?? 'n/a',
    certified_reasons: ev.certified_reasons ?? [],
    expiration: expirationFromInternal(ev.expiration_json),
    property_count: ev.attached_property_count ?? 0,
    variants: [...(variantsByEventId[ev.id] ?? [])],
  }));
}

export interface InternalPropertyLike {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  category_override?: string | null;
  data_type: string;
  kind?: string;
  allowed_values_json?: readonly unknown[] | null;
  priority: string | null;
  status: string | null;
  definitions?: readonly unknown[];
  used_by_events?: readonly unknown[];
}

export function propertyRowFromInternal(p: InternalPropertyLike): PropertyViewRow {
  return {
    id: p.id,
    name: p.name,
    scope: p.scope,
    description: p.description,
    category: classifyProperty(p),
    category_set_by_hand: isPropertyCategory(p.category_override),
    data_type: p.data_type,
    kind: p.kind ?? null,
    enum_count: Array.isArray(p.allowed_values_json) ? p.allowed_values_json.length : 0,
    priority: p.priority,
    status: p.status,
    definition_count: p.definitions?.length ?? 0,
    used_by_count: p.used_by_events?.length ?? 0,
  };
}

export interface InternalUseCaseLike {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
}

export function useCaseRowsFromInternal(useCases: readonly InternalUseCaseLike[]): UseCaseViewRow[] {
  return useCases.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    type: u.type,
    description: u.description,
    priority: u.priority,
    status: u.status,
    owner: u.owner,
    requirement_count: null,
  }));
}

export interface InternalIdentityRuleLike {
  id: string;
  name: string;
  identifier_name: string;
  identity_type: string;
  sdk_call: string | null;
  trigger_event_id: string | null;
  status: string | null;
  set_by?: IdentifierSetBy;
  binds?: string[];
  carried_by?: { id: string; name: string }[];
}

export function identityRowsFromInternal(
  rules: readonly InternalIdentityRuleLike[],
  events: readonly { id: string; name: string }[]
): IdentityRuleViewRow[] {
  const counts = actCounts(rules);
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    identifier_name: r.identifier_name,
    identifier_act_count: counts.get(r.identifier_name) ?? 1,
    identity_type: r.identity_type,
    sdk_call: r.sdk_call,
    trigger_event: r.trigger_event_id ? eventName.get(r.trigger_event_id) ?? null : null,
    set_by: r.set_by,
    binds: r.binds ?? [],
    carried_by: r.carried_by ?? [],
    status: r.status,
  }));
}

export interface InternalCatalogLike {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  market: string | null;
  language: string | null;
  version: string;
  live_at: string | null;
  mapping_role: string | null;
  status: string | null;
}

export function catalogRowsFromInternal(catalogs: readonly InternalCatalogLike[]): CatalogViewRow[] {
  return catalogs.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    market_label: catalogMarketLabel(c.market, c.language),
    version: c.version,
    live: !!c.live_at,
    mapping_role: c.mapping_role,
    status: c.status,
    field_count: null,
  }));
}

export function consentRowsFromInternal(categories: readonly { id: string; name: string; standard_key: string | null; status: string | null }[]): ConsentViewRow[] {
  return categories.map((c) => ({ id: c.id, name: c.name, standard_key: c.standard_key, status: c.status }));
}

/** From `buildStandardEventRows` (seed plus additions joined with the project's mappings). */
export function standardEventRowsFromInternal(rows: readonly StandardEventRow[]): StandardEventViewRow[] {
  return rows.map((r) => ({
    id: r.key,
    key: r.key,
    field_count: r.fieldCount,
    mapped_field_count: null,
    event_name: r.mappedEventName,
    variant_name: r.mappedVariantName,
  }));
}
