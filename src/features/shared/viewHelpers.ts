/**
 * Pure helpers behind the shared documentation view and the event card renderer (T-4-14, D-50).
 * Relative imports only (no `@/` alias) so they are importable from a plain-Node vitest test
 * (D-20); re-exported by `src/pages/sharedViewModel.ts`.
 */

import {
  groupPropertiesByCategory,
  propertyGroupId,
  propertyKindGroupId,
  type PropertyCategory,
} from '../../domain/propertyCategory';
import { USE_CASE_TYPES, type PropertyKind } from '../../domain/enums';
import { CONSENT_CHANNELS, CONSENT_CHANNEL_LABELS, consentChannel } from '../../domain/consentChannel';
import { mappingHeading } from '../../domain/document/standardMappings';
import { computeFindingsSummary, type ComparisonFindingsGroup } from '../../domain/document/findingsSummary';
import { comparisonLabel } from '../../domain/findingsCatalog';

/** DOM id (and URL hash, without `#`) of an event: `event-<name>`; characters outside
 * `[A-Za-z0-9_.-]` become `-`. Stable across reloads because it derives from the name only. */
export function eventAnchor(name: string): string {
  const slug = name.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `event-${slug || 'unnamed'}`;
}

/** Unique anchors for a list of names, in order: a name whose slug is already taken gets `-2`, `-3`, ...
 * so "ab test" / "ab-test" / "Kauf ä" / "Kauf ö" never share a DOM id. */
export function eventAnchors(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const base = eventAnchor(name);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  });
}

/** DOM id of an event card's Variants block: `variants-event-<slug>` (T-4-24). */
export function variantsAnchor(eventName: string): string {
  return `variants-${eventAnchor(eventName)}`;
}

/** Finds the event a URL hash (`#event-purchase`, with or without the `#`, possibly percent-encoded)
 * points at, or `null`. */
export function eventForHash<T extends { name: string }>(hash: string, events: T[]): T | null {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  if (!raw.startsWith('event-')) return null;
  const anchors = eventAnchors(events.map((e) => e.name));
  const i = anchors.indexOf(raw);
  return i >= 0 ? events[i] : null;
}

/** True for `null`, `undefined`, blank strings, empty arrays and empty objects. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export interface EventCardEmptiness {
  rules: unknown[];
  derived_metrics: unknown;
  not_suitable_for: string | null;
  use_cases: unknown[];
  variants: unknown[];
  standard_event_mappings: unknown[];
  contexts: unknown[];
  sdk_default_properties: unknown[];
}

/** Which optional blocks of an event card have something to show; the client view hides the rest. */
export function eventCardVisibility(card: EventCardEmptiness) {
  return {
    rules: card.rules.length > 0,
    derivedMetrics: !isEmptyValue(card.derived_metrics),
    notSuitableFor: !isEmptyValue(card.not_suitable_for),
    useCases: card.use_cases.length > 0,
    variants: card.variants.length > 0,
    standardEventMappings: card.standard_event_mappings.length > 0,
    contexts: card.contexts.length > 0,
    sdkDefaultProperties: card.sdk_default_properties.length > 0,
  };
}

/** Human display of `derived_metrics`: a list of strings joins, anything else is JSON; empty is a dash. */
export function derivedMetricsText(value: unknown): string {
  if (isEmptyValue(value)) return '—';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.join(', ');
  return JSON.stringify(value);
}

/** One-line description for a collapsed row (whitespace collapsed, cut with an ellipsis). */
export function oneLineDescription(text: string | null | undefined, max = 140): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export interface NavItem {
  /** DOM id of the target element (also the URL hash). */
  id: string;
  label: string;
  children?: NavItem[];
}

/** A property as the shared Properties section lists it: customer-scope from `properties[]` or
 * event-scope from `event_properties[]` (D-64), both already carrying their `category`. */
export interface SharedPropertyInput {
  category: PropertyCategory;
  kind?: PropertyKind | null;
  name: string;
}

/** The Properties section's groups (System customer / Customer / SDK default / Event, Event split
 * by kind) over the customer and event property lists; one decision for the page, the nav and the
 * rendered-id list. */
export function sharedPropertyGroups<T extends SharedPropertyInput, U extends SharedPropertyInput = T>(doc: {
  properties: readonly T[];
  event_properties?: readonly U[];
}) {
  return groupPropertiesByCategory<T | U>([...doc.properties, ...(doc.event_properties ?? [])]);
}

export interface NavDocInput {
  events: {
    id?: string;
    name: string;
    class: string;
    quality?: { acknowledged: { error: number; warning: number; info: number } };
    /** T-4-21: open findings, for the Findings groups; absent means none. */
    findings?: { severity: string; comparison: string; kind?: string }[];
  }[];
  unattached_findings?: { severity: string; comparison: string; kind?: string }[];
  properties: unknown[];
  /** D-64: event-scope properties; absent in a document from before T-4-20. */
  event_properties?: unknown[];
  use_cases: { id?: string; name?: string; code?: string | null; type?: string | null }[];
  identity_rules: unknown[];
  consent_categories: { name: string; standard_key?: string | null }[];
  catalogs: unknown[];
  standard_event_mappings: { standard_event?: string; event_name?: string | null; variant_name?: string | null }[];
  findings_summary: { open: { error: number; warning: number; info: number } };
}

export const EVENT_CLASS_GROUPS: { cls: 'custom' | 'sdk' | 'platform'; label: string }[] = [
  { cls: 'custom', label: 'Custom events' },
  { cls: 'sdk', label: 'SDK events' },
  { cls: 'platform', label: 'Platform events' },
];

/** DOM ids of the top-level sections; the nav index and the rendered `<section id>` both use these. */
export const SECTION_IDS = {
  events: 'events',
  properties: 'properties',
  useCases: 'use-cases',
  identity: 'identity',
  consents: 'consents',
  catalogs: 'catalogs',
  mapping: 'mapping',
  findings: 'findings',
} as const;

/** DOM id of an event class group inside the Events section. */
export function eventGroupId(cls: string): string {
  return `events-${cls}`;
}

/** Unique DOM ids `<prefix>-<slug>` for a list of labels, in order (a taken slug gets -2, -3, ...). */
export function slugAnchors(prefix: string, labels: string[]): string[] {
  const taken = new Set<string>();
  return labels.map((label) => {
    const slug = label.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
    const base = `${prefix}-${slug}`;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  });
}

export const USE_CASE_TYPE_LABELS: Record<string, string> = { marketing: 'Marketing', transactional: 'Transactional', other: 'Other' };

/** Groups of the Use cases, Consents, Mapping and Findings sections (T-4-21): one decision shared
 * by the page, the nav and the rendered-id list. Empty groups are dropped. */
export function sharedSectionGroups(doc: NavDocInput) {
  // Use cases by their `type` (marketing | transactional; anything else lands in Other).
  const ucIds = slugAnchors('use-case', doc.use_cases.map((u) => u.code || u.name || u.id || 'use-case'));
  const known = USE_CASE_TYPES as readonly string[];
  const useCaseGroups = [...USE_CASE_TYPES, 'other' as const]
    .map((type) => ({
      type: type as string,
      id: `use-cases-${type}`,
      label: USE_CASE_TYPE_LABELS[type],
      items: doc.use_cases
        .map((uc, i) => ({ uc, id: ucIds[i], index: i }))
        .filter(({ uc }) => (known.includes(uc.type ?? '') ? uc.type === type : type === 'other')),
    }))
    .filter((g) => g.items.length > 0);

  // Consents by derived channel (`consentChannel`).
  const consentIds = slugAnchors('consent', doc.consent_categories.map((c) => c.name));
  const consentGroups = CONSENT_CHANNELS.map((channel) => ({
    channel,
    id: `consents-${channel}`,
    label: CONSENT_CHANNEL_LABELS[channel],
    items: doc.consent_categories.map((c, i) => ({ category: c, id: consentIds[i], index: i })).filter(({ category }) => consentChannel(category) === channel),
  })).filter((g) => g.items.length > 0);

  // Mapping: one leaf per standard event mapping.
  const mappingLabels = doc.standard_event_mappings.map((m) => mappingHeading(m.standard_event ?? '', m.event_name ?? null, m.variant_name ?? null));
  const mappingIds = slugAnchors('mapping', mappingLabels);
  const mappingLeaves = doc.standard_event_mappings.map((mapping, i) => ({ mapping, id: mappingIds[i], label: mappingLabels[i], index: i }));

  // Findings: one group per comparison, leaves = affected events (linking to their cards).
  const eventAnchorList = eventAnchors(doc.events.map((e) => e.name));
  const anchorByEventId = new Map<string, string>();
  doc.events.forEach((e, i) => {
    if (e.id) anchorByEventId.set(e.id, eventAnchorList[i]);
  });
  const summary = computeFindingsSummary(
    doc.events.map((e) => ({
      id: e.id ?? e.name,
      name: e.name,
      findings: e.findings ?? [],
      quality: e.quality ?? { acknowledged: { error: 0, warning: 0, info: 0 } },
    })),
    doc.unattached_findings ?? []
  );
  const findingGroups = summary.byComparisonEvents.map((g: ComparisonFindingsGroup) => {
    const id = `findings-${g.comparison}`;
    const leaves: { id: string; label: string; count: number; cardAnchor: string | null }[] = g.events.map((e) => ({
      id: `${id}-${anchorByEventId.get(e.id) ?? e.id}`,
      label: e.name,
      count: e.count,
      cardAnchor: anchorByEventId.get(e.id) ?? null,
    }));
    if (g.unattached > 0) leaves.push({ id: `${id}-project`, label: 'Not tied to an event', count: g.unattached, cardAnchor: null });
    return { comparison: g.comparison, id, label: comparisonLabel(g.comparison), total: g.total, leaves };
  });

  return { useCaseGroups, consentGroups, mappingLeaves, findingGroups, summary };
}

/** Which top-level document sections have content; an empty one is not rendered or listed. */
export function sectionPresence(doc: NavDocInput) {
  const open = doc.findings_summary.open;
  const acknowledgedTotal = doc.events.reduce(
    (n, e) => n + (e.quality ? e.quality.acknowledged.error + e.quality.acknowledged.warning + e.quality.acknowledged.info : 0),
    0
  );
  return {
    events: doc.events.length > 0,
    properties: doc.properties.length + (doc.event_properties?.length ?? 0) > 0,
    useCases: doc.use_cases.length > 0,
    identity: doc.identity_rules.length > 0,
    consents: doc.consent_categories.length > 0,
    catalogs: doc.catalogs.length > 0,
    mapping: doc.standard_event_mappings.length > 0,
    // Open or acknowledged findings: same condition as the HTML export's Findings summary (T-4-19).
    findings: open.error + open.warning + open.info + acknowledgedTotal > 0,
  };
}

/** Left navigation tree: Events (grouped by class, event names as leaves) then the non-empty sections. */
export function buildSectionIndex(doc: NavDocInput): NavItem[] {
  const present = sectionPresence(doc);
  const items: NavItem[] = [];
  if (present.events) {
    const anchorList = eventAnchors(doc.events.map((e) => e.name));
    const anchorByEvent = new Map(doc.events.map((e, i) => [e, anchorList[i]]));
    const groups: NavItem[] = [];
    for (const { cls, label } of EVENT_CLASS_GROUPS) {
      const inGroup = doc.events.filter((e) => e.class === cls);
      if (inGroup.length === 0) continue;
      groups.push({
        id: eventGroupId(cls),
        label: `${label} (${inGroup.length})`,
        children: inGroup.map((e) => ({ id: anchorByEvent.get(e) as string, label: e.name })),
      });
    }
    items.push({ id: SECTION_IDS.events, label: `Events (${doc.events.length})`, children: groups });
  }
  if (present.properties) {
    const groups = sharedPropertyGroups(doc as unknown as { properties: SharedPropertyInput[]; event_properties?: SharedPropertyInput[] });
    const total = doc.properties.length + (doc.event_properties?.length ?? 0);
    items.push({
      id: SECTION_IDS.properties,
      label: 'Properties (' + total + ')',
      children: groups.map((g) => ({
        id: propertyGroupId(g.category),
        label: g.label + ' (' + g.items.length + ')',
        children: g.subgroups.length > 0 ? g.subgroups.map((s) => ({ id: propertyKindGroupId(s.kind), label: s.label + ' (' + s.items.length + ')' })) : undefined,
      })),
    });
  }
  const groups = sharedSectionGroups(doc);
  if (present.useCases) {
    items.push({
      id: SECTION_IDS.useCases,
      label: `Use cases (${doc.use_cases.length})`,
      children: groups.useCaseGroups.map((g) => ({
        id: g.id,
        label: `${g.label} (${g.items.length})`,
        children: g.items.map(({ uc, id }) => ({ id, label: uc.code ? `${uc.code} — ${uc.name ?? ''}` : (uc.name ?? id) })),
      })),
    });
  }
  if (present.identity) items.push({ id: SECTION_IDS.identity, label: 'Identity' });
  if (present.consents) {
    items.push({
      id: SECTION_IDS.consents,
      label: `Consents (${doc.consent_categories.length})`,
      children: groups.consentGroups.map((g) => ({
        id: g.id,
        label: `${g.label} (${g.items.length})`,
        children: g.items.map(({ category, id }) => ({ id, label: category.name })),
      })),
    });
  }
  if (present.catalogs) items.push({ id: SECTION_IDS.catalogs, label: 'Catalogs' });
  if (present.mapping) {
    items.push({
      id: SECTION_IDS.mapping,
      label: `Mapping (${doc.standard_event_mappings.length})`,
      children: groups.mappingLeaves.map((l) => ({ id: l.id, label: l.label })),
    });
  }
  if (present.findings) {
    items.push({
      id: SECTION_IDS.findings,
      label: 'Findings',
      children: groups.findingGroups.map((g) => ({
        id: g.id,
        label: `${g.label} (${g.total})`,
        children: g.leaves.map((l) => ({ id: l.id, label: `${l.label} (${l.count})` })),
      })),
    });
  }
  return items;
}

/** Every DOM id the shared page renders as a navigation target, in document order: the same
 * decisions (`sectionPresence`, `EVENT_CLASS_GROUPS`, `eventAnchors`) the page uses to render. */
export function renderedSectionIds(doc: NavDocInput): string[] {
  const present = sectionPresence(doc);
  const groups = sharedSectionGroups(doc);
  const ids: string[] = [];
  if (present.events) {
    ids.push(SECTION_IDS.events);
    const anchors = eventAnchors(doc.events.map((e) => e.name));
    for (const { cls } of EVENT_CLASS_GROUPS) {
      const idx = doc.events.map((e, i) => (e.class === cls ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) continue;
      ids.push(eventGroupId(cls), ...idx.map((i) => anchors[i]));
    }
  }
  for (const key of ['properties', 'useCases', 'identity', 'consents', 'catalogs', 'mapping', 'findings'] as const) {
    if (!present[key]) continue;
    ids.push(SECTION_IDS[key]);
    if (key === 'properties') {
      for (const g of sharedPropertyGroups(doc as unknown as { properties: SharedPropertyInput[]; event_properties?: SharedPropertyInput[] })) {
        ids.push(propertyGroupId(g.category), ...g.subgroups.map((s) => propertyKindGroupId(s.kind)));
      }
    }
    if (key === 'useCases') for (const g of groups.useCaseGroups) ids.push(g.id, ...g.items.map((i) => i.id));
    if (key === 'consents') for (const g of groups.consentGroups) ids.push(g.id, ...g.items.map((i) => i.id));
    if (key === 'mapping') ids.push(...groups.mappingLeaves.map((l) => l.id));
    if (key === 'findings') for (const g of groups.findingGroups) ids.push(g.id, ...g.leaves.map((l) => l.id));
  }
  return ids;
}

/** Returns a new set with `id` added when absent, removed when present (group collapse state). */
export function toggleInSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** When the page is scrolled to its very end the last sections can never reach the scroll-spy band;
 * then the active entry is the last one whose top is inside the viewport. `tops` are viewport-relative. */
export function pickActiveAtBottom(orderedIds: string[], tops: ReadonlyMap<string, number>, viewportHeight: number): string | null {
  let found: string | null = null;
  for (const id of orderedIds) {
    const top = tops.get(id);
    if (top !== undefined && top < viewportHeight) found = id;
  }
  return found;
}

/** Case-insensitive filter: keeps an item when its label matches (with all its children) or when a
 * descendant matches (with only the matching descendants). Empty query returns the tree unchanged. */
export function filterNav(items: NavItem[], query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const walk = (list: NavItem[]): NavItem[] => {
    const out: NavItem[] = [];
    for (const item of list) {
      if (item.label.toLowerCase().includes(q)) {
        out.push(item);
        continue;
      }
      const kids = item.children ? walk(item.children) : [];
      if (kids.length > 0) out.push({ ...item, children: kids });
    }
    return out;
  };
  return walk(items);
}

/** Depth-first flat list (document order) of every nav entry, with its depth. */
export function flattenNav(items: NavItem[], depth = 0): { id: string; label: string; depth: number }[] {
  return items.flatMap((item) => [
    { id: item.id, label: item.label, depth },
    ...(item.children ? flattenNav(item.children, depth + 1) : []),
  ]);
}

/** The nav entry to highlight: the first id, in document order, currently intersecting the viewport. */
export function pickActiveId(orderedIds: string[], visible: ReadonlySet<string>): string | null {
  return orderedIds.find((id) => visible.has(id)) ?? null;
}

/** New scrollTop for a scroll container so an item (top and height measured inside the container
 * content) is visible; unchanged when it already is. Used instead of scrollIntoView, which also
 * scrolls the window. */
export function scrollTopToReveal(scrollTop: number, viewHeight: number, itemTop: number, itemHeight: number): number {
  if (itemTop < scrollTop) return Math.max(0, itemTop);
  if (itemTop + itemHeight > scrollTop + viewHeight) return Math.max(0, itemTop + itemHeight - viewHeight);
  return scrollTop;
}

/** Wrap-around step through a gallery of `length` images. */
export function lightboxStep(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** Sticky stack (T-4-18): the page header (Tailwind `h-14`) plus one shared offset for every
 * section, group and event-title header. They all stick at the same offset and hand over to each
 * other by z-order (event title over group header over section header), so nothing ever stacks. */
export const STICKY_PX = { pageHeader: 56, sectionHeader: 40, groupHeader: 32 } as const;

/** `scroll-margin-top` for an anchor target, so it lands below the sticky headers that cover its
 * position: sections and groups start with their own sticky header (page header only); an event
 * sits below its group header, which stays visible while the event is collapsed. */
export function stickyScrollMarginPx(kind: 'section' | 'group' | 'event'): number {
  return kind === 'event' ? STICKY_PX.pageHeader + STICKY_PX.groupHeader : STICKY_PX.pageHeader;
}

/** Top of the scroll-spy band: just below the deepest sticky stack (an event under its group header). */
export function spyTopOffsetPx(): number {
  return stickyScrollMarginPx('event') + 4;
}

/** New set with every id in `ids` added (`expanded`) or removed; `current` is not mutated. Used by
 * the global and per-section Expand all / Collapse all buttons. */
export function setExpanded(current: ReadonlySet<string>, ids: readonly string[], expanded: boolean): Set<string> {
  const next = new Set(current);
  for (const id of ids) {
    if (expanded) next.add(id);
    else next.delete(id);
  }
  return next;
}
