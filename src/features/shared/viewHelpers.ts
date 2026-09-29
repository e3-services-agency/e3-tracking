/**
 * Pure helpers behind the shared documentation view and the event card renderer (T-4-14, D-50).
 * Relative imports only (no `@/` alias) so they are importable from a plain-Node vitest test
 * (D-20); re-exported by `src/pages/sharedViewModel.ts`.
 */

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

export interface NavDocInput {
  events: { name: string; class: string }[];
  properties: unknown[];
  use_cases: unknown[];
  identity_rules: unknown[];
  consent_categories: unknown[];
  catalogs: unknown[];
  standard_event_mappings: unknown[];
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

/** Which top-level document sections have content; an empty one is not rendered or listed. */
export function sectionPresence(doc: NavDocInput) {
  const open = doc.findings_summary.open;
  return {
    events: doc.events.length > 0,
    properties: doc.properties.length > 0,
    useCases: doc.use_cases.length > 0,
    identity: doc.identity_rules.length > 0,
    consents: doc.consent_categories.length > 0,
    catalogs: doc.catalogs.length > 0,
    mapping: doc.standard_event_mappings.length > 0,
    findings: open.error + open.warning + open.info > 0,
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
  if (present.properties) items.push({ id: SECTION_IDS.properties, label: 'Properties' });
  if (present.useCases) items.push({ id: SECTION_IDS.useCases, label: 'Use cases' });
  if (present.identity) items.push({ id: SECTION_IDS.identity, label: 'Identity' });
  if (present.consents) items.push({ id: SECTION_IDS.consents, label: 'Consents' });
  if (present.catalogs) items.push({ id: SECTION_IDS.catalogs, label: 'Catalogs' });
  if (present.mapping) items.push({ id: SECTION_IDS.mapping, label: 'Mapping' });
  if (present.findings) items.push({ id: SECTION_IDS.findings, label: 'Findings' });
  return items;
}

/** Every DOM id the shared page renders as a navigation target, in document order: the same
 * decisions (`sectionPresence`, `EVENT_CLASS_GROUPS`, `eventAnchors`) the page uses to render. */
export function renderedSectionIds(doc: NavDocInput): string[] {
  const present = sectionPresence(doc);
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
    if (present[key]) ids.push(SECTION_IDS[key]);
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
