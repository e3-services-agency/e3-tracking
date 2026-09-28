/**
 * `SharedProject`'s view-model builder (T-4-03, D-50): no `@testing-library/react` in this repo
 * (D-20 uses plain-Node vitest, no jsdom), so this tests the pure functions the component calls
 * instead of rendering it -- event ordering and the file-path resolver, the two things the plan's
 * acceptance criteria call out.
 */
import { describe, expect, it } from 'vitest';
import { buildSharedViewModel, sharedFileUrl } from './sharedViewModel';
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
