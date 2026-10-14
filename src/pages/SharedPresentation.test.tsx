// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedProject, SharedPropertyRow } from './SharedProject';
import { SharedEntityTable } from '../features/shared/SharedEntityTable';
import type { TrackingDocumentCustomerProperty } from '../domain/document/trackingDocument';

vi.mock('../features/shared-auth/SharedGoogleSignIn', () => ({
  SharedGoogleSignIn: () => <div aria-label="Comment identity">Identity controls</div>,
}));
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove(); root = undefined; container = undefined;
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
async function mount(element: React.ReactNode) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(element); });
}
const longName = 'reservation_passenger_airport_departure_full_property_name';
function property(count: number): TrackingDocumentCustomerProperty {
  return { property_id: 'public-property', category: 'customer', name: longName,
    data_type: 'string', data_formats: [], pii: false, bloomreach_customer_property: null,
    description: 'Complete public description, including the final words.',
    definitions: Array.from({ length: count }, (_, i) => ({ id: `def-${i}`,
      name: i === 0 ? 'general' : `public_definition_${i}`, description: `Definition ${i}`,
      allowed_values: null, formats: [], example_values: null })) };
}
function PropertyHarness({ count }: { count: number }) {
  const [expanded, setExpanded] = useState(false);
  return <SharedEntityTable label="Properties" columns={[{ label: 'Name' }, { label: 'Description' }, { label: 'Category' }, { label: 'Type' }, { label: 'Actions' }]}>
    <SharedPropertyRow property={property(count)} anchor="property-public" expanded={expanded}
      onToggle={() => setExpanded(value => !value)} renderRef={(_, label) => label}
      commentButton={<button type="button">Comment action</button>} />
  </SharedEntityTable>;
}

describe('Shared property count and hierarchy', () => {
  it.each([1, 3])('shows all %i permitted definitions and toggles by its noninteractive badge', async count => {
    await mount(<PropertyHarness count={count} />);
    const disclosure = container!.querySelector<HTMLButtonElement>('th[scope="row"] button')!;
    const badge = Array.from(disclosure.querySelectorAll('span')).find(el => el.textContent?.trim() === `${count} ${count === 1 ? 'definition' : 'definitions'}`)!;
    expect(badge).toBeDefined();
    expect(disclosure.textContent).toContain(longName);
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.querySelector('button, a, input')).toBeNull();
    expect(container!.querySelector('#property-public-details')).toBeNull();
    await act(async () => { badge.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure.getAttribute('aria-controls')).toBe('property-public-details');
    const detail = container!.querySelector('#property-public-details')!;
    expect(detail.textContent).toContain('general');
    for (let i = 1; i < count; i++) expect(detail.textContent).toContain(`public_definition_${i}`);
    expect(detail.querySelector('table tbody')!.children).toHaveLength(count);
    expect(container!.querySelector('th[scope="row"]')!.className).toContain('pl-8');
    expect(detail.querySelector('table tbody')!.querySelector('td')!.className).toContain('pl-20');
    expect(container!.textContent).toContain('Complete public description, including the final words.');
    await act(async () => { badge.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container!.querySelector('#property-public-details')).toBeNull();
  });
  it('keeps comment and copy actions separate from the property expansion control', async () => {
    await mount(<PropertyHarness count={1} />);
    const comment = Array.from(container!.querySelectorAll('button')).find(button => button.textContent === 'Comment action')!;
    await act(async () => { comment.click(); });
    expect(container!.querySelector('th button')!.getAttribute('aria-expanded')).toBe('false');
    expect(comment.closest('td')).not.toBeNull();
    const markdown = container!.querySelector<HTMLButtonElement>(`button[aria-label="Copy property ${longName} as Markdown"]`)!;
    expect(markdown.title).toBe(`Copy property ${longName} as Markdown`);
    expect(markdown.querySelector('span')!.className).toBe('sr-only');
    // Secondary actions sit in the hover-revealed group; the cell keeps its width so hovering never shifts columns.
    expect(markdown.parentElement!.className).toContain('row-actions');
    expect(markdown.parentElement!.className).toContain('flex-nowrap');
    expect(markdown.parentElement!.parentElement!.className).toContain('min-w-[148px]');
    expect(container!.querySelector('button button')).toBeNull();
  });
});

describe('Shared presentation keeps the public document capabilities', () => {
  it('bundles the existing agency logo bytes without widening any public route', () => {
    const publicLogo = readFileSync(path.resolve(__dirname, '../../public/branding/agency-logo.png'));
    const bundledLogo = readFileSync(path.resolve(__dirname, '../assets/agency-logo.png'));
    expect(bundledLogo.equals(publicLogo)).toBe(true);
  });
  it('uses agency branding once while preserving exports, global expansion and public-only requests', async () => {
    const p = property(1);
    const doc = { project: { key: 'public', name: 'Shared project', naming_convention: 'snake_case' },
      properties: [p], event_properties: [], events: [], catalogs: [], identity_rules: [],
      use_cases: [], consent_categories: [], standard_event_mappings: [], unattached_findings: [],
      findings_summary: { open: { error: 0, warning: 0, info: 0 } } };
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const address = String(url); requested.push(address);
      const value = address.endsWith('/tracking-document.json') ? doc : (address.endsWith('/comments') || address.endsWith('/qa-reports')) ? [] : {
        project: { name: 'Shared project complete name', client_logo_path: null },
        client: { name: 'Public client' }, access: 'read', generated_at: null,
      };
      return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    await mount(<SharedProject token="public-share-fixture" />);
    expect(container!.querySelector('header')!.textContent).toContain('Tracking Portal');
    expect(container!.querySelector('header img')!.getAttribute('alt')).toBe('E3');
    expect(container!.querySelector('h1')!.textContent).toBe('Shared project complete name');
    expect(container!.querySelectorAll('[aria-label="Comment identity"]')).toHaveLength(1);
    const main = container!.querySelector('main')!;
    expect(main.querySelector('a[href$="/tracking-document.json"]')).not.toBeNull();
    expect(main.querySelector('a[href$="/documentation.html"]')).not.toBeNull();
    const expand = main.querySelector<HTMLButtonElement>('button[aria-label="Expand all rows"]')!;
    const collapse = main.querySelector<HTMLButtonElement>('button[aria-label="Collapse all rows"]')!;
    await act(async () => { expand.click(); });
    expect(main.querySelector('[id$="-details"]')!.textContent).toContain('general');
    await act(async () => { collapse.click(); });
    expect(main.querySelector('[id$="-details"]')).toBeNull();
    expect(container!.textContent).not.toMatch(/Add Property|Delete|Edit Property|Internal Project/);
    expect(requested.every(address => address.includes('/api/shared/public-share-fixture'))).toBe(true);
    expect(requested).toHaveLength(4);
    expect(requested.filter(address => address.endsWith('/qa-reports'))).toHaveLength(1);
  });
});
