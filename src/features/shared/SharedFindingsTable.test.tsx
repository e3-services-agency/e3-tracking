// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedFindingsTable } from './SharedFindingsTable';
import { findingEntity } from './findingEntity';
import { buildReferenceIndex } from './references';
import { SharedProject } from '@/src/pages/SharedProject';
import { emptyEventCard } from '@/src/features/comments/commentLinkFixtures';
import { commentFragment } from '@/src/features/comments/commentLinks';
import { computeFindingsSummary } from '@/src/domain/document/findingsSummary';
import { useCaseToMarkdown, findingsSummaryToMarkdown } from '@/src/domain/document/markdown';
import type { TrackingDocumentUseCase, EventCardFinding } from '@/src/domain/document/trackingDocument';
import type { CommentPanelRow } from '@/src/features/comments/CommentsPanel';
import { portalFetch } from '@/src/features/portal/portalTestFixtures';
import { PORTAL_ROW_LIMIT } from '@/src/features/views/ViewParts';
vi.mock('@/src/features/shared-auth/SharedGoogleSignIn', () => ({ SharedGoogleSignIn: () => null }));
let root: Root;
let container: HTMLDivElement;
let copy: ReturnType<typeof vi.fn>;
let requested: string[];
let servedDoc: unknown;
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const message = 'The complete finding message with details and final words. ' + 'long_unbroken_payload_property_name_'.repeat(8);
const eventName = 'reservation_passenger_departure_airport_full_event_name';
const finding = (id: string, sequence: number): EventCardFinding => ({ id, finding_sequence: sequence,
  comparison: 'definition_vs_observations', kind: 'missing_required', severity: 'error',
  property_id: null, property: null, variant_id: null, variant: null, rule: null,
  message, expected: {}, actual: {}, qa_run_id: null, first_seen: '2026-10-12', last_seen: '2026-10-12' });
const first = finding('finding-event', 12);
const second = { ...finding('finding-project', 13), severity: 'warning' as const };
const firstNumber = '#' + String(first.finding_sequence).padStart(3, '0');
const secondNumber = '#' + String(second.finding_sequence).padStart(3, '0');
const event = emptyEventCard({ id: 'event-id', name: eventName, findings: [first] });
const comment: CommentPanelRow = { id: 'root-comment', entity_type: 'finding', entity_id: first.id,
  author_name: 'Jane', body: 'Exact finding discussion', via_share: true, parent_id: null, status: 'open',
  created_at: '2026-10-12', resolved_at: null, resolved_by: null };
const comments = [comment, { ...comment, id: 'other-comment', entity_id: second.id, body: 'Other discussion' }];
const doc = { project: { key: 'public', name: 'Shared project', naming_convention: 'snake_case' }, events: [event],
  properties: [], event_properties: [], catalogs: [], identity_rules: [], use_cases: [], consent_categories: [],
  standard_event_mappings: [], unattached_findings: [second], findings_summary: { open: { error: 1, warning: 1, info: 0 } } };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('isSecureContext', true);
  copy = vi.fn().mockResolvedValue(undefined); requested = []; servedDoc = doc;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('scrollTo', vi.fn());
  window.history.replaceState(null, '', '/tracking-plan/shared/public-fixture');
  vi.stubGlobal('fetch', vi.fn(portalFetch({ doc: () => servedDoc as never, comments: () => comments, requested })));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else Reflect.deleteProperty(navigator, 'clipboard');
  if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  window.history.replaceState(null, '', '/');
});
const mount = async (ui: React.ReactNode) => { await act(async () => root.render(ui)); };
const table = (onNavigate = vi.fn()) => <SharedFindingsTable events={[event]} unattached={[second]}
  api={{ mode: 'shared', token: 'public-fixture', access: 'read' }} comments={comments} onChanged={() => {}}
  anchorFor={() => 'event-reservation'} onNavigate={onNavigate} />;

describe('Shared current Findings table', () => {
  it('uses the shared semantic table, full wrapping content and a single five-column workflow', async () => {
    await mount(table());
    expect(Array.from(container.querySelectorAll('thead th')).map(th => th.textContent)).toEqual(['Number', 'Severity', 'Event', 'Message', 'Actions']);
    const region = container.querySelector('[aria-label="Individual finding discussions table"]')!;
    expect(region.className).toContain('overflow-x-auto'); expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.querySelector('table')!.className).toContain('text-sm');
    const rows = region.querySelectorAll('tbody tr'); expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(`current-finding-${first.id}`); expect(rows[1].id).toBe(`current-finding-${second.id}`);
    expect(rows[0].querySelector('th[scope="row"]')!.textContent).toBe(firstNumber);
    expect(rows[0].children[1].textContent).toBe('Error'); expect(rows[1].children[1].textContent).toBe('Warning');
    expect(rows[0].children[2].textContent).toBe(eventName); expect(rows[1].children[2].textContent).toBe('Not tied to an event');
    expect(rows[0].children[3].textContent).toContain(message);
    expect(rows[0].children[3].className).toContain('[overflow-wrap:anywhere]');
    expect(rows[0].children[4].querySelector('div')!.className).toContain('flex-wrap');
    expect(requested).toEqual([]); // No new status/private-data lookup.
  });
  it('expands original comparison/context and existing family next step without changing action targets', async () => {
    await mount(table());
    const row = container.querySelector(`#current-finding-${first.id}`)!;
    await act(async () => (row.querySelector('th button') as HTMLButtonElement).click());
    const detail = container.querySelector(`#current-finding-${first.id}-details`)!;
    expect(detail.textContent).toContain('Tracking plan vs observed data');
    expect(detail.textContent).toContain('Fix the tracking implementation, or update the definition if the data is right.');
    await act(async () => row.querySelector<HTMLButtonElement>(`button[aria-label="Copy link to Finding ${firstNumber}"]`)!.click());
    expect(row.querySelector('th button')!.getAttribute('aria-expanded')).toBe('true');
  });
  it('combines severity/event/comparison/search filters, shows empty results and resets', async () => {
    await mount(table());
    const select = async (suffix: string, value: string) => {
      const control = container.querySelector<HTMLSelectElement>(`select[id$="-${suffix}"]`)!;
      await act(async () => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    await select('severity', 'warning'); await select('event', '__project__'); await select('comparison', 'definition_vs_observations');
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setSearch = async (value: string) => { await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }); };
    await setSearch('Finding ' + secondNumber);
    expect(container.querySelector('table tbody')!.querySelectorAll('tr')).toHaveLength(1);
    expect(container.querySelector('table tbody tr')!.id).toBe(`current-finding-${second.id}`);
    await setSearch('not present anywhere');
    expect(container.textContent).toContain('No findings match these filters.');
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Reset filters')!.click());
    expect(container.querySelector('table tbody')!.querySelectorAll('tr')).toHaveLength(2);
    expect(input.value).toBe('');
  });
  it('links the existing event anchor and copies a stable current-finding URL', async () => {
    const navigate = vi.fn(); await mount(table(navigate));
    const link = container.querySelector<HTMLAnchorElement>('a[href="#event-reservation"]')!;
    await act(async () => link.click()); expect(navigate).toHaveBeenCalledWith('event-reservation');
    await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="Copy link to Finding ${firstNumber}"]`)!.click());
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/tracking-plan/shared/public-fixture#current-finding-finding-event`);
  });
  it('keeps comments on the exact finding target and read-only permissions', async () => {
    await mount(table());
    await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="Comments on Finding ${firstNumber}: 1"]`)!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Exact finding discussion'); expect(dialog.textContent).not.toContain('Other discussion');
    expect(dialog.querySelector('textarea')).toBeNull(); expect(dialog.querySelector('select')).toBeNull();
  });
  it('uses the original public finding-history endpoint', async () => {
    await mount(table());
    await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="History of Finding ${secondNumber}"]`)!.click());
    expect(requested).toContain('/api/shared/public-fixture/findings/finding-project/history');
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Current finding status: open');
  });
  it('preserves public Property/Variant/Catalog/Consent links and unresolved fallback in expanded context', async () => {
    const contextFindings: EventCardFinding[] = [
      { ...second, id: 'property-context', property_id: 'property-id', property: 'customer_name' },
      { ...second, id: 'variant-context', variant_id: 'variant-id', variant: 'Added product' },
      { ...second, id: 'catalog-context', kind: 'catalog_searchable_limit' },
      { ...second, id: 'consent-context', expected: { category_name: 'Marketing' } },
      { ...second, id: 'unresolved-context', property_id: 'missing-property', property: 'Unresolved property' },
    ];
    const index = buildReferenceIndex({ events: [{ id: event.id, name: eventName, variants: [{ id: 'variant-id', name: 'Added product' }] }],
      properties: [{ property_id: 'property-id', name: 'customer_name' }], consent_categories: [{ id: 'consent-id', name: 'Marketing' }], catalogs: [] });
    const navigate = vi.fn();
    await mount(<SharedFindingsTable events={[]} unattached={contextFindings} api={{ mode: 'shared', token: 'public-fixture', access: 'read' }}
      comments={[]} onChanged={() => {}} anchorFor={() => undefined} onNavigate={navigate} renderContext={finding => {
        const entity = findingEntity(finding, index, { catalogs: 'catalogs', consents: 'consents' });
        return entity.href ? <a href={entity.href} onClick={e => { e.preventDefault(); navigate(entity.href!.slice(1)); }}>{entity.type}: {entity.label ?? 'open section'}</a>
          : [entity.type, entity.label].filter(Boolean).join(': ') || '—';
      }} />);
    const expected = ['property-customer_name', `variants-event-${eventName}`, 'catalogs', 'consent-Marketing'];
    for (const [i, finding] of contextFindings.entries()) {
      await act(async () => container.querySelector<HTMLButtonElement>(`#current-finding-${finding.id} th button`)!.click());
      const context = container.querySelector(`#current-finding-${finding.id}-details`)!;
      if (i < expected.length) {
        const link = context.querySelector<HTMLAnchorElement>('a')!;
        expect(link.getAttribute('href')).toBe('#' + expected[i]);
        await act(async () => link.click()); expect(navigate).toHaveBeenLastCalledWith(expected[i]);
      } else {
        expect(context.querySelector('a')).toBeNull(); expect(context.textContent).toContain('Unresolved property');
      }
    }
    expect(requested).toEqual([]);
  });
});

/** T-5-42: the findings table on the portal's QA view, reached by path or by an old single-page link. */
const PORTAL = '/shared/public-fixture';
const mountPortal = async (url: string) => {
  window.history.replaceState(null, '', url);
  await mount(<SharedProject token="public-fixture" />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
};
// Effects flush when the first act ends; the second lets their scroll frame run.
const changeHash = async (hash: string) => {
  await act(async () => { window.history.replaceState(null, '', window.location.pathname + hash); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
};

describe('Findings on the portal QA view (T-5-42)', () => {
  it('reloads a copied current-finding link on the QA view and scrolls to the stable row', async () => {
    await mountPortal(`${PORTAL}#current-finding-finding-project`);
    expect(window.location.pathname).toBe(`${PORTAL}/qa`);
    expect(window.location.hash).toBe('#current-finding-finding-project');
    const row = container.querySelector('#current-finding-finding-project')!;
    expect(row).not.toBeNull();
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(row);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('loads findings only on the QA view, opens a finding-comment deep link there and keeps Markdown and downloads', async () => {
    await mountPortal(PORTAL);
    expect(requested.some(address => address.endsWith('/findings.json'))).toBe(false);
    await changeHash(commentFragment({ entityType: 'finding', entityId: first.id, threadId: comment.id, commentId: comment.id }));
    expect(window.location.pathname).toBe(`${PORTAL}/qa`);
    expect(container.querySelector('[aria-label="Individual finding discussions table"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Exact finding discussion');
    expect(container.querySelector('a[href$="/tracking-document.json"]')).not.toBeNull();
    expect(container.querySelector('a[href$="/documentation.html"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy findings as Markdown"]')!.click());
    expect(copy).toHaveBeenCalledWith(findingsSummaryToMarkdown(computeFindingsSummary([event], [second])));
    expect(requested.filter(address => address.endsWith('/findings.json'))).toHaveLength(1);
    expect(requested.every(address => address.includes('/api/shared/public-fixture'))).toBe(true);
    expect(requested.some(address => address.endsWith('/tracking-document.json'))).toBe(false);
  });
  it('uses old comparison and event finding links to filter the single table and keeps the detailed summary closed', async () => {
    await mountPortal(`${PORTAL}#findings-definition_vs_observations`);
    expect(window.location.pathname).toBe(`${PORTAL}/qa`);
    const details = Array.from(container.querySelectorAll('details')).find(detail => detail.querySelector('summary')?.textContent === 'Detailed findings summary')!;
    expect(details.open).toBe(false);
    expect(container.querySelector<HTMLSelectElement>('select[id$="-comparison"]')!.value).toBe('definition_vs_observations');
    await changeHash(`#findings-definition_vs_observations-event-${eventName}`);
    const table = container.querySelector('[aria-label="Individual finding discussions table"]')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.querySelector('tbody tr')!.id).toBe(`current-finding-${first.id}`);
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(table.querySelector('tbody tr'));
    expect(container.querySelectorAll('[aria-label="Individual finding discussions table"]')).toHaveLength(1);
    expect(details.open).toBe(false);
  });
  it.each(['initial link', 'hash change'] as const)('lands a top-level #findings %s at totals and filters, clearing prior filters', async source => {
    await mountPortal(source === 'initial link' ? `${PORTAL}#findings` : `${PORTAL}/qa`);
    if (source === 'hash change') {
      const control = container.querySelector<HTMLSelectElement>('select[id$="-event"]')!;
      await act(async () => { control.value = '__project__'; control.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(container.querySelector(`#current-finding-${first.id}`)).toBeNull();
      vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
      await changeHash('#findings');
    }
    const section = container.querySelector<HTMLElement>('#findings')!;
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(section);
    const totals = section.querySelector('[aria-label="Current finding totals"]')!;
    const search = section.querySelector<HTMLInputElement>('input[type="search"]')!;
    const firstRow = section.querySelector(`#current-finding-${first.id}`)!;
    expect(totals.textContent).toContain('2 open findings');
    expect(search.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(section.querySelectorAll<HTMLSelectElement>('select')).every(select => select.value === '')).toBe(true);
    expect(section.querySelector('table tbody')!.querySelectorAll('tr')).toHaveLength(2);
  });
  it('reveals copied row and comment targets despite different active filters, and safely handles stale row hashes', async () => {
    await mountPortal(`${PORTAL}/qa`);
    const eventSelect = container.querySelector<HTMLSelectElement>('select[id$="-event"]')!;
    await act(async () => { eventSelect.value = '__project__'; eventSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector(`#current-finding-${first.id}`)).toBeNull();
    await changeHash(`#current-finding-${first.id}`);
    expect(container.querySelector(`#current-finding-${first.id}`)).not.toBeNull();
    await act(async () => { eventSelect.value = '__project__'; eventSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    await changeHash(commentFragment({ entityType: 'finding', entityId: first.id, threadId: comment.id, commentId: comment.id }));
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Exact finding discussion');
    expect(container.querySelector(`#current-finding-${first.id}`)).not.toBeNull();
    await changeHash('#current-finding-stale-id');
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(container.querySelector('#current-findings-table'));
    expect(requested.every(address => address.includes('/api/shared/public-fixture'))).toBe(true);
  });
  it('has no Expand all / Collapse all and no scroll spy; filter controls and downloads keep their native semantics', async () => {
    const observed: string[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      observe(element: HTMLElement) { observed.push(element.id); }
      disconnect() {}
    });
    await mountPortal(`${PORTAL}/qa`);
    expect(container.querySelector('button[aria-label^="Expand all"], button[aria-label^="Collapse all"]')).toBeNull();
    expect(observed).toEqual([]);
    expect(container.querySelector('#findings-definition_vs_observations')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[id$="-search"]')!.className).toContain('h-10');
    expect(Array.from(container.querySelectorAll<HTMLSelectElement>('select[id*="-severity"], select[id*="-event"], select[id*="-comparison"]')).every(control => control.className.includes('h-10'))).toBe(true);
    const downloads = ['/tracking-document.json', '/documentation.html'].map(suffix => container.querySelector<HTMLAnchorElement>(`a[href$="${suffix}"]`)!);
    expect(downloads.every(link => link.tagName === 'A')).toBe(true);
    expect(container.querySelector('button a')).toBeNull();
  });
  it('wires project finding Property and Catalog context links to their portal views', async () => {
    const propertyFinding = { ...second, id: 'property-integration', property_id: 'property-id', property: 'customer_name' };
    const catalogFinding = { ...second, id: 'catalog-integration', kind: 'catalog_searchable_limit' };
    servedDoc = { ...doc, unattached_findings: [propertyFinding, catalogFinding],
      properties: [{ property_id: 'property-id', name: 'customer_name', category: 'customer', description: null, data_type: 'string', data_formats: [], definitions: [] }],
      catalogs: [{ id: 'catalog-id', name: 'Products', mapping_role: null, status: 'planned', fields: [] }] };
    for (const [id, path, heading] of [['property-integration', `${PORTAL}/properties/customer_name`, 'customer_name'], ['catalog-integration', `${PORTAL}/catalogs`, 'Catalogs']]) {
      await mountPortal(`${PORTAL}/qa`);
      await act(async () => container.querySelector<HTMLButtonElement>(`#current-finding-${id} th button`)!.click());
      const link = container.querySelector<HTMLAnchorElement>(`#current-finding-${id}-details a`)!;
      expect(link.getAttribute('href')).toBe(path);
      await act(async () => { link.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
      expect(window.location.pathname).toBe(path);
      expect(container.querySelector('h1')!.textContent).toContain(heading);
      await act(async () => root.unmount()); root = createRoot(container);
    }
    expect(requested.every(address => address.includes('/api/shared/public-fixture'))).toBe(true);
  });
  it('lists a bounded plain use case preview and shows the full Markdown only on its page and in the copy', async () => {
    const narrative = '# Flow\n\n' + 'Customer data with `customer_email` and **important** detail. '.repeat(12) + '\n\n- Final narrative conclusion';
    const uc: TrackingDocumentUseCase = { id: 'usecase-preview', name: 'Welcome', code: 'UC-01', type: 'marketing', status: 'planned',
      documentation_url: null, narrative, requirements: [] };
    servedDoc = { ...doc, use_cases: [uc] };
    await mountPortal(`${PORTAL}/use-cases`);
    const row = container.querySelector<HTMLTableRowElement>('[data-testid="use-case-row"]')!;
    const description = row.querySelector('span[title]')!;
    expect(Array.from(description.textContent!).length).toBeLessThanOrEqual(200);
    expect(description.textContent).toContain('Flow Customer data with customer_email');
    expect(row.querySelector('h1,h2,ul,ol,p')).toBeNull();
    expect(row.textContent).not.toContain('Final narrative conclusion');
    await act(async () => { Array.from(row.querySelectorAll('button')).find(button => button.textContent === 'Welcome')!.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(window.location.pathname).toBe(`${PORTAL}/use-cases/UC-01`);
    expect(container.textContent).toContain('Final narrative conclusion');
    expect(container.querySelector('main h1')!.textContent).toContain('UC-01');
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy use case Welcome as Markdown"]')!.click());
    expect(copy).toHaveBeenCalledWith(useCaseToMarkdown(uc));
    expect(narrative).toBe(uc.narrative);
  });
});

/**
 * T-5-42: the QA view renders at most PORTAL_ROW_LIMIT findings, then "Show N more". 141 findings:
 * 120 on event_a (numbers 1-120), 20 errors on the long-named event (numbers 121-139, and the
 * commented `first` as number 140 on row 140), and the unattached warning (row 141).
 */
describe('Findings past the portal row limit (T-5-42)', () => {
  const many = Array.from({ length: 120 }, (_, i) => finding(`f-${i + 1}`, i + 1));
  const later = [...Array.from({ length: 19 }, (_, i) => finding(`f-${i + 121}`, i + 121)), { ...first, finding_sequence: 140 }];
  const bigDoc = () => ({ ...doc, events: [emptyEventCard({ id: 'event-a', name: 'event_a', findings: many }), { ...event, findings: later }] });
  const rowsOf = () => container.querySelectorAll('[aria-label="Individual finding discussions table"] tbody tr[id^="current-finding-"]');
  beforeEach(() => { servedDoc = bigDoc(); });

  it(`renders ${PORTAL_ROW_LIMIT} rows, adds more on request, and filters over every finding`, async () => {
    await mountPortal(`${PORTAL}/qa`);
    expect(rowsOf()).toHaveLength(PORTAL_ROW_LIMIT);
    expect(container.querySelector(`#current-finding-${first.id}`)).toBeNull();
    const more = container.querySelector('[data-testid="finding-show-more"]')!;
    expect(more.textContent).toContain(`Showing ${PORTAL_ROW_LIMIT} of 141 findings.`);
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Showing 141 of 141 findings');
    // A filter reaches a finding past the window.
    const control = container.querySelector<HTMLSelectElement>('select[id$="-severity"]')!;
    await act(async () => { control.value = 'warning'; control.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(Array.from(rowsOf()).map(row => row.id)).toEqual([`current-finding-${second.id}`]);
    await act(async () => { control.value = ''; control.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="finding-show-more"] button')!.click());
    expect(rowsOf()).toHaveLength(141);
    expect(container.querySelector('[data-testid="finding-show-more"]')).toBeNull();
  });

  it('opens a copied #current-finding link to row 140: pinned, marked, expanded and scrolled to', async () => {
    await mountPortal(`${PORTAL}#current-finding-${first.id}`);
    expect(window.location.pathname).toBe(`${PORTAL}/qa`);
    const row = container.querySelector<HTMLElement>(`#current-finding-${first.id}`)!;
    expect(row).not.toBeNull();
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.className).toContain('bg-amber-50');
    expect(container.querySelector(`#current-finding-${first.id}-details`)).not.toBeNull();
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(row);
    // Pinned after the first rows, not by rendering every row above it.
    expect(rowsOf()).toHaveLength(PORTAL_ROW_LIMIT + 1);
    expect(rowsOf()[PORTAL_ROW_LIMIT].id).toBe(`current-finding-${first.id}`);
    expect(container.querySelector('[data-testid="finding-show-more"]')!.textContent).toContain(`Showing ${PORTAL_ROW_LIMIT} of 141 findings.`);
  });

  it('follows a hash change to a finding past the window while the QA view is open', async () => {
    await mountPortal(`${PORTAL}/qa`);
    expect(container.querySelector(`#current-finding-${first.id}`)).toBeNull();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    await changeHash(`#current-finding-${first.id}`);
    const row = container.querySelector(`#current-finding-${first.id}`)!;
    expect(row).not.toBeNull();
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(row);
  });

  it('filters an old findings-<comparison>-event-<name> link to that event, whose findings sit past row 100', async () => {
    await mountPortal(`${PORTAL}#findings-definition_vs_observations-event-${eventName}`);
    expect(rowsOf()).toHaveLength(20);
    expect(container.querySelector(`#current-finding-${first.id}`)).not.toBeNull();
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(container.querySelector('#current-finding-f-121'));
  });

  it('opens a comment deep link on a finding past the window, with its row rendered and marked', async () => {
    await mountPortal(PORTAL + commentFragment({ entityType: 'finding', entityId: first.id, threadId: comment.id, commentId: comment.id }));
    expect(window.location.pathname).toBe(`${PORTAL}/qa`);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Exact finding discussion');
    const row = container.querySelector(`#current-finding-${first.id}`)!;
    expect(row).not.toBeNull();
    expect(row.getAttribute('aria-current')).toBe('true');
  });
});

