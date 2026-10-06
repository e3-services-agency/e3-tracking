/**
 * Cross-references (T-4-22): one pure helper that maps a reference to an event or a property to
 * where it lives, in each mode.
 *
 * - `shared` (the public documentation page): a same-page hash, `#event-<slug>` (the T-4-14 event
 *   anchors) or `#property-<slug>` (a property row in the Properties section).
 * - `internal` (the authenticated app): a route descriptor. The event card has its own path
 *   (`/events/<id>/card`); a property opens in the Properties editor, which the app reaches through
 *   the store (`selectedItemIdToEdit` + `requestedTab`), same as the Comments page. `href` is
 *   relative to the app base (`pushPath` adds the base and the project key).
 *
 * Relative imports only so it loads from a plain-Node vitest test (D-20).
 */
import { eventAnchors, slugAnchors } from './viewHelpers';

export type ReferenceMode = 'shared' | 'internal';

/** A reference to an event or a property, by id when known, else by name (and scope for a property,
 * since a customer and an event property may share a name). */
export type Reference =
  | { kind: 'event'; id?: string | null; name?: string | null }
  | { kind: 'property'; id?: string | null; name?: string | null; scope?: string | null }
  /** T-4-25: a variant opens its event card at the variants block. */
  | { kind: 'variant'; id: string | null | undefined }
  | { kind: 'catalog'; id: string | null | undefined }
  | { kind: 'consent'; id: string | null | undefined };

export type ReferenceTarget =
  | { mode: 'shared'; href: string; anchor: string }
  | { mode: 'internal'; href: string; tab: 'eventCard' | 'properties'; eventCardId?: string; editId?: string };

export interface ReferenceDocInput {
  events: { id?: string; name: string; variants?: { id: string; name?: string | null }[] }[];
  /** Customer-scope properties. */
  properties: { property_id: string; name: string }[];
  /** Event-scope properties (D-64). */
  event_properties?: { property_id: string; name: string }[];
  /** T-4-25: catalog cards and consent rows. */
  catalogs?: { id?: string; name: string }[];
  consent_categories?: { id?: string; name: string; standard_key?: string | null }[];
}

export interface ReferenceIndex {
  eventAnchorById: ReadonlyMap<string, string>;
  eventAnchorByName: ReadonlyMap<string, string>;
  eventIdByName: ReadonlyMap<string, string>;
  propertyAnchorById: ReadonlyMap<string, string>;
  /** Keyed `<scope>:<name>`, scope `customer` or `event`. */
  propertyIdByScopeName: ReadonlyMap<string, string>;
  /** Keyed by name alone: the first match, customer properties first. */
  propertyIdByName: ReadonlyMap<string, string>;
  /** T-4-25 */
  eventNameById: ReadonlyMap<string, string>;
  propertyNameById: ReadonlyMap<string, string>;
  variantNameById: ReadonlyMap<string, string>;
  /** variant id -> the id of its event. */
  variantEventId: ReadonlyMap<string, string>;
  catalogAnchorById: ReadonlyMap<string, string>;
  consentAnchorById: ReadonlyMap<string, string>;
  /** Consent row anchor by category name and by standard key (T-4-25: for findings that carry only those). */
  consentAnchorByName: ReadonlyMap<string, string>;
  consentAnchorByStandardKey: ReadonlyMap<string, string>;
}

/** Anchor of an event's variants block on the shared page (T-4-25): `variants-<event anchor>`. */
export const VARIANTS_ANCHOR_PREFIX = 'variants-';

/** Unique property row anchors `property-<slug>`, customer properties first then event properties
 * (the order the Properties section lists them in). Pure. */
export function propertyAnchors(doc: Pick<ReferenceDocInput, 'properties' | 'event_properties'>): Map<string, string> {
  const all = [...doc.properties, ...(doc.event_properties ?? [])];
  const anchors = slugAnchors('property', all.map((p) => p.name));
  return new Map(all.map((p, i) => [p.property_id, anchors[i]]));
}

export function buildReferenceIndex(doc: ReferenceDocInput): ReferenceIndex {
  const evAnchors = eventAnchors(doc.events.map((e) => e.name));
  const eventAnchorById = new Map<string, string>();
  const eventAnchorByName = new Map<string, string>();
  const eventIdByName = new Map<string, string>();
  doc.events.forEach((e, i) => {
    if (e.id) {
      eventAnchorById.set(e.id, evAnchors[i]);
      eventIdByName.set(e.name, e.id);
    }
    eventAnchorByName.set(e.name, evAnchors[i]);
  });
  const propertyIdByScopeName = new Map<string, string>();
  const propertyIdByName = new Map<string, string>();
  for (const p of doc.properties) {
    propertyIdByScopeName.set(`customer:${p.name}`, p.property_id);
    if (!propertyIdByName.has(p.name)) propertyIdByName.set(p.name, p.property_id);
  }
  for (const p of doc.event_properties ?? []) {
    propertyIdByScopeName.set(`event:${p.name}`, p.property_id);
    if (!propertyIdByName.has(p.name)) propertyIdByName.set(p.name, p.property_id);
  }
  const eventNameById = new Map<string, string>();
  const variantNameById = new Map<string, string>();
  const variantEventId = new Map<string, string>();
  for (const e of doc.events) {
    if (e.id) eventNameById.set(e.id, e.name);
    for (const v of e.variants ?? []) {
      if (e.id) variantEventId.set(v.id, e.id);
      if (v.name) variantNameById.set(v.id, v.name);
    }
  }
  const propertyNameById = new Map<string, string>();
  for (const p of [...doc.properties, ...(doc.event_properties ?? [])]) propertyNameById.set(p.property_id, p.name);
  const idAnchors = (prefix: string, list: { id?: string; name: string }[] | undefined) => {
    const items = list ?? [];
    const anchors = slugAnchors(prefix, items.map((i) => i.name));
    const map = new Map<string, string>();
    items.forEach((i, n) => {
      if (i.id) map.set(i.id, anchors[n]);
    });
    return map;
  };
  const consentAnchors = idAnchors('consent', doc.consent_categories);
  return {
    eventAnchorById,
    eventAnchorByName,
    eventIdByName,
    propertyAnchorById: propertyAnchors(doc),
    propertyIdByScopeName,
    propertyIdByName,
    eventNameById,
    propertyNameById,
    variantNameById,
    variantEventId,
    catalogAnchorById: idAnchors('catalog', doc.catalogs),
    consentAnchorById: idAnchors('consent', doc.consent_categories),
    consentAnchorByName: new Map((doc.consent_categories ?? []).flatMap((c) => (c.id && consentAnchors.get(c.id) ? [[c.name, consentAnchors.get(c.id) as string] as const] : []))),
    consentAnchorByStandardKey: new Map((doc.consent_categories ?? []).flatMap((c) => (c.id && c.standard_key && consentAnchors.get(c.id) ? [[c.standard_key, consentAnchors.get(c.id) as string] as const] : []))),
  };
}

/** Where a reference points in `mode`, or `null` when it does not resolve (the caller then renders plain text). */
export function resolveReference(ref: Reference, mode: ReferenceMode, index: ReferenceIndex): ReferenceTarget | null {
  if (ref.kind === 'variant' || ref.kind === 'catalog' || ref.kind === 'consent') {
    if (!ref.id) return null;
    if (ref.kind === 'variant') {
      const eventId = index.variantEventId.get(ref.id);
      if (!eventId) return null;
      if (mode === 'internal') return { mode, href: `/events/${eventId}/card`, tab: 'eventCard', eventCardId: eventId };
      const ev = index.eventAnchorById.get(eventId);
      return ev ? { mode, href: `#${VARIANTS_ANCHOR_PREFIX}${ev}`, anchor: `${VARIANTS_ANCHOR_PREFIX}${ev}` } : null;
    }
    if (mode === 'internal') return null;
    const anchor = (ref.kind === 'catalog' ? index.catalogAnchorById : index.consentAnchorById).get(ref.id);
    return anchor ? { mode, href: `#${anchor}`, anchor } : null;
  }
  if (ref.kind === 'event') {
    if (mode === 'shared') {
      const anchor = (ref.id && index.eventAnchorById.get(ref.id)) || (ref.name ? index.eventAnchorByName.get(ref.name) : undefined);
      return anchor ? { mode, href: `#${anchor}`, anchor } : null;
    }
    const id = ref.id || (ref.name ? index.eventIdByName.get(ref.name) : undefined);
    return id ? { mode, href: `/events/${id}/card`, tab: 'eventCard', eventCardId: id } : null;
  }
  const id =
    ref.id ||
    (ref.name ? (ref.scope ? index.propertyIdByScopeName.get(`${ref.scope}:${ref.name}`) : index.propertyIdByName.get(ref.name)) : undefined);
  if (!id) return null;
  if (mode === 'shared') {
    const anchor = index.propertyAnchorById.get(id);
    return anchor ? { mode, href: `#${anchor}`, anchor } : null;
  }
  return { mode, href: '/properties', tab: 'properties', editId: id };
}

/** The href alone (`#anchor` shared, app-relative path internal), or `null`. */
export function referenceHref(ref: Reference, mode: ReferenceMode, index: ReferenceIndex): string | null {
  return resolveReference(ref, mode, index)?.href ?? null;
}

/** The property id a URL hash (with or without `#`, possibly percent-encoded) points at, or `null`. */
export function propertyIdForHash(hash: string, index: ReferenceIndex): string | null {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  if (!raw.startsWith('property-')) return null;
  for (const [id, anchor] of index.propertyAnchorById) if (anchor === raw) return id;
  return null;
}
