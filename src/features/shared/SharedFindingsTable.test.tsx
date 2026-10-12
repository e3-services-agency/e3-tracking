// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedFindingsTable } from './SharedFindingsTable';
import { SharedProject } from '@/src/pages/SharedProject';
import { emptyEventCard } from '@/src/features/comments/commentLinkFixtures';
import { commentFragment } from '@/src/features/comments/commentLinks';
import { computeFindingsSummary } from '@/src/domain/document/findingsSummary';
import { findingsSummaryToMarkdown } from '@/src/domain/document/markdown';
import type { EventCardFinding } from '@/src/domain/document/trackingDocument';
import type { CommentPanelRow } from '@/src/features/comments/CommentsPanel';
vi.mock('@/src/features/shared-auth/SharedGoogleSignIn', () => ({ SharedGoogleSignIn: () => null }));
let root: Root;
let container: HTMLDivElement;
let copy: ReturnType<typeof vi.fn>;
let requested: string[];
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
  copy = vi.fn().mockResolvedValue(undefined); requested = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  window.history.replaceState(null, '', '/tracking-plan/shared/public-fixture');
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const address = String(url); requested.push(address);
    const value = address.endsWith('/tracking-document.json') ? doc : address.endsWith('/comments') ? comments : address.endsWith('/qa-reports') ? []
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
  it('uses the shared semantic table, full wrapping content and truthful open-only status', async () => {
    await mount(table());
    expect(Array.from(container.querySelectorAll('thead th')).map(th => th.textContent)).toEqual(['Number', 'Severity', 'Event', 'Message', 'Status', 'Actions']);
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
    expect(rows[0].children[4].textContent).toBe('Open'); expect(rows[1].children[4].textContent).toBe('Open');
    expect(rows[0].children[5].querySelector('div')!.className).toContain('flex-wrap');
    expect(requested).toEqual([]); // No new status/private-data lookup.
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
  });
});
