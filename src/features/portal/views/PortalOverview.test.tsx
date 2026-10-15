// @vitest-environment jsdom
/**
 * Portal overview (T-5-43, D-88 plan section 5): progress from the summary, open threads newest
 * first linking to their targets through the comment links, the five latest public changes, the
 * section cards and the downloads. Only the summary, comments and history routes are read.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedProject } from '@/src/pages/SharedProject';
import { emptyEventCard } from '@/src/features/comments/commentLinkFixtures';
import type { TrackingDocument, TrackingDocumentCustomerProperty } from '@/src/domain/document/trackingDocument';
import { portalFetch, toSummary } from '../portalTestFixtures';
import { buildPortalIndex } from '../portalModel';
import { certificationCounts, customEventStatusCounts, waitingThreads } from '../overviewModel';
import { OVERVIEW_THREAD_LIMIT } from './PortalOverview';

vi.mock('@/src/features/shared-auth/SharedGoogleSignIn', () => ({ SharedGoogleSignIn: () => null }));

const TOKEN = 'overview-fixture';
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let requested: string[];
let comments: unknown[];
let history: unknown[];

const property: TrackingDocumentCustomerProperty = {
  property_id: 'prop-email', category: 'customer', name: 'email', data_type: 'string', data_formats: [], pii: true,
  bloomreach_customer_property: null, description: null,
  definitions: [{ id: 'def-email', name: 'general', description: null, allowed_values: null, formats: [], example_values: null }],
} as unknown as TrackingDocumentCustomerProperty;

const doc = (): Partial<TrackingDocument> => ({
  project: { key: 'acme', name: 'Acme EU', naming_convention: 'snake_case' } as TrackingDocument['project'],
  properties: [property], event_properties: [],
  events: [
    emptyEventCard({ id: 'ev-purchase', name: 'purchase', status: 'implemented', certification: { applicable: true, certified: true, reasons: [] } }),
    emptyEventCard({ id: 'ev-cart', name: 'cart_update', status: 'planned' }),
    emptyEventCard({ id: 'ev-view', name: 'view_item', status: 'in_review' }),
    emptyEventCard({ id: 'ev-session', name: 'session_start', class: 'sdk', status: 'implemented', certification: { applicable: false, certified: false, reasons: [] } }),
  ],
  catalogs: [], identity_rules: [], use_cases: [], consent_categories: [], standard_event_mappings: [], unattached_findings: [],
  findings_summary: { open: { error: 3, warning: 1, info: 0 }, by_comparison: {} },
});

const comment = (id: string, over: Record<string, unknown>) => ({
  id, entity_type: 'event', entity_id: 'ev-cart', author_name: 'Client', via_share: true, body: `Body ${id}`,
  created_at: '2026-10-01T09:00:00Z', resolved_at: null, resolved_by: null, parent_id: null, status: 'open', ...over,
});

beforeEach(() => {
  requested = [];
  comments = [
    comment('c-old', { created_at: '2026-10-01T09:00:00Z' }),
    comment('c-reply', { parent_id: 'c-old', created_at: '2026-10-12T09:00:00Z', body: 'Newest reply' }),
    comment('c-prop', { entity_type: 'property_definition', entity_id: 'def-email', created_at: '2026-10-10T09:00:00Z' }),
    comment('c-done', { status: 'done', created_at: '2026-10-14T09:00:00Z' }),
    comment('c-private', { internal_only: true, created_at: '2026-10-14T09:00:00Z', body: 'INTERNAL SECRET' }),
  ];
  history = [
    { id: 'h1', entity_type: 'property_definition', entity_id: 'def-email', entity_label: 'general', action: 'update', actor: 'Staff', changed_at: '2026-10-13T10:00:00Z', diff_json: [{ field: 'allowed_values_json', before: [], after: [] }, { field: 'description', before: 'a', after: 'b' }] },
    { id: 'h2', entity_type: 'catalog_field', entity_id: 'field-1', entity_label: 'sku', action: 'create', actor: 'Staff', changed_at: '2026-10-11T10:00:00Z', diff_json: [{ field: 'name', before: null, after: 'sku' }] },
  ];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(portalFetch({ doc, comments: () => comments, history: () => history, requested })));
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  window.history.replaceState(null, '', `/shared/${TOKEN}`);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove(); root = undefined; container = undefined;
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
async function mount() {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<SharedProject token={TOKEN} />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}
const q = (selector: string) => container!.querySelector(selector);
const all = (selector: string) => [...container!.querySelectorAll(selector)];

describe('Portal overview', () => {
  it('shows progress from the summary: custom events by status, certified of applicable, findings by severity', async () => {
    await mount();
    expect(q('h1')!.textContent).toContain('Shared project complete name');
    expect(q('[data-testid="overview-status-planned"]')!.textContent).toMatch(/Planned\s*1/);
    expect(q('[data-testid="overview-status-in_review"]')!.textContent).toMatch(/1$/);
    // The SDK event is not a custom event.
    expect(q('[data-testid="overview-status-implemented"]')!.textContent).toMatch(/1$/);
    expect(q('[data-testid="overview-status-ignored"]')).toBeNull();
    expect(q('[data-testid="overview-certified"]')!.textContent).toContain('Certified 1 of 3 applicable');
    expect(q('[data-testid="overview-severity-error"]')!.textContent).toMatch(/3$/);
    expect(q('[data-testid="overview-severity-warning"]')!.textContent).toMatch(/1$/);
    expect(q('[data-testid="overview-severity-info"]')!.textContent).toMatch(/0$/);
  });

  it('lists open threads newest activity first, linking to their targets, never internal or closed ones', async () => {
    await mount();
    const rows = all('[data-testid="overview-thread"]');
    expect(rows.map((r) => r.querySelector('a')!.textContent)).toEqual(['cart_update', 'email']);
    expect(rows[0].textContent).toContain('1 reply');
    const href = rows[0].querySelector('a')!.getAttribute('href')!;
    expect(href).toMatch(new RegExp(`^/shared/${TOKEN}/events/cart_update#comment=v1&type=event&entity=ev-cart&thread=c-old&target=c-old$`));
    expect(rows[1].querySelector('a')!.getAttribute('href')).toContain(`/shared/${TOKEN}/properties/`);
    expect(container!.textContent).not.toContain('INTERNAL SECRET');
    expect(container!.textContent).not.toContain('Body c-done');
    await act(async () => { (rows[0].querySelector('a') as HTMLElement).click(); });
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events/cart_update`);
    expect(window.location.hash).toContain('thread=c-old');
  });

  it('shows the five latest public changes and the last change in the header, from the history route', async () => {
    await mount();
    const rows = all('[data-testid="overview-change"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('email');
    expect(rows[0].textContent).toContain('Changed: allowed values, description');
    expect(rows[1].textContent).toContain('Catalog field');
    expect(rows[1].querySelector('a')!.getAttribute('href')).toBe(`/shared/${TOKEN}/catalogs`);
    expect(q('[data-testid="overview-updated"]')!.textContent).toMatch(/Generated .* · last change /);
    expect(requested.filter((u) => u.includes('/history'))).toEqual([expect.stringContaining(`/api/shared/${TOKEN}/history?limit=5`)]);
  });

  it('reads only the summary, comments and history routes, and offers the downloads and section cards', async () => {
    await mount();
    expect(requested.map((u) => u.replace(/^.*\/api\/shared\/[^/]+/, ''))).toEqual(['', '/document-summary.json', '/comments', '/history?limit=5']);
    const main = q('main')!;
    expect(main.querySelector(`a[href$="/api/shared/${TOKEN}/tracking-document.json"]`)).not.toBeNull();
    expect(main.querySelector(`a[href$="/api/shared/${TOKEN}/documentation.html"]`)).not.toBeNull();
    expect(q('[data-testid="overview-card-events"]')!.textContent).toMatch(/Events.*1 open.*4/);
    expect(q('[data-testid="overview-card-properties"]')!.textContent).toMatch(/1 open/);
    await act(async () => { (q('[data-testid="overview-card-events"]') as HTMLElement).click(); });
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
  });

  it('degrades to an empty change list when the history route fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/history?') ? new Response('{}', { status: 404 }) : portalFetch({ doc, requested })(url))));
    await mount();
    expect(container!.textContent).toContain('No public changes yet.');
    expect(container!.textContent).toContain('No open comment threads.');
    expect(q('[data-testid="overview-updated"]')!.textContent).not.toContain('last change');
  });
});

describe('overview model', () => {
  const summary = toSummary(doc());
  const index = buildPortalIndex(summary);
  it('counts custom events by status and certified of applicable', () => {
    expect(customEventStatusCounts(summary)).toEqual([
      { status: 'planned', count: 1 },
      { status: 'in_review', count: 1 },
      { status: 'implemented', count: 1 },
    ]);
    expect(certificationCounts(summary)).toEqual({ certified: 1, applicable: 3 });
  });
  it('keeps a thread whose target left the share, without a link', () => {
    const rows = [comment('gone', { entity_id: 'ev-removed' })] as never[];
    expect(waitingThreads(rows, summary, index)).toEqual([expect.objectContaining({ id: 'gone', name: null, target: null })]);
  });
  it(`lists at most ${OVERVIEW_THREAD_LIMIT} threads on the page`, async () => {
    comments = Array.from({ length: OVERVIEW_THREAD_LIMIT + 3 }, (_, i) => comment(`t${i}`, { created_at: `2026-10-0${(i % 9) + 1}T09:00:00Z` }));
    await mount();
    expect(all('[data-testid="overview-thread"]')).toHaveLength(OVERVIEW_THREAD_LIMIT);
    expect(container!.textContent).toContain(`Showing ${OVERVIEW_THREAD_LIMIT} of ${OVERVIEW_THREAD_LIMIT + 3} open threads`);
  });
});
