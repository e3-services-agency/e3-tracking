/**
 * Client portal routing model (T-5-42, D-88 plan section 4). Pure: the views of
 * `/tracking-plan/shared/:token/<view>[/<id>]`, the path id of every item, and where every link
 * sent before the portal had views lands. The old single page addressed everything by hash
 * (`#event-<name>`, `#property-…`, `#variants-event-…`, `#catalog-…`, `#consent-…`, `#mapping-…`,
 * `#use-case-…`, section and group ids, finding anchors, `#comment=v1&…`); those links redirect
 * indefinitely (user, 2026-10-15), so the anchors keep their T-4-14/T-4-21/T-4-25 slugs here.
 *
 * Path ids: an event is addressed by its name (unique per project), a use case by its code (or id
 * when it has none or the code repeats), a property, catalog, consent or standard event mapping by
 * the slug of its old anchor without the prefix (unique by construction, readable), an identity
 * rule by its id.
 */
import type { TrackingDocumentSummary } from '../../domain/document/trackingDocument';
import { eventAnchors, sharedSectionGroups, slugAnchors, type NavDocInput } from '../shared/viewHelpers';
import { VARIANTS_ANCHOR_PREFIX, propertyAnchors } from '../shared/references';
import { parseCommentLink, resolveCommentTarget, type CommentLinkTarget } from '../comments/commentLinks';
import { PROJECT_FINDINGS, type FindingNavigation } from '../shared/sharedFindingsModel';

export const PORTAL_VIEWS = ['overview', 'events', 'properties', 'use-cases', 'identity', 'catalogs', 'consents', 'standard-events', 'qa'] as const;
export type PortalView = (typeof PORTAL_VIEWS)[number];

export const PORTAL_VIEW_LABELS: Record<PortalView, string> = {
  overview: 'Overview',
  events: 'Events',
  properties: 'Properties',
  'use-cases': 'Use cases',
  identity: 'Identity',
  catalogs: 'Catalogs',
  consents: 'Consent categories',
  'standard-events': 'Standard events',
  qa: 'QA and findings',
};

/** The view a path segment names; no segment, or one the portal does not know, is the overview. */
export function portalViewOf(segment: string | null | undefined): PortalView {
  return (PORTAL_VIEWS as readonly string[]).includes(segment ?? '') ? (segment as PortalView) : 'overview';
}

/** Where a link lands: a view, an optional item, and the hash to keep (finding anchors, the
 * variants block, a comment link), with its `#`. */
export interface PortalTarget {
  view: PortalView;
  id: string | null;
  hash?: string;
  /** T-5-44: the link named an item this share does not have; the list it lands on says so. */
  notFound?: MissingItem;
}

/** An item a link or path names that is not in this share (renamed, removed, or a typo). */
export interface MissingItem {
  kind: 'event' | 'property' | 'use case' | 'catalog' | 'consent category' | 'standard event mapping' | 'identity rule';
  name: string;
}

/** The note a list shows after a link to a missing item landed on it. */
export function missingItemNote(item: MissingItem): string {
  return `No ${item.kind} “${item.name}” is in this tracking plan. It may have been renamed or removed; the full list is below.`;
}

export interface PortalIndex {
  eventNameByAnchor: ReadonlyMap<string, string>;
  eventNameById: ReadonlyMap<string, string>;
  eventIdByName: ReadonlyMap<string, string>;
  /** Event id by its old anchor (`event-<slug>`), for finding anchors. */
  eventIdByAnchor: ReadonlyMap<string, string>;
  propertySlugById: ReadonlyMap<string, string>;
  propertyIdBySlug: ReadonlyMap<string, string>;
  propertyIdByDefinitionId: ReadonlyMap<string, string>;
  /** Keyed by catalog id (or its name when it has none). */
  catalogSlugById: ReadonlyMap<string, string>;
  catalogIdBySlug: ReadonlyMap<string, string>;
  /** Keyed by consent id (or its name when it has none). */
  consentSlugById: ReadonlyMap<string, string>;
  consentIdBySlug: ReadonlyMap<string, string>;
  /** One slug per `standard_event_mappings` entry, in document order. */
  mappingSlugs: readonly string[];
  mappingIndexBySlug: ReadonlyMap<string, number>;
  useCasePathIdById: ReadonlyMap<string, string>;
  useCaseIdByPathId: ReadonlyMap<string, string>;
  useCaseIdByAnchor: ReadonlyMap<string, string>;
  useCaseIdByRequirementId: ReadonlyMap<string, string>;
  identityRuleIds: ReadonlySet<string>;
}

const strip = (anchor: string, prefix: string) => anchor.slice(prefix.length);

function bySlug(prefix: string, items: readonly { id?: string | null; name: string }[]) {
  const anchors = slugAnchors(prefix, items.map((i) => i.name));
  const slugById = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  items.forEach((item, n) => {
    const slug = strip(anchors[n], `${prefix}-`);
    const key = item.id ?? item.name;
    slugById.set(key, slug);
    idBySlug.set(slug, key);
  });
  return { slugById, idBySlug };
}

export function buildPortalIndex(doc: TrackingDocumentSummary): PortalIndex {
  const evAnchors = eventAnchors(doc.events.map((e) => e.name));
  const eventNameByAnchor = new Map<string, string>();
  const eventIdByAnchor = new Map<string, string>();
  doc.events.forEach((e, i) => {
    eventNameByAnchor.set(evAnchors[i], e.name);
    eventIdByAnchor.set(evAnchors[i], e.id);
  });

  const propertySlugById = new Map<string, string>();
  const propertyIdBySlug = new Map<string, string>();
  for (const [id, anchor] of propertyAnchors(doc)) {
    propertySlugById.set(id, strip(anchor, 'property-'));
    propertyIdBySlug.set(strip(anchor, 'property-'), id);
  }
  const propertyIdByDefinitionId = new Map<string, string>();
  for (const p of [...doc.properties, ...(doc.event_properties ?? [])]) {
    for (const d of p.definitions ?? []) if (d.id) propertyIdByDefinitionId.set(d.id, p.property_id);
  }

  const catalogs = bySlug('catalog', doc.catalogs);
  const consents = bySlug('consent', doc.consent_categories);

  // The same groups the old page built its anchors from (`sharedSectionGroups`), so old links match.
  const groups = sharedSectionGroups(doc as unknown as NavDocInput);
  const mappingSlugs = groups.mappingLeaves.map((leaf) => strip(leaf.id, 'mapping-'));
  const useCaseIdByAnchor = new Map<string, string>();
  for (const g of groups.useCaseGroups) for (const item of g.items) useCaseIdByAnchor.set(item.id, doc.use_cases[item.index].id);

  const codeCounts = new Map<string, number>();
  for (const uc of doc.use_cases) if (uc.code) codeCounts.set(uc.code, (codeCounts.get(uc.code) ?? 0) + 1);
  const useCasePathIdById = new Map<string, string>();
  const useCaseIdByPathId = new Map<string, string>();
  const useCaseIdByRequirementId = new Map<string, string>();
  for (const uc of doc.use_cases) {
    const pathId = uc.code && codeCounts.get(uc.code) === 1 ? uc.code : uc.id;
    useCasePathIdById.set(uc.id, pathId);
    useCaseIdByPathId.set(pathId, uc.id);
    for (const r of uc.requirements ?? []) useCaseIdByRequirementId.set(r.id, uc.id);
  }
  // An id also opens its use case, so a code change never breaks an id link.
  for (const uc of doc.use_cases) if (!useCaseIdByPathId.has(uc.id)) useCaseIdByPathId.set(uc.id, uc.id);

  return {
    eventNameByAnchor,
    eventNameById: new Map(doc.events.map((e) => [e.id, e.name])),
    eventIdByName: new Map(doc.events.map((e) => [e.name, e.id])),
    eventIdByAnchor,
    propertySlugById,
    propertyIdBySlug,
    propertyIdByDefinitionId,
    catalogSlugById: catalogs.slugById,
    catalogIdBySlug: catalogs.idBySlug,
    consentSlugById: consents.slugById,
    consentIdBySlug: consents.idBySlug,
    mappingSlugs,
    mappingIndexBySlug: new Map(mappingSlugs.map((slug, i) => [slug, i])),
    useCasePathIdById,
    useCaseIdByPathId,
    useCaseIdByAnchor,
    useCaseIdByRequirementId,
    identityRuleIds: new Set(doc.identity_rules.map((r) => r.id)),
  };
}

const SECTION_VIEWS: Record<string, PortalView> = {
  events: 'events',
  properties: 'properties',
  'use-cases': 'use-cases',
  identity: 'identity',
  consents: 'consents',
  catalogs: 'catalogs',
  mapping: 'standard-events',
};

/** Hash anchors the QA view resolves itself (finding filters, report evidence). */
export function isQaAnchor(anchor: string): boolean {
  return (
    anchor === 'findings' ||
    anchor === 'qa-reports' ||
    anchor === 'current-findings-table' ||
    anchor.startsWith('findings-') ||
    anchor.startsWith('current-finding-') ||
    anchor.startsWith('finding-')
  );
}

function decodeAnchor(hash: string): string {
  const raw = hash.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The view's list, with a note that the link named an item this share does not have (T-5-44). */
const missing = (view: PortalView, kind: MissingItem['kind'], name: string): PortalTarget => ({ view, id: null, notFound: { kind, name } });

/** Where an old single-page anchor (without `#`, decoded) lands, or `null` when it names nothing.
 * An anchor naming an item that is not in the share lands on the list with `notFound` (T-5-44). */
export function legacyAnchorTarget(anchor: string, index: PortalIndex): PortalTarget | null {
  if (!anchor) return null;
  if (SECTION_VIEWS[anchor]) return { view: SECTION_VIEWS[anchor], id: null };
  if (isQaAnchor(anchor)) return { view: 'qa', id: null, hash: `#${anchor}` };
  if (anchor.startsWith(VARIANTS_ANCHOR_PREFIX)) {
    const eventAnchor = strip(anchor, VARIANTS_ANCHOR_PREFIX);
    const name = index.eventNameByAnchor.get(eventAnchor);
    return name ? { view: 'events', id: name, hash: `#${anchor}` } : missing('events', 'event', strip(eventAnchor, 'event-'));
  }
  if (anchor.startsWith('events-')) return { view: 'events', id: null };
  if (anchor.startsWith('event-')) {
    const name = index.eventNameByAnchor.get(anchor);
    return name ? { view: 'events', id: name } : missing('events', 'event', strip(anchor, 'event-'));
  }
  if (anchor.startsWith('properties-')) return { view: 'properties', id: null };
  if (anchor.startsWith('property-')) {
    const slug = strip(anchor, 'property-');
    return index.propertyIdBySlug.has(slug) ? { view: 'properties', id: slug } : missing('properties', 'property', slug);
  }
  if (anchor.startsWith('use-cases-')) return { view: 'use-cases', id: null };
  if (anchor.startsWith('use-case-')) {
    const id = index.useCaseIdByAnchor.get(anchor);
    const pathId = id ? index.useCasePathIdById.get(id) : undefined;
    return pathId ? { view: 'use-cases', id: pathId } : missing('use-cases', 'use case', strip(anchor, 'use-case-'));
  }
  if (anchor.startsWith('consents-')) return { view: 'consents', id: null };
  if (anchor.startsWith('consent-')) {
    const slug = strip(anchor, 'consent-');
    return index.consentIdBySlug.has(slug) ? { view: 'consents', id: slug } : missing('consents', 'consent category', slug);
  }
  if (anchor.startsWith('catalog-')) {
    const slug = strip(anchor, 'catalog-');
    return index.catalogIdBySlug.has(slug) ? { view: 'catalogs', id: slug } : missing('catalogs', 'catalog', slug);
  }
  if (anchor.startsWith('mapping-')) {
    const slug = strip(anchor, 'mapping-');
    return index.mappingIndexBySlug.has(slug) ? { view: 'standard-events', id: slug } : missing('standard-events', 'standard event mapping', slug);
  }
  return null;
}

/**
 * The item a detail path names when this share does not have it (T-5-44): `/events/<name>` with
 * no such event, and so on. The portal then shows the list with a note instead of a dead page.
 * `null` when the item exists or the view has no items.
 */
export function missingDetail(view: PortalView, id: string | null, index: PortalIndex): MissingItem | null {
  if (!id) return null;
  switch (view) {
    case 'events':
      return index.eventIdByName.has(id) ? null : { kind: 'event', name: id };
    case 'properties':
      return index.propertyIdBySlug.has(id) ? null : { kind: 'property', name: id };
    case 'use-cases':
      return index.useCaseIdByPathId.has(id) ? null : { kind: 'use case', name: id };
    case 'identity':
      return index.identityRuleIds.has(id) ? null : { kind: 'identity rule', name: id };
    case 'catalogs':
      return index.catalogIdBySlug.has(id) ? null : { kind: 'catalog', name: id };
    case 'consents':
      return index.consentIdBySlug.has(id) ? null : { kind: 'consent category', name: id };
    case 'standard-events':
      return index.mappingIndexBySlug.has(id) ? null : { kind: 'standard event mapping', name: id };
    default:
      return null;
  }
}

/** Where a comment's target lives in the portal. The view's own comments control focuses the
 * comment from the kept hash. `null` when the entity is not in this share. */
export function commentTargetView(target: CommentLinkTarget, index: PortalIndex): PortalTarget | null {
  const { entityType, entityId } = target;
  switch (entityType) {
    case 'event': {
      const name = index.eventNameById.get(entityId);
      return name ? { view: 'events', id: name } : null;
    }
    case 'property':
    case 'property_definition': {
      const propertyId = entityType === 'property' ? entityId : index.propertyIdByDefinitionId.get(entityId);
      const slug = propertyId ? index.propertySlugById.get(propertyId) : undefined;
      return slug ? { view: 'properties', id: slug } : null;
    }
    case 'use_case':
    case 'requirement': {
      const useCaseId = entityType === 'use_case' ? entityId : index.useCaseIdByRequirementId.get(entityId);
      const pathId = useCaseId ? index.useCasePathIdById.get(useCaseId) : undefined;
      return pathId ? { view: 'use-cases', id: pathId } : null;
    }
    case 'identity_rule':
      return index.identityRuleIds.has(entityId) ? { view: 'identity', id: entityId } : null;
    case 'catalog': {
      const slug = index.catalogSlugById.get(entityId);
      return slug ? { view: 'catalogs', id: slug } : null;
    }
    case 'finding':
    case 'qa_report':
      return { view: 'qa', id: null };
    default:
      return null;
  }
}

interface LinkRow {
  id: string;
  parent_id: string | null;
  entity_type?: string;
  entity_id?: string;
  internal_only?: boolean;
}

/**
 * The state of the URL hash: nothing, an old anchor or a comment link that lands elsewhere, a
 * comment link whose thread is not visible here, or a malformed comment link. Comment links resolve
 * only against visible, non-internal comments and entities of this share, so a private or removed
 * target never opens anything.
 */
export type HashResolution =
  | { kind: 'none' }
  | { kind: 'target'; target: PortalTarget }
  | { kind: 'comment'; target: PortalTarget; link: CommentLinkTarget }
  | { kind: 'comment-unavailable' }
  | { kind: 'comment-invalid' };

export function resolveHash(hash: string, index: PortalIndex, comments: readonly LinkRow[]): HashResolution {
  const link = parseCommentLink(hash);
  if (link.kind === 'invalid') return { kind: 'comment-invalid' };
  if (link.kind === 'target') {
    const visible = comments.filter((c) => !c.internal_only);
    const view = resolveCommentTarget(visible, link.target) ? commentTargetView(link.target, index) : null;
    return view ? { kind: 'comment', target: { ...view, hash: hash.startsWith('#') ? hash : `#${hash}` }, link: link.target } : { kind: 'comment-unavailable' };
  }
  const target = legacyAnchorTarget(decodeAnchor(hash), index);
  return target ? { kind: 'target', target } : { kind: 'none' };
}

/** True when `target` is already on screen at `view`/`id`, so no redirect is needed. */
export function sameTarget(target: PortalTarget, view: PortalView, id: string | null): boolean {
  return target.view === view && (target.id ?? null) === (id ?? null);
}

/**
 * Finding-table navigation for a QA anchor: `findings` (the table), `findings-<comparison>` (one
 * comparison), `findings-<comparison>-<event anchor>` or `-project` (one event, or the findings tied
 * to no event), `current-finding-<id>` (one finding). `null` for anything else.
 */
export function findingNavigationForAnchor(
  anchor: string,
  comparisons: readonly string[],
  eventIdByAnchor: ReadonlyMap<string, string>,
  revision: number
): FindingNavigation | null {
  if (anchor === 'findings' || anchor === 'current-findings-table') return { revision };
  if (anchor.startsWith('current-finding-')) return { revision, findingId: strip(anchor, 'current-finding-') };
  if (!anchor.startsWith('findings-')) return null;
  // Longest comparison first: one comparison name may prefix another.
  for (const comparison of [...comparisons].sort((a, b) => b.length - a.length)) {
    const group = `findings-${comparison}`;
    if (anchor === group) return { revision, comparison };
    if (anchor.startsWith(`${group}-`)) {
      const rest = strip(anchor, `${group}-`);
      const eventId = rest === 'project' ? PROJECT_FINDINGS : eventIdByAnchor.get(rest);
      return eventId ? { revision, comparison, eventId } : { revision, comparison };
    }
  }
  return null;
}

/** Path id (and view) for a cross-reference by anchor, the shape `resolveReference` and
 * `findingEntity` produce (`#event-…`, `#property-…`, `#variants-event-…`, `#catalog-…`,
 * `#consent-…`). */
export function targetForAnchorHref(href: string, index: PortalIndex): PortalTarget | null {
  return legacyAnchorTarget(decodeAnchor(href), index);
}
