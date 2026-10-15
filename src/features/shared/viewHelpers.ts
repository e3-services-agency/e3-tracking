/**
 * Pure helpers behind the shared documentation view and the event card renderer (T-4-14, D-50).
 * Relative imports only (no `@/` alias) so they are importable from a plain-Node vitest test
 * (D-20); re-exported by `src/pages/sharedViewModel.ts`.
 */

import { USE_CASE_TYPES } from '../../domain/enums';
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
  identifiers?: unknown[];
  consent_categories: { name: string; standard_key?: string | null }[];
  catalogs: unknown[];
  standard_event_mappings: { standard_event?: string; event_name?: string | null; variant_name?: string | null }[];
  findings_summary: { open: { error: number; warning: number; info: number } };
}

/** Ids of the single page's sections (T-4-14); old links still carry them (T-5-42 redirects them). */
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
    identity: doc.identity_rules.length > 0 || (doc.identifiers?.length ?? 0) > 0,
    consents: doc.consent_categories.length > 0,
    catalogs: doc.catalogs.length > 0,
    mapping: doc.standard_event_mappings.length > 0,
    // Open or acknowledged findings: same condition as the HTML export's Findings summary (T-4-19).
    findings: open.error + open.warning + open.info + acknowledgedTotal > 0,
  };
}

/** Returns a new set with `id` added when absent, removed when present (group collapse state). */
export function toggleInSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
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
