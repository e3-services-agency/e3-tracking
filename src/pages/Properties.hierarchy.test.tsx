// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Properties } from './Properties';
import { useStore } from '@/src/store';

vi.mock('@/src/features/projects/context/ProjectShellContext', () => ({ useProjectShell: () => ({ activeProjectId: 'project', hasValidProjectContext: true }) }));
// Exercise the page's actual open/closed state without animation or unrelated editor requests.
vi.mock('@/src/components/ui/Sheet', () => ({ Sheet: ({ isOpen, title }: { isOpen: boolean; title: string }) => isOpen ? <div role="dialog" aria-label={title} /> : null }));

const longName = `zulu_${'long_property_name_'.repeat(12)}`;
const definition = (id: string, name = 'general') => ({ id, name, description: `Meaning of ${name}`, using_events: [] });
const property = (id: string, name: string, definitions: ReturnType<typeof definition>[], scope = 'event') => ({
  id, project_id: 'project', name, scope, description: 'Description', category: null, notes: null,
  data_type: 'string', data_formats_json: [], pii: false, property_type: 'custom',
  allowed_values_json: [], priority: null, status: null, bloomreach_customer_property: null,
  definitions, used_by_events: [],
});
const rows = [property('long', longName, [definition('general-long')]), property('action', 'action', [definition('general-action'), definition('specific', 'consent action')]), property('customer', 'loyalty_score', [definition('general-customer')], 'customer')];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement;
let root: Root;
let clipboard: ReturnType<typeof vi.fn>;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('isSecureContext', true);
  clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('/properties') ? json(rows) : (String(url).endsWith('/bundles') || String(url).endsWith('/comments')) ? json([]) : json({ standard_event_additions_json: [] })));
  useStore.setState({ activeProjectId: 'project', selectedItemIdToEdit: null });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
const mount = async () => { await act(async () => root.render(<Properties />)); };
const propertyRow = (name: string) => [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((row) => row.querySelector(`[aria-label="Copy name ${name}"]`))!;
const countControl = (name: string) => [...propertyRow(name).querySelectorAll<HTMLButtonElement>('button')].find((button) => /^\d+ definitions?$/.test(button.textContent?.trim() ?? ''))!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const allControl = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => /^(Expand|Collapse) all definitions$/.test(button.textContent ?? ''))!;
const names = () => [...container.querySelectorAll<HTMLButtonElement>('tbody [aria-label^="Copy name "]')].map((button) => button.getAttribute('aria-label')!.slice('Copy name '.length));

describe('internal property definition counts and hierarchy', () => {
  it('counts general, toggles a single-definition inline row, and shares state with the chevron without opening the drawer', async () => {
    await mount();
    expect(countControl(longName).textContent).toBe('1 definition');
    expect(countControl('action').textContent).toBe('2 definitions');
    expect(countControl('loyalty_score').textContent).toBe('1 definition');
    expect(container.textContent).not.toContain('Meaning of general');
    await click(countControl(longName));
    expect(countControl(longName).getAttribute('aria-expanded')).toBe('true');
    expect(propertyRow(longName).nextElementSibling?.textContent).toContain('Meaning of general');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(propertyRow(longName).cells[0].querySelector('button')!);
    expect(countControl(longName).getAttribute('aria-expanded')).toBe('false');
    expect(propertyRow(longName).nextElementSibling?.textContent).not.toContain('Meaning of general');
    await click(countControl('action'));
    expect(container.textContent).toContain('Meaning of consent action');
    await click(countControl('action'));
    expect(container.textContent).not.toContain('Meaning of consent action');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the exact long name and copy action, while the Definitions shortcut and ordinary row click still edit', async () => {
    await mount();
    const row = propertyRow(longName);
    expect(row.cells[1].textContent).toContain(longName);
    expect(row.cells[1].querySelector('span > span')!.className).not.toContain('truncate');
    await click(row.querySelector<HTMLButtonElement>(`[aria-label="Copy name ${longName}"]`)!);
    expect(clipboard).toHaveBeenCalledWith(longName);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(row.querySelector<HTMLButtonElement>('[aria-label="Definitions (1)"]')!);
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Edit Property');
    await act(async () => root.unmount()); root = createRoot(container);
    await mount();
    await click(propertyRow('action').cells[2]);
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Edit Property');
  });

  it('preserves expand-all, category collapse, sorting and filtering around inline definition state', async () => {
    await mount();
    await click(allControl());
    expect(container.textContent).toContain('Meaning of consent action');
    expect(countControl(longName).getAttribute('aria-expanded')).toBe('true');
    await click(container.querySelector<HTMLButtonElement>('[data-testid="property-group-event"] button')!);
    expect(names()).toEqual(['loyalty_score']);
    await click(container.querySelector<HTMLButtonElement>('[data-testid="property-group-event"] button')!);
    expect(countControl(longName).getAttribute('aria-expanded')).toBe('true');
    await click(allControl());
    expect(container.textContent).not.toContain('Meaning of general');
    await click(container.querySelector<HTMLButtonElement>('th[aria-sort] button')!);
    expect(names()).toEqual(['loyalty_score', 'action', longName]);
    const filter = container.querySelector<HTMLSelectElement>('[aria-label="Filter by category"]')!;
    await act(async () => { filter.value = 'event'; filter.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(names()).toEqual(['action', longName]);
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search properties"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'action');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(names()).toEqual(['action']);
    expect(countControl('action').textContent).toBe('2 definitions');
    await click(allControl());
    expect(container.textContent).toContain('Meaning of consent action');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
