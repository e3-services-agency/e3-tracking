// @vitest-environment jsdom
/**
 * Client portal shell (T-5-42, D-88): the agency brand, one view per section on the shared
 * read-only views, the downloads, and the privacy guarantees of the single page it replaced: every
 * request stays under `/api/shared/<token>`, the full document is never fetched for a view, there
 * are no edit controls, and no Expand all / Collapse all.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedProject } from './SharedProject';
import { emptyEventCard } from '../features/comments/commentLinkFixtures';
import { portalFetch } from '../features/portal/portalTestFixtures';
import { PROPERTY_ROW_LIMIT } from '../features/portal/views/PortalPropertiesView';
import type { TrackingDocument, TrackingDocumentCustomerProperty } from '../domain/document/trackingDocument';

vi.mock('../features/shared-auth/SharedGoogleSignIn', () => ({
  SharedGoogleSignIn: () => <div aria-label="Comment identity">Identity controls</div>,
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let requested: string[];
let doc: Partial<TrackingDocument>;
const TOKEN = 'public-share-fixture';
const longName = 'reservation_passenger_airport_departure_full_property_name';
function property(count: number, id = 'public-property', name = longName): TrackingDocumentCustomerProperty {
  return { property_id: id, category: 'customer', name,
    data_type: 'string', data_formats: [], pii: false, bloomreach_customer_property: null,
    description: 'Complete public description, including the final words.',
    definitions: Array.from({ length: count }, (_, i) => ({ id: `${id}-def-${i}`,
      name: i === 0 ? 'general' : `public_definition_${i}`, description: `Definition ${i}`,
      allowed_values: null, formats: [], example_values: null })) };
}
const baseDoc = (): Partial<TrackingDocument> => ({
  project: { key: 'public', name: 'Shared project', naming_convention: 'snake_case' } as TrackingDocument['project'],
  properties: [property(3)], event_properties: [],
  events: [emptyEventCard({ id: 'event-id', name: 'cart_update', description: 'Cart change' }), emptyEventCard({ id: 'other-id', name: 'purchase' })],
  catalogs: [], identity_rules: [], use_cases: [], consent_categories: [], standard_event_mappings: [], unattached_findings: [],
  findings_summary: { open: { error: 0, warning: 0, info: 0 }, by_comparison: {} },
});
beforeEach(() => {
  requested = [];
  doc = baseDoc();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(portalFetch({ doc: () => doc, requested })));
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
}
const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); });
};
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe('Client portal shell', () => {
  it('bundles the existing agency logo bytes without widening any public route', () => {
    const publicLogo = readFileSync(path.resolve(__dirname, '../../public/branding/agency-logo.png'));
    const bundledLogo = readFileSync(path.resolve(__dirname, '../assets/agency-logo.png'));
    expect(bundledLogo.equals(publicLogo)).toBe(true);
  });

  it('shows the agency brand once, the project, the sidebar with counts and the downloads, from the summary only', async () => {
    await mount();
    expect(container!.querySelector('header')!.textContent).toContain('Tracking Portal');
    expect(container!.querySelector('header img')!.getAttribute('alt')).toBe('E3');
    expect(container!.querySelector('[data-testid="portal-project-name"]')!.textContent).toBe('Shared project complete name');
    expect(container!.querySelectorAll('[aria-label="Comment identity"]')).toHaveLength(1);
    expect(container!.querySelector('a[href$="/tracking-document.json"]')).not.toBeNull();
    expect(container!.querySelector('a[href$="/documentation.html"]')).not.toBeNull();
    const nav = container!.querySelector('nav[aria-label="Tracking plan sections"]')!;
    expect(nav.querySelector('[data-testid="portal-nav-events"]')!.textContent).toContain('2');
    expect(nav.querySelector('[data-testid="portal-nav-properties"]')!.textContent).toContain('1');
    expect(nav.querySelector('[data-testid="portal-nav-qa"]')).not.toBeNull();
    // Empty sections are left out, as the single page left them out.
    expect(nav.querySelector('[data-testid="portal-nav-catalogs"]')).toBeNull();
    expect(requested.map((u) => u.replace(`/api/shared/${TOKEN}`, ''))).toEqual(['', '/document-summary.json', '/comments']);
  });

  it('opens one view at a time by path, with no Expand all, no edit controls and public-only requests', async () => {
    await mount();
    for (const view of ['events', 'properties', 'qa', 'overview'] as const) {
      await click(container!.querySelector(`[data-testid="portal-nav-${view}"]`));
      await settle();
      expect(window.location.pathname).toBe(`/shared/${TOKEN}/${view}`);
      expect(container!.querySelector('[data-testid="portal-nav-' + view + '"]')!.getAttribute('aria-current')).toBe('page');
      expect(container!.querySelector('button[aria-label^="Expand all"], button[aria-label^="Collapse all"]')).toBeNull();
      expect(container!.textContent).not.toMatch(/Add Property|Delete|Edit Property|Internal Project|Expand all rows/);
    }
    // Back returns to the previous view.
    await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/qa`);
    expect(requested.every((address) => address.includes(`/api/shared/${TOKEN}`))).toBe(true);
    expect(requested.some((address) => address.endsWith('/tracking-document.json'))).toBe(false);
    // QA reports load when the QA view opens: once for the click, once for Back.
    expect(requested.filter((address) => address.endsWith('/qa-reports'))).toHaveLength(2);
  });

  it('lists events from the summary and fetches a card only when its page opens', async () => {
    window.history.replaceState(null, '', `/shared/${TOKEN}/events`);
    await mount();
    const rows = container!.querySelectorAll('[data-testid="event-row"]');
    expect(rows).toHaveLength(2);
    expect(requested.some((u) => u.includes('/card.json'))).toBe(false);
    await click(Array.from(rows[0].querySelectorAll('button')).find((b) => b.textContent === 'cart_update')!);
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events/cart_update`);
    expect(requested.filter((u) => u.includes('/card.json'))).toEqual([`/api/shared/${TOKEN}/events/event-id/card.json`]);
    expect(container!.querySelector('h1')!.textContent).toBe('cart_update');
    expect(container!.textContent).toContain('Cart change');
    expect(container!.querySelector('a[href$="/events"]')!.textContent).toContain('Events');
  });

  it('shows every definition of a property on its own page, full names, with their own comments', async () => {
    window.history.replaceState(null, '', `/shared/${TOKEN}/properties`);
    await mount();
    const row = container!.querySelector('[data-testid="property-row"]')!;
    expect(row.textContent).toContain(longName);
    await click(Array.from(row.querySelectorAll('button')).find((b) => b.textContent === longName)!);
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/properties/${longName}`);
    expect(container!.querySelector('h1')!.textContent).toBe(longName);
    const table = container!.querySelector('[aria-label="Definitions table"]')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
    for (const name of ['general', 'public_definition_1', 'public_definition_2']) expect(table.textContent).toContain(name);
    expect(table.querySelectorAll('button[aria-label^="History of"]')).toHaveLength(3);
    expect(container!.textContent).toContain('Complete public description, including the final words.');
  });

  it(`renders at most ${PROPERTY_ROW_LIMIT} property rows at a time and adds more on request`, async () => {
    doc = { ...baseDoc(), properties: Array.from({ length: 150 }, (_, i) => property(1, `p${i}`, `property_${String(i).padStart(3, '0')}`)) };
    window.history.replaceState(null, '', `/shared/${TOKEN}/properties`);
    await mount();
    expect(container!.querySelectorAll('[data-testid="property-row"]')).toHaveLength(PROPERTY_ROW_LIMIT);
    const more = container!.querySelector('[data-testid="property-show-more"]')!;
    expect(more.textContent).toContain(`Showing ${PROPERTY_ROW_LIMIT} of 150 properties.`);
    await click(more.querySelector('button'));
    expect(container!.querySelectorAll('[data-testid="property-row"]')).toHaveLength(150);
    expect(container!.querySelector('[data-testid="property-show-more"]')).toBeNull();
  });

  it('answers an unknown item with its list and a not-found note inside the shell, and a revoked link with the plain page', async () => {
    window.history.replaceState(null, '', `/shared/${TOKEN}/events/no_such_event`);
    await mount();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
    expect(container!.querySelector('[role="status"]')!.textContent).toContain('No event “no_such_event” is in this tracking plan.');
    expect(requested.some((u) => u.includes('/card.json'))).toBe(false);
    await act(async () => root!.unmount());
    root = createRoot(container!);
    vi.stubGlobal('fetch', vi.fn(portalFetch({ doc: () => doc, status: 404 })));
    await act(async () => { root!.render(<SharedProject token={TOKEN} />); });
    expect(container!.textContent).toContain('This link is not valid.');
    expect(container!.textContent).not.toContain('Shared project complete name');
  });
});
