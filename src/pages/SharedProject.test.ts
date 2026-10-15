/**
 * `SharedProject`'s view-model builder (T-4-03, D-50): no `@testing-library/react` in this repo
 * (D-20 uses plain-Node vitest, no jsdom), so this tests the pure functions the component calls
 * instead of rendering it -- event ordering and the file-path resolver, the two things the plan's
 * acceptance criteria call out.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSharedViewModel, sharedFileUrl, eventAnchor, eventAnchors, eventForHash, isEmptyValue, derivedMetricsText,
  eventCardVisibility, oneLineDescription, sectionPresence, sharedSectionGroups, lightboxStep,
  toggleInSet, SECTION_IDS, stickyScrollMarginPx, STICKY_PX,
} from './sharedViewModel';
import type { TrackingDocument, TrackingDocumentSummary } from '../domain/document/trackingDocument';
import { portalSections } from '../features/portal/portalSections';
import { buildPortalIndex, legacyAnchorTarget } from '../features/portal/portalModel';

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
    consent_categories: [{ name: 'Newsletter', standard_key: 'newsletter' }],
    catalogs: [],
    standard_event_mappings: [{ standard_event: 'cart_update', event_name: 'cart_update', variant_name: null }],
    findings_summary: { open: { error: 0, warning: 0, info: 0 } },
  };

  it('eventAnchor slugs the name and is stable', () => {
    expect(eventAnchor('purchase')).toBe('event-purchase');
    expect(eventAnchor('cart update / v2')).toBe('event-cart-update-v2');
    expect(eventAnchor('Cart_Update')).toBe('event-Cart_Update');
    expect(eventAnchor('  ')).toBe('event-unnamed');
  });

  it('eventAnchors makes colliding slugs unique with -2, -3 and nav, hash resolution use them', () => {
    const names = ['ab test', 'ab-test', 'Kauf ä', 'Kauf ö', 'Kauf ü'];
    const ids = eventAnchors(names);
    expect(ids).toEqual(['event-ab-test', 'event-ab-test-2', 'event-Kauf', 'event-Kauf-2', 'event-Kauf-3']);
    expect(new Set(ids).size).toBe(ids.length);
    const events = names.map((name) => ({ name, class: 'custom' }));
    expect(eventForHash('#event-ab-test-2', events)?.name).toBe('ab-test');
    expect(eventForHash('#event-Kauf-3', events)?.name).toBe('Kauf ü');
  });

  it('eventForHash resolves a hash to its event, also percent-encoded, and ignores others', () => {
    const events = [ev('purchase'), ev('cart update')];
    expect(eventForHash('#event-purchase', events)?.name).toBe('purchase');
    expect(eventForHash('event-cart-update', events)?.name).toBe('cart update');
    expect(eventForHash('#event-nope', events)).toBeNull();
    expect(eventForHash('#use-cases', events)).toBeNull();
    expect(eventForHash('#event-%E0%A4%A', events)).toBeNull();
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
      standard_event_mappings: [{ standard_event: 'cart_update', event_name: 'cart_update', variant_name: null }], contexts: [1], sdk_default_properties: [1],
    });
    expect(Object.values(full).every((v) => v === true)).toBe(true);
  });

  it('oneLineDescription collapses whitespace and truncates', () => {
    expect(oneLineDescription('a\n  b')).toBe('a b');
    expect(oneLineDescription(null)).toBe('');
    expect(oneLineDescription('x'.repeat(50), 10)).toHaveLength(10);
    expect(oneLineDescription('x'.repeat(50), 10).endsWith('\u2026')).toBe(true);
  });

  it('T-5-42: sectionPresence and the portal sidebar omit empty sections; QA is always listed', () => {
    expect(sectionPresence(baseDoc)).toMatchObject({ useCases: false, identity: false, catalogs: false, findings: false, consents: true, mapping: true });
    const sections = portalSections({ ...baseDoc, event_properties: [] } as unknown as TrackingDocumentSummary);
    expect(sections.map((s) => s.view)).toEqual(['events', 'properties', 'consents', 'standard-events', 'qa']);
    expect(sections.map((s) => s.count)).toEqual([4, 1, 1, 1, 0]);
  });

  it('lightboxStep wraps in both directions', () => {
    expect(lightboxStep(0, -1, 3)).toBe(2);
    expect(lightboxStep(2, 1, 3)).toBe(0);
    expect(lightboxStep(1, 1, 3)).toBe(2);
    expect(lightboxStep(0, 1, 0)).toBe(0);
  });

  it('T-5-42: every section of the single page has a portal view, and its old section id lands there', () => {
    const all = {
      ...baseDoc,
      properties: [{ property_id: 'p1', name: 'tier', definitions: [] }],
      event_properties: [],
      use_cases: [
        { id: 'u1', code: 'UC1', name: 'Welcome', type: 'marketing', requirements: [] },
        { id: 'u2', code: 'UC2', name: 'Order confirmation', type: 'transactional', requirements: [] },
      ],
      identity_rules: [{ id: 'r1' }],
      catalogs: [{ id: 'c1', name: 'products' }],
      events: [{ ...ev('purchase'), id: 'e1' }],
      findings_summary: { open: { error: 1, warning: 0, info: 2 } },
    } as unknown as TrackingDocumentSummary;
    const views = portalSections(all).map((s) => s.view);
    const index = buildPortalIndex(all);
    const present = sectionPresence(all as never);
    const keys = { events: 'events', properties: 'properties', useCases: 'use-cases', identity: 'identity', consents: 'consents', catalogs: 'catalogs', mapping: 'standard-events', findings: 'qa' } as const;
    for (const [key, view] of Object.entries(keys) as [keyof typeof keys, string][]) {
      if (!present[key]) continue;
      expect(views).toContain(view);
      expect(legacyAnchorTarget(SECTION_IDS[key], index)?.view).toBe(view);
    }
    expect(new Set(views).size).toBe(views.length);
  });

  it('T-4-21 groups use cases by type, consents by channel, mapping per leaf and findings by comparison', () => {
    const doc = {
      ...baseDoc,
      use_cases: [
        { id: 'u1', code: 'UC1', name: 'Welcome', type: 'marketing' },
        { id: 'u2', code: 'UC2', name: 'Order confirmation', type: 'transactional' },
        { id: 'u3', code: null, name: 'Loose', type: null },
      ],
      events: [
        { ...ev('purchase'), id: 'e1', findings: [{ severity: 'error', comparison: 'definition_vs_observations', kind: 'type_mismatch' }] },
        { ...ev('cart update'), id: 'e2', findings: [{ severity: 'warning', comparison: 'definition_vs_mapping', kind: 'unmapped_property' }] },
      ],
      unattached_findings: [{ severity: 'info', comparison: 'definition_vs_observations', kind: 'unexpected_event' }],
      consent_categories: [
        { name: 'Newsletter', standard_key: 'newsletter' },
        { name: 'SMS offers', standard_key: null },
        { name: 'Brand consent', standard_key: null },
      ],
      findings_summary: { open: { error: 1, warning: 1, info: 1 } },
    };
    const groups = sharedSectionGroups(doc);
    expect(groups.useCaseGroups.map((g) => g.id)).toEqual(['use-cases-marketing', 'use-cases-transactional', 'use-cases-other']);
    expect(groups.useCaseGroups[0].items.map((l) => l.id)).toEqual(['use-case-UC1']);
    expect(groups.consentGroups.map((g) => g.id)).toEqual(['consents-email', 'consents-sms', 'consents-other']);
    expect(groups.mappingLeaves.map((l) => l.label)).toEqual(['cart_update \u2192 cart_update']);
    expect(groups.findingGroups.map((g) => g.id)).toEqual(['findings-definition_vs_mapping', 'findings-definition_vs_observations']);
    expect(groups.findingGroups[0].label).toBe('Tracking plan vs Bloomreach mapping');
    expect(groups.findingGroups[1].leaves.map((l) => l.id)).toEqual(['findings-definition_vs_observations-event-purchase', 'findings-definition_vs_observations-project']);
  });

  it('toggleInSet adds, removes and does not mutate its input', () => {
    const start = new Set(['events']);
    const added = toggleInSet(start, 'events-custom');
    expect([...added]).toEqual(['events', 'events-custom']);
    expect([...toggleInSet(added, 'events')]).toEqual(['events-custom']);
    expect([...start]).toEqual(['events']);
  });

  it('sticky offsets: sections and groups clear the page header, an event also clears its group header', () => {
    expect(stickyScrollMarginPx('section')).toBe(STICKY_PX.pageHeader);
    expect(stickyScrollMarginPx('group')).toBe(STICKY_PX.pageHeader);
    expect(stickyScrollMarginPx('event')).toBe(STICKY_PX.pageHeader + STICKY_PX.groupHeader);
  });
});
