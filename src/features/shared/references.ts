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
  | { kind: 'property'; id?: string | null; name?: string | null; scope?: string | null };

export type ReferenceTarget =
  | { mode: 'shared'; href: string; anchor: string }
  | { mode: 'internal'; href: string; tab: 'eventCard' | 'properties'; eventCardId?: string; editId?: string };

export interface ReferenceDocInput {
  events: { id?: string; name: string }[];
  /** Customer-scope properties. */
  properties: { property_id: string; name: string }[];
  /** Event-scope properties (D-64). */
  event_properties?: { property_id: string; name: string }[];
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
}

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
  return { eventAnchorById, eventAnchorByName, eventIdByName, propertyAnchorById: propertyAnchors(doc), propertyIdByScopeName, propertyIdByName };
}

/** Where a reference points in `mode`, or `null` when it does not resolve (the caller then renders plain text). */
export function resolveReference(ref: Reference, mode: ReferenceMode, index: ReferenceIndex): ReferenceTarget | null {
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
