// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EventsTable } from './EventsTable';
import { PropertiesTable } from './PropertiesTable';
import { CatalogsTable } from './CatalogsTable';
import { DENSITY_STORAGE_KEY } from './viewModel';
import type { CatalogViewRow, EventViewRow, PropertyViewRow } from './types';

const event = (id: string, over: Partial<EventViewRow> = {}): EventViewRow => ({
  id,
  name: id,
  business_name: null,
  description: `About ${id}`,
  class: 'custom',
  sources: [],
  status: 'planned',
  certified: 'no',
  certified_reasons: [],
  expiration: { label: 'project default', inherited: true },
  property_count: 0,
  variants: [],
  ...over,
});
const property: PropertyViewRow = {
  id: 'p1', name: 'total_price', scope: 'event', description: null, category: 'event', category_set_by_hand: false,
  data_type: 'number', kind: 'event', enum_count: 0, priority: 'high', status: 'planned', definition_count: 1, used_by_count: 2,
};
const catalog: CatalogViewRow = { id: 'c1', name: 'products', description: null, kind: 'product', market_label: '', version: 'v1', live: false, mapping_role: null, status: null, field_count: null };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const render = async (node: React.ReactElement) => act(async () => root.render(node));
const click = async (el: Element) => act(async () => (el as HTMLElement).click());
const names = () => [...container.querySelectorAll('[data-testid="event-row"] [aria-label^="Copy name "]')].map((b) => b.getAttribute('aria-label')!.slice(10));
const headers = () => [...container.querySelectorAll('thead th')].map((th) => th.textContent?.replace(/[▲▼]/g, '').trim()).filter(Boolean);
const select = async (label: string, value: string) =>
  act(async () => {
    const el = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

describe('EventsTable', () => {
  const rows = [
    event('purchase', { status: 'implemented', certified: 'yes', class: 'custom', variants: [{ id: 'v', name: 'purchase[a=b]', description: null }] }),
    event('session_start', { class: 'sdk', certified: 'n/a' }),
    event('view_item'),
  ];

  it('filters by class (default from the page) and status, and shows no-match text', async () => {
    await render(<EventsTable rows={rows} defaultClass="custom" />);
    expect(names()).toEqual(['purchase', 'view_item']);
    await select('Filter by class', '');
    expect(names()).toEqual(['purchase', 'session_start', 'view_item']);
    await select('Filter by status', 'implemented');
    expect(names()).toEqual(['purchase']);
    await select('Filter by status', 'in_review');
    expect(container.textContent).toContain('No events match this filter.');
  });

  it('remembers the density per browser and lays the description out by density', async () => {
    await render(<EventsTable rows={rows} />);
    const toggle = (label: string) => [...container.querySelectorAll('[aria-label="Row density"] button')].find((b) => b.textContent === label)!;
    expect(toggle('Comfortable').getAttribute('aria-pressed')).toBe('true');
    await click(toggle('Compact'));
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(<EventsTable rows={rows} />);
    expect(toggle('Compact').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a row on click, not when its own controls are used, and expands variants', async () => {
    const onOpen = vi.fn();
    await render(<EventsTable rows={rows} onOpen={onOpen} rowActions={() => <button type="button">View card</button>} />);
    const row = container.querySelector<HTMLTableRowElement>('[data-testid="event-row"]')!;
    await click(row.cells[2]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await click([...row.querySelectorAll('button')].find((b) => b.textContent === 'View card')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Expand all variants')!);
    expect(container.querySelector('[data-testid="event-variant-row"]')?.textContent).toContain('purchase[a=b]');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps a comment count above zero visible outside the hover-only actions', async () => {
    await render(<EventsTable rows={rows} commentCount={(r) => (r.id === 'purchase' ? 3 : 0)} rowActions={() => <button type="button">x</button>} />);
    const counts = container.querySelectorAll('[data-testid="view-comment-count"]');
    expect(counts).toHaveLength(1);
    expect(counts[0].textContent).toBe('3');
    expect(counts[0].closest('.row-actions')).toBeNull();
    expect(counts[0].className).not.toContain('row-idle');
  });

  it('shows the empty state only when there are no rows at all', async () => {
    await render(<EventsTable rows={[]} empty={{ message: 'No events yet.' }} />);
    expect(container.textContent).toContain('No events yet.');
  });
});

describe('read-only mode', () => {
  it('drops planning columns from Properties and keeps full names', async () => {
    await render(<PropertiesTable rows={[property]} />);
    expect(headers()).toContain('Priority');
    await render(<PropertiesTable rows={[property]} readOnly />);
    expect(headers()).not.toContain('Priority');
    expect(headers()).not.toContain('Status');
    expect(container.querySelector('[aria-label="Filter by status"]')).toBeNull();
  });

  it('shows the Fields column only when the rows carry fields, and a faint dash for empty values', async () => {
    await render(<CatalogsTable rows={[catalog]} />);
    expect(headers()).not.toContain('Fields');
    expect(container.querySelectorAll('[data-testid="catalog-row"] [aria-label="none"]').length).toBeGreaterThan(0);
    await render(<CatalogsTable rows={[{ ...catalog, field_count: 4 }]} readOnly />);
    expect(headers()).toContain('Fields');
  });
});
