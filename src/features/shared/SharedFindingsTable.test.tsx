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
  window.history.replaceState(null, '', '/tracking-plan/shared/public-fixture');
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const address = String(url); requested.push(address);
    const value = address.endsWith('/tracking-document.json') ? servedDoc : address.endsWith('/comments') ? comments : address.endsWith('/qa-reports') ? []
      : address.endsWith('/history') ? { current_status: 'open', current_acknowledged: false, appearances: [] }
      : address.endsWith('/identity') ? { name: 'Blue Fox', kind: 'guest', verified: false, name_chosen: false }
      : { project: { name: 'Shared project', client_logo_path: null }, client: { name: 'Public client' }, access: 'read' };
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
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
  it('reloads a copied current-finding hash and scrolls to the stable row', async () => {
    window.history.replaceState(null, '', '#current-finding-finding-project');
    await mount(<SharedProject token="public-fixture" />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    const row = container.querySelector('#current-finding-finding-project')!;
    expect(row).not.toBeNull();
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(row);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
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
  it('integrates existing sidebar anchors, exports and a finding-comment deep link without changing Markdown', async () => {
    window.history.replaceState(null, '', commentFragment({ entityType: 'finding', entityId: first.id, threadId: comment.id, commentId: comment.id }));
    await mount(<SharedProject token="public-fixture" />);
    expect(container.querySelector('[aria-label="Individual finding discussions table"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Exact finding discussion');
    expect(container.querySelector(`[id="findings-definition_vs_observations-event-${eventName}"]`)).not.toBeNull();
    expect(container.querySelector('a[href$="/tracking-document.json"]')).not.toBeNull();
    expect(container.querySelector('a[href$="/documentation.html"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy findings as Markdown"]')!.click());
    expect(copy).toHaveBeenCalledWith(findingsSummaryToMarkdown(computeFindingsSummary([event], [second])));
    expect(requested.every(address => address.includes('/api/shared/public-fixture'))).toBe(true);
  });  it('uses legacy sidebar comparison/event links to filter the single table and preserves the closed detailed summary', async () => {
    await mount(<SharedProject token="public-fixture" />);
    const details = Array.from(container.querySelectorAll('details')).find(detail => detail.querySelector('summary')?.textContent === 'Detailed findings summary')!;
    expect(details.open).toBe(false);
    const group = container.querySelector<HTMLAnchorElement>('nav a[href="#findings-definition_vs_observations"]')!;
    await act(async () => group.click());
    expect(container.querySelector<HTMLSelectElement>('select[id$="-comparison"]')!.value).toBe('definition_vs_observations');
    const leaf = container.querySelector<HTMLAnchorElement>(`nav a[href="#findings-definition_vs_observations-event-${eventName}"]`)!;
    await act(async () => leaf.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    const table = container.querySelector('[aria-label="Individual finding discussions table"]')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.querySelector('tbody tr')!.id).toBe(`current-finding-${first.id}`);
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toContain(table.querySelector('tbody tr'));
    expect(container.querySelectorAll('[aria-label="Individual finding discussions table"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="project-findings"]')).toBeNull();
    expect(details.open).toBe(false);
  });
  it('reveals copied row and comment targets despite different active filters, and safely handles stale row hashes', async () => {
    await mount(<SharedProject token="public-fixture" />);
    const eventSelect = container.querySelector<HTMLSelectElement>('select[id$="-event"]')!;
    await act(async () => { eventSelect.value = '__project__'; eventSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector(`#current-finding-${first.id}`)).toBeNull();
    const changeHash = async (hash: string) => { await act(async () => {
      window.history.replaceState(null, '', hash); window.dispatchEvent(new HashChangeEvent('hashchange'));
      await new Promise(resolve => setTimeout(resolve, 60));
    }); };
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
  it('keeps every header and section text control at the same size with native button/link semantics', async () => {
    await mount(<SharedProject token="public-fixture" />);
    const global = container.querySelector<HTMLButtonElement>('button[aria-label="Expand all rows"]')!;
    const local = container.querySelector<HTMLButtonElement>('button[aria-label="Expand all custom events"]')!;
    const links = ['#qa-reports', '/tracking-document.json', '/documentation.html'].map(suffix => container.querySelector<HTMLAnchorElement>(`main a[href$="${suffix}"]`)!);
    for (const control of [global, local, ...links]) {
      expect(control.className).toContain('h-10'); expect(control.className).toContain('text-sm');
      expect(control.className).toContain('px-4'); expect(control.className).toContain('rounded-md');
      expect(control.className).not.toMatch(/h-7|h-9|text-xs/);
    }
    expect(global.tagName).toBe('BUTTON'); expect(links.every(link => link.tagName === 'A')).toBe(true);
    expect(container.querySelector('button a')).toBeNull();
    const details = Array.from(container.querySelectorAll('details')).find(detail => detail.querySelector('summary')?.textContent === 'Detailed findings summary')!;
    await act(async () => global.click());
    expect(details.open).toBe(true);
    expect(container.querySelector(`#current-finding-${first.id}-details`)).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Collapse all rows"]')!.click());
    expect(container.querySelector(`#current-finding-${first.id}-details`)).toBeNull();
    expect(details.open).toBe(false);
  });
  it('excludes zero-height legacy aliases from scroll spy while observing the actual Findings section', async () => {
    const observed: string[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      observe(element: HTMLElement) { observed.push(element.id); }
      disconnect() {}
    });
    await mount(<SharedProject token="public-fixture" />);
    expect(observed).toContain('findings');
    expect(observed.some(id => id.startsWith('findings-'))).toBe(false);
    expect(container.querySelector('#findings-definition_vs_observations')).not.toBeNull();
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
  it('wires project finding Property and Catalog context links through the real shared page', async () => {
    const propertyFinding = { ...second, id: 'property-integration', property_id: 'property-id', property: 'customer_name' };
    const catalogFinding = { ...second, id: 'catalog-integration', kind: 'catalog_searchable_limit' };
    servedDoc = { ...doc, unattached_findings: [propertyFinding, catalogFinding],
      properties: [{ property_id: 'property-id', name: 'customer_name', category: 'customer', description: null, data_type: 'string', data_formats: [], definitions: [] }],
      catalogs: [{ id: 'catalog-id', name: 'Products', mapping_role: null, status: 'planned', fields: [] }] };
    await mount(<SharedProject token="public-fixture" />);
    for (const [id, href] of [['property-integration', '#property-customer_name'], ['catalog-integration', '#catalogs']]) {
      await act(async () => container.querySelector<HTMLButtonElement>(`#current-finding-${id} th button`)!.click());
      const link = container.querySelector<HTMLAnchorElement>(`#current-finding-${id}-details a`)!;
      expect(link.getAttribute('href')).toBe(href);
      await act(async () => link.click()); expect(window.location.hash).toBe(href);
    }
    expect(container.querySelector('#property-customer_name-details')).not.toBeNull();
    expect(requested.every(address => address.includes('/api/shared/public-fixture'))).toBe(true);
  });
  it('uses a bounded plain UC preview and shows full original Markdown only in expansion/copy', async () => {
    const narrative = '# Flow\n\n' + 'Customer data with `customer_email` and **important** detail. '.repeat(12) + '\n\n- Final narrative conclusion';
    const uc: TrackingDocumentUseCase = { id: 'usecase-preview', name: 'Welcome', code: 'UC-01', type: 'marketing', status: 'planned',
      documentation_url: null, narrative, requirements: [] };
    servedDoc = { ...doc, use_cases: [uc] };
    await mount(<SharedProject token="public-fixture" />);
    const row = container.querySelector<HTMLTableRowElement>('tr[data-shared-kind="use_case"]')!;
    const description = row.querySelector('td')!;
    expect(Array.from(description.textContent!).length).toBeLessThanOrEqual(200);
    expect(description.textContent).toContain('Flow Customer data with customer_email');
    expect(description.querySelector('h1,h2,ul,ol,p')).toBeNull();
    expect(description.textContent).not.toContain('Final narrative conclusion');
    await act(async () => row.querySelector<HTMLButtonElement>('th button')!.click());
    const expanded = document.getElementById(`${row.id}-details`)!;
    expect(expanded.textContent).toContain('Final narrative conclusion');
    expect(expanded.querySelector('h1')!.textContent).toBe('Flow');
    expect(expanded.querySelector('.whitespace-normal')).not.toBeNull();
    await act(async () => row.querySelector<HTMLButtonElement>('button[aria-label="Copy use case Welcome as Markdown"]')!.click());
    expect(copy).toHaveBeenCalledWith(useCaseToMarkdown(uc));
    expect(narrative).toBe(uc.narrative);
    expect(container.querySelector('a[href$="/tracking-document.json"]')).not.toBeNull();
    expect(container.querySelector('a[href$="/documentation.html"]')).not.toBeNull();
  });

});
