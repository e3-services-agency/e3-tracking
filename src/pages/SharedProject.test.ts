/**
 * `SharedProject`'s view-model builder (T-4-03, D-50): no `@testing-library/react` in this repo
 * (D-20 uses plain-Node vitest, no jsdom), so this tests the pure functions the component calls
 * instead of rendering it -- event ordering and the file-path resolver, the two things the plan's
 * acceptance criteria call out.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSharedViewModel, sharedFileUrl, eventAnchor, eventForHash, selectCodegenTab, isEmptyValue, derivedMetricsText,
  eventCardVisibility, oneLineDescription, sectionPresence, buildSectionIndex, filterNav, flattenNav, pickActiveId, lightboxStep,
} from './sharedViewModel';
import type { TrackingDocument } from '../domain/document/trackingDocument';

function emptyEventCard(overrides: Partial<TrackingDocument['events'][number]>): TrackingDocument['events'][number] {
  return {
    id: 'id',
    name: 'event',
    business_name: null,
    class: 'custom',
    description: null,
    purpose: null,
    page: null,
    trigger: null,
    grain: null,
    identity_note: null,
    owners: { business: null, technical: null },
    priority: null,
    status: 'planned',
    certification: { applicable: true, certified: false, reasons: [] },
    expiration: { effective: null, source: null },
    properties: [],
    variants: [],
    standard_event_mappings: [],
    contexts: [],
    triggers: [],
    coverage: { rows: [], columns: [], observed_count: 0, unobserved_count: 0 },
    rules: [],
    derived_metrics: null,
    not_suitable_for: null,
    use_cases: [],
    freshness: { last_observation_at: null, observation_count: 0 },
    quality: { open: { error: 0, warning: 0, info: 0 }, acknowledged: { error: 0, warning: 0, info: 0 }, by_comparison: {} },
    findings: [],
    agent_instructions: null,
    codegen: { gtm: '', web_sdk: '', tracking_api: '' },
    sdk_default_properties: [],
    ...overrides,
  };
}

describe('buildSharedViewModel', () => {
  it('splits events into custom (first, per D-34 ordering) and sdk/platform, preserving order within each group', () => {
    const sdkEvent = emptyEventCard({ id: 'sdk-1', name: 'session_start', class: 'sdk' });
    const customA = emptyEventCard({ id: 'custom-a', name: 'cart_update', class: 'custom' });
    const customB = emptyEventCard({ id: 'custom-b', name: 'purchase', class: 'custom' });
    const platformEvent = emptyEventCard({ id: 'platform-1', name: 'consent', class: 'platform' });

    // `doc.events` is already custom-first by contract (D-34); feed it in that order, as the real
    // route response would, and assert the split preserves it rather than re-sorting.
    const doc = { events: [customA, customB, sdkEvent, platformEvent] } as unknown as TrackingDocument;

    const model = buildSharedViewModel(doc);
    expect(model.customEvents.map((e) => e.id)).toEqual(['custom-a', 'custom-b']);
    expect(model.otherEvents.map((e) => e.id)).toEqual(['sdk-1', 'platform-1']);
  });

  it('handles an all-custom or all-sdk/platform document without error', () => {
    const doc = { events: [emptyEventCard({ id: 'only', class: 'custom' })] } as unknown as TrackingDocument;
    const model = buildSharedViewModel(doc);
    expect(model.customEvents).toHaveLength(1);
    expect(model.otherEvents).toHaveLength(0);
  });
});

describe('sharedFileUrl', () => {
  it('resolves a trigger image_path through this token\'s public file route, not the internal one', () => {
    const url = sharedFileUrl('abc123', 'proj-id/event_trigger/screenshot.png');
    expect(url).toContain('/api/shared/abc123/files/proj-id/event_trigger/screenshot.png');
    expect(url).not.toContain('/api/projects/');
  });

  it('encodes the token but not the path segments', () => {
    const url = sharedFileUrl('has space', 'proj/kind/file.png');
    expect(url).toContain('/api/shared/has%20space/files/proj/kind/file.png');
  });
});

describe('T-4-14 view helpers', () => {
  const ev = (name: string, cls = 'custom') => ({ name, class: cls });
  const baseDoc = {
    events: [ev('purchase'), ev('cart update'), ev('session_start', 'sdk'), ev('consent', 'platform')],
    properties: [1],
    use_cases: [],
    identity_rules: [],
    consent_categories: [1],
    catalogs: [],
    standard_event_mappings: [1],
    findings_summary: { open: { error: 0, warning: 0, info: 0 } },
  };

  it('eventAnchor slugs the name and is stable', () => {
    expect(eventAnchor('purchase')).toBe('event-purchase');
    expect(eventAnchor('cart update / v2')).toBe('event-cart-update-v2');
    expect(eventAnchor('Cart_Update')).toBe('event-Cart_Update');
    expect(eventAnchor('  ')).toBe('event-unnamed');
  });

  it('eventForHash resolves a hash to its event, also percent-encoded, and ignores others', () => {
    const events = [ev('purchase'), ev('cart update')];
    expect(eventForHash('#event-purchase', events)?.name).toBe('purchase');
    expect(eventForHash('event-cart-update', events)?.name).toBe('cart update');
    expect(eventForHash('#event-nope', events)).toBeNull();
    expect(eventForHash('#use-cases', events)).toBeNull();
    expect(eventForHash('#event-%E0%A4%A', events)).toBeNull();
  });

  it('selectCodegenTab defaults to GTM and falls back to the first tab with code', () => {
    expect(selectCodegenTab({ gtm: 'a', web_sdk: 'b', tracking_api: 'c' })).toBe('gtm');
    expect(selectCodegenTab({ gtm: '  ', web_sdk: 'b', tracking_api: 'c' })).toBe('web_sdk');
    expect(selectCodegenTab({ gtm: '', web_sdk: '', tracking_api: 'c' })).toBe('tracking_api');
    expect(selectCodegenTab({})).toBe('gtm');
    expect(selectCodegenTab({ gtm: 'a', web_sdk: 'b' }, 'web_sdk')).toBe('web_sdk');
  });

  it('isEmptyValue and derivedMetricsText treat [] and {} as empty', () => {
    for (const v of [null, undefined, '', '  ', [], {}]) expect(isEmptyValue(v)).toBe(true);
    for (const v of [0, false, 'x', [1], { a: 1 }]) expect(isEmptyValue(v)).toBe(false);
    expect(derivedMetricsText([])).toBe('\u2014');
    expect(derivedMetricsText(['a', 'b'])).toBe('a, b');
    expect(derivedMetricsText({ a: 1 })).toBe('{"a":1}');
  });

  it('eventCardVisibility flags each empty optional block', () => {
    const empty = eventCardVisibility({
      rules: [], derived_metrics: [], not_suitable_for: null, use_cases: [], variants: [],
      standard_event_mappings: [], contexts: [], sdk_default_properties: [],
    });
    expect(Object.values(empty).every((v) => v === false)).toBe(true);
    const full = eventCardVisibility({
      rules: [1], derived_metrics: ['x'], not_suitable_for: 'y', use_cases: [1], variants: [1],
      standard_event_mappings: [1], contexts: [1], sdk_default_properties: [1],
    });
    expect(Object.values(full).every((v) => v === true)).toBe(true);
  });

  it('oneLineDescription collapses whitespace and truncates', () => {
    expect(oneLineDescription('a\n  b')).toBe('a b');
    expect(oneLineDescription(null)).toBe('');
    expect(oneLineDescription('x'.repeat(50), 10)).toHaveLength(10);
    expect(oneLineDescription('x'.repeat(50), 10).endsWith('\u2026')).toBe(true);
  });

  it('sectionPresence and buildSectionIndex omit empty sections and group events by class', () => {
    expect(sectionPresence(baseDoc)).toMatchObject({ useCases: false, identity: false, catalogs: false, findings: false, consents: true, mapping: true });
    const nav = buildSectionIndex(baseDoc);
    expect(nav.map((n) => n.id)).toEqual(['events', 'properties', 'consents', 'mapping']);
    const groups = nav[0].children!;
    expect(groups.map((g) => g.id)).toEqual(['events-custom', 'events-sdk', 'events-platform']);
    expect(groups[0].children!.map((c) => c.id)).toEqual(['event-purchase', 'event-cart-update']);
    const withFindings = buildSectionIndex({ ...baseDoc, findings_summary: { open: { error: 1, warning: 0, info: 0 } } });
    expect(withFindings.at(-1)?.id).toBe('findings');
  });

  it('buildSectionIndex skips an empty event class group', () => {
    const nav = buildSectionIndex({ ...baseDoc, events: [ev('a'), ev('b', 'platform')] });
    expect(nav[0].children!.map((g) => g.id)).toEqual(['events-custom', 'events-platform']);
  });

  it('filterNav keeps matching leaves with their ancestors, and whole subtrees on a parent match', () => {
    const nav = buildSectionIndex(baseDoc);
    expect(filterNav(nav, '')).toBe(nav);
    const f = filterNav(nav, 'CART');
    expect(f).toHaveLength(1);
    expect(f[0].children![0].children!.map((c) => c.label)).toEqual(['cart update']);
    const parent = filterNav(nav, 'sdk events');
    expect(parent[0].children!.map((g) => g.id)).toEqual(['events-sdk']);
    expect(filterNav(nav, 'zzz')).toEqual([]);
  });

  it('flattenNav is document order with depth; pickActiveId takes the first visible', () => {
    const flat = flattenNav(buildSectionIndex(baseDoc));
    expect(flat[0]).toEqual({ id: 'events', label: 'Events (4)', depth: 0 });
    expect(flat[2]).toMatchObject({ id: 'event-purchase', depth: 2 });
    const ids = flat.map((f) => f.id);
    expect(pickActiveId(ids, new Set(['event-cart-update', 'event-purchase']))).toBe('event-purchase');
    expect(pickActiveId(ids, new Set())).toBeNull();
  });

  it('lightboxStep wraps in both directions', () => {
    expect(lightboxStep(0, -1, 3)).toBe(2);
    expect(lightboxStep(2, 1, 3)).toBe(0);
    expect(lightboxStep(1, 1, 3)).toBe(2);
    expect(lightboxStep(0, 1, 0)).toBe(0);
  });
});
