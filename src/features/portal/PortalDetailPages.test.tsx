// @vitest-environment jsdom
/**
 * Portal detail pages (T-5-44, D-88): the event page (card fetched on open only, a loading state,
 * comments on the page, copy link and Markdown, back to the list with its filters, expiration, no
 * internal values) and the read-only use case page (narrative, requirements with linked targets,
 * documentation link, comments on the use case and on each requirement); a link or path naming an
 * item the share does not have lands on the list with a note.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedProject } from '@/src/pages/SharedProject';
import { emptyEventCard } from '@/src/features/comments/commentLinkFixtures';
import type { TrackingDocument } from '@/src/domain/document/trackingDocument';
import { portalFetch } from './portalTestFixtures';

vi.mock('@/src/features/shared-auth/SharedGoogleSignIn', () => ({
  SharedGoogleSignIn: () => <div aria-label="Comment identity">Identity controls</div>,
}));

const TOKEN = 'public-share-fixture';
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let requested: string[];
let doc: Partial<TrackingDocument>;
let comments: unknown[];

const SECRET = 'internal-marker-7c1f';

const baseDoc = (): Partial<TrackingDocument> => ({
  project: { key: 'public', name: 'Shared project', naming_convention: 'snake_case' } as TrackingDocument['project'],
  properties: [],
  event_properties: [],
  events: [
    {
      ...emptyEventCard({ id: 'event-id', name: 'cart_update', description: 'Cart change', status: 'implemented' }),
      expiration: { effective: { enabled: true, count: 90, units: 'days' }, source: 'event' },
      // The public card carries these keys as null; a value here must still never render.
      identity_note: SECRET,
      owners: { business: SECRET, technical: SECRET },
      agent_instructions: SECRET,
    } as TrackingDocument['events'][number],
    emptyEventCard({ id: 'other-id', name: 'purchase', status: 'planned' }),
  ],
  catalogs: [],
  identity_rules: [],
  use_cases: [
    {
      id: 'uc-1',
      code: 'UC-01',
      name: 'Abandoned cart',
      type: 'marketing',
      status: 'active',
      narrative: 'Remind shoppers about **their cart**.',
      documentation_url: 'https://docs.example.com/abandoned-cart',
      requirements: [
        { id: 'req-1', target_label: 'cart_update', level: 'R', status: 'done', target_kind: 'event', event_id: 'event-id', property_id: null },
      ],
    },
  ],
  consent_categories: [],
  standard_event_mappings: [],
  unattached_findings: [],
  findings_summary: { open: { error: 0, warning: 0, info: 0 }, by_comparison: {} },
});

const comment = (id: string, entity_type: string, entity_id: string, body: string) => ({
  id,
  parent_id: null,
  entity_type,
  entity_id,
  body,
  author_name: 'Client reviewer',
  status: 'open',
  created_at: '2026-10-15T08:00:00Z',
  updated_at: '2026-10-15T08:00:00Z',
  reactions: [],
  attachments: [],
});

beforeEach(() => {
  requested = [];
  doc = baseDoc();
  comments = [comment('c-event', 'event', 'event-id', 'Is the cart id a string?'), comment('c-uc', 'use_case', 'uc-1', 'Timing looks right.')];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(portalFetch({ doc: () => doc, comments: () => comments, requested })));
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  window.history.replaceState(null, '', `/shared/${TOKEN}`);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  window.history.replaceState(null, '', '/');
});

async function mount(path: string) {
  window.history.replaceState(null, '', path);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SharedProject token={TOKEN} />);
  });
  await settle();
}
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const click = async (element: Element | null | undefined) => {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
};
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const cardRequests = () => requested.filter((u) => u.includes('/card.json'));

describe('events list', () => {
  it('shows the expiration of each event from the summary, without loading any card (T-5-46)', async () => {
    await mount(`/shared/${TOKEN}/events`);
    const table = container!.querySelector('table')!;
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toContain('Expiration');
    const rowText = (name: string) => [...table.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(name))?.textContent ?? '';
    expect(rowText('cart_update')).toContain('90 days');
    expect(rowText('purchase')).toContain('project default');
    expect(cardRequests()).toEqual([]);
  });
});

describe('event page', () => {
  it('fetches the card on open only, shows a loading state, then the card with its expiration and no internal values', async () => {
    let release: () => void = () => undefined;
    const served = portalFetch({ doc: () => doc, comments: () => comments, requested });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/card.json')) await new Promise<void>((resolve) => (release = resolve));
        return served(url);
      })
    );
    await mount(`/shared/${TOKEN}/events/cart_update`);
    expect(container!.querySelector('[data-testid="event-card-loading"]')!.getAttribute('aria-busy')).toBe('true');
    expect(container!.querySelector('button[aria-label^="Copy event cart_update as Markdown"]')).toBeNull();
    await act(async () => release());
    await settle();
    expect(container!.querySelector('[data-testid="event-card-loading"]')).toBeNull();
    expect(cardRequests()).toEqual([`/api/shared/${TOKEN}/events/event-id/card.json`]);
    expect(container!.textContent).toContain('Expiration');
    expect(container!.textContent).toContain('90 days (event)');
    expect(container!.textContent).not.toContain(SECRET);
    expect(container!.textContent).not.toMatch(/Agent instructions|Identity note|Owner \(/);
    expect(container!.querySelector('button[aria-label="Copy event cart_update as Markdown"]')).not.toBeNull();
    expect(requested.every((u) => u.includes(`/api/shared/${TOKEN}`))).toBe(true);
    expect(requested.some((u) => u.endsWith('/tracking-document.json'))).toBe(false);
  });

  it('shows the event comments on the page, not in a sheet, and the header count jumps to them', async () => {
    await mount(`/shared/${TOKEN}/events/cart_update`);
    const section = container!.querySelector('section#page-comments[aria-label="Comments"]')!;
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('Is the cart id a string?');
    expect(section.textContent).not.toContain('Timing looks right.');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const jump = container!.querySelector('button[aria-label="Comments on event cart_update: 1"]')!;
    await click(jump);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(section);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // History stays in its sheet.
    expect(container!.querySelector('button[aria-label="History of event cart_update"]')).not.toBeNull();
    // Copy link points at the event's own page.
    expect(container!.querySelector('button[aria-label*="cart_update"][aria-label*="link" i]')).not.toBeNull();
  });

  it('offers a retry when the card cannot be loaded', async () => {
    let fail = true;
    const served = portalFetch({ doc: () => doc, comments: () => comments, requested });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (String(url).includes('/card.json') && fail ? new Response('{}', { status: 404 }) : served(url)))
    );
    await mount(`/shared/${TOKEN}/events/cart_update`);
    const alert = container!.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('This event could not be loaded.');
    fail = false;
    await click(Array.from(alert.querySelectorAll('button')).find((b) => b.textContent === 'Try again'));
    await settle();
    expect(container!.querySelector('[role="alert"]')).toBeNull();
    expect(container!.textContent).toContain('90 days (event)');
  });

  it('goes back to the list with its search, filters and sort kept, by the link and by the browser', async () => {
    await mount(`/shared/${TOKEN}/events`);
    const status = container!.querySelector<HTMLSelectElement>('select[aria-label="Filter by status"]')!;
    await choose(status, 'implemented');
    await settle();
    expect(container!.querySelectorAll('[data-testid="event-row"]')).toHaveLength(1);
    // The list was scrolled when the visitor opened the event.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 480 });
    await click(Array.from(container!.querySelectorAll('[data-testid="event-row"] button')).find((b) => b.textContent === 'cart_update'));
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events/cart_update`);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    vi.mocked(window.scrollTo).mockClear();
    // The page's back link.
    await click(container!.querySelector(`a[href="/shared/${TOKEN}/events"]`));
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 480 });
    expect(container!.querySelector<HTMLSelectElement>('select[aria-label="Filter by status"]')!.value).toBe('implemented');
    expect(container!.querySelectorAll('[data-testid="event-row"]')).toHaveLength(1);
    // The browser's back button from the event page.
    await click(Array.from(container!.querySelectorAll('[data-testid="event-row"] button')).find((b) => b.textContent === 'cart_update'));
    await settle();
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
    expect(container!.querySelector<HTMLSelectElement>('select[aria-label="Filter by status"]')!.value).toBe('implemented');
  });
});

describe('use case page', () => {
  it('is read-only: narrative, documentation link, requirements linked to their target, comments on the page and per requirement', async () => {
    await mount(`/shared/${TOKEN}/use-cases`);
    await click(Array.from(container!.querySelectorAll('button')).find((b) => b.textContent === 'Abandoned cart'));
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/use-cases/UC-01`);
    expect(container!.querySelector('h1')!.textContent).toBe('UC-01 — Abandoned cart');
    expect(container!.querySelector('strong')!.textContent).toBe('their cart');
    expect(container!.querySelector('a[href="https://docs.example.com/abandoned-cart"]')!.textContent).toBe('Documentation');
    const table = container!.querySelector('[aria-label="Requirements table"]')!;
    const link = table.querySelector(`a[href="/shared/${TOKEN}/events/cart_update"]`)!;
    expect(link.textContent).toBe('cart_update');
    expect(table.querySelector('button[aria-label="Comments on this requirement: 0"]')).not.toBeNull();
    const section = container!.querySelector('section#page-comments')!;
    expect(section.textContent).toContain('Timing looks right.');
    expect(section.textContent).not.toContain('Is the cart id a string?');
    expect(container!.textContent).not.toMatch(/Add requirement|Delete|Edit/);
    expect(container!.querySelector('input:not([type="search"]):not([type="file"]), textarea')).toBeNull();
    // A requirement link opens the event page.
    await click(link);
    await settle();
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events/cart_update`);
  });

  it('never renders a documentation link that is not http(s), e.g. from a restored backup', async () => {
    (doc.use_cases![0] as { documentation_url: string }).documentation_url = 'javascript:alert(1)';
    await mount(`/shared/${TOKEN}/use-cases/UC-01`);
    expect(container!.querySelector('h1')!.textContent).toBe('UC-01 — Abandoned cart');
    expect(container!.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(Array.from(container!.querySelectorAll('a')).some((a) => a.textContent === 'Documentation')).toBe(false);
  });
});

describe('links to items the share does not have', () => {
  it('a path naming an unknown event shows the list with a note, without fetching a card', async () => {
    await mount(`/shared/${TOKEN}/events/no_such_event`);
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
    expect(container!.querySelector('h1')!.textContent).toContain('Events');
    expect(container!.querySelector('[role="status"]')!.textContent).toContain('No event “no_such_event” is in this tracking plan.');
    expect(container!.querySelectorAll('[data-testid="event-row"]')).toHaveLength(2);
    expect(cardRequests()).toEqual([]);
  });

  it('an old anchor naming an unknown event or use case lands on the list with a note, which goes when the visitor moves on', async () => {
    await mount(`/shared/${TOKEN}#event-deleted_event`);
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/events`);
    expect(window.location.hash).toBe('');
    expect(container!.querySelector('[role="status"]')!.textContent).toContain('No event “deleted_event”');
    await click(Array.from(container!.querySelectorAll('[data-testid="event-row"] button')).find((b) => b.textContent === 'cart_update'));
    await settle();
    expect(container!.textContent).not.toContain('deleted_event');
    await act(async () => root!.unmount());
    root = undefined;
    container!.remove();
    await mount(`/shared/${TOKEN}#use-case-gone`);
    expect(window.location.pathname).toBe(`/shared/${TOKEN}/use-cases`);
    expect(container!.querySelector('[role="status"]')!.textContent).toContain('No use case “gone”');
  });
});
