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
  return events.find((e) => eventAnchor(e.name) === raw) ?? null;
}

export type CodegenTabKey = 'gtm' | 'web_sdk' | 'tracking_api';

export const CODEGEN_TABS: { key: CodegenTabKey; label: string; language: 'javascript' | 'json' | 'typescript' }[] = [
  { key: 'gtm', label: 'GTM / dataLayer', language: 'javascript' },
  { key: 'web_sdk', label: 'Web SDK', language: 'javascript' },
  { key: 'tracking_api', label: 'Tracking API', language: 'typescript' },
];

/** Default implementation method until a project-level method exists (D-62 pending). */
export const DEFAULT_CODEGEN_TAB: CodegenTabKey = 'gtm';

/** The tab to show first: `preferred` when it has code, else the first tab that does, else `preferred`. */
export function selectCodegenTab(
  codegen: Partial<Record<CodegenTabKey, string>>,
  preferred: CodegenTabKey = DEFAULT_CODEGEN_TAB
): CodegenTabKey {
  if ((codegen[preferred] ?? '').trim()) return preferred;
  const firstWithCode = CODEGEN_TABS.find((t) => (codegen[t.key] ?? '').trim());
  return firstWithCode ? firstWithCode.key : preferred;
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
    const groups: NavItem[] = [];
    for (const { cls, label } of EVENT_CLASS_GROUPS) {
      const inGroup = doc.events.filter((e) => e.class === cls);
      if (inGroup.length === 0) continue;
      groups.push({
        id: `events-${cls}`,
        label: `${label} (${inGroup.length})`,
        children: inGroup.map((e) => ({ id: eventAnchor(e.name), label: e.name })),
      });
    }
    items.push({ id: 'events', label: `Events (${doc.events.length})`, children: groups });
  }
  if (present.properties) items.push({ id: 'properties', label: 'Properties' });
  if (present.useCases) items.push({ id: 'use-cases', label: 'Use cases' });
  if (present.identity) items.push({ id: 'identity', label: 'Identity' });
  if (present.consents) items.push({ id: 'consents', label: 'Consents' });
  if (present.catalogs) items.push({ id: 'catalogs', label: 'Catalogs' });
  if (present.mapping) items.push({ id: 'mapping', label: 'Mapping' });
  if (present.findings) items.push({ id: 'findings', label: 'Findings' });
  return items;
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

/** Wrap-around step through a gallery of `length` images. */
export function lightboxStep(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
