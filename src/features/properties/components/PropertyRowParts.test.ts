import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DefinitionSubRows, UsedByModal, toggleAll, toggleId } from './PropertyRowParts';
import { DefinitionCountBadge } from '@/src/components/ui/DefinitionCountBadge';

const defs = [
  { id: 'd1', name: 'general', description: 'The action', using_events: [{ id: 'e1', name: 'cart_update' }] },
  { id: 'd2', name: 'consent action', description: null, using_events: [] },
];

describe('Properties expand/collapse state (T-4-26)', () => {
  it('toggles one id and expands/collapses all', () => {
    const one = toggleId(new Set(), 'a');
    expect([...one]).toEqual(['a']);
    expect(toggleId(one, 'a').size).toBe(0);
    expect([...toggleAll(new Set(), ['a', 'b'])].sort()).toEqual(['a', 'b']);
    expect(toggleAll(new Set(['a', 'b']), ['a', 'b']).size).toBe(0);
    expect(toggleAll(new Set(['a']), []).size).toBe(0);
  });
});

describe('DefinitionSubRows', () => {
  it('renders one variant-style sub-row per definition with using events', () => {
    const html = renderToStaticMarkup(
      React.createElement('table', null, React.createElement('tbody', null,
        React.createElement(DefinitionSubRows, { definitions: defs, colSpan: 9, onOpenEvent: () => {} })))
    );
    expect(html.match(/bg-gray-50 text-xs/g)).toHaveLength(2);
    expect(html).toContain('colSpan="9"');
    expect(html).toContain('pl-24');
    expect(html).toContain('cart_update');
    expect(html).toContain('not used by an event');
  });
});

describe('UsedByModal', () => {
  it('is an accessible dialog listing event, role and chosen definition', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsedByModal, {
        propertyName: 'action',
        events: [{ id: 'e1', name: 'cart_update', role: 'discriminator', definition_id: 'd1' }],
        definitions: defs,
        onOpenEvent: () => {},
        onClose: () => {},
      })
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('cart_update');
    expect(html).toContain('discriminator');
    expect(html).toContain('general');
  });
  it('says so when no event uses the property', () => {
    const html = renderToStaticMarkup(
      React.createElement(UsedByModal, { propertyName: 'x', events: [], definitions: [], onOpenEvent: () => {}, onClose: () => {} })
    );
    expect(html).toContain('No event uses this property');
  });
});

describe('DefinitionCountBadge shared contract', () => {
  it.each([[0, '0 definitions'], [1, '1 definition'], [12, '12 definitions']])('labels %i without adding an interactive control', (count, label) => {
    const html = renderToStaticMarkup(React.createElement(DefinitionCountBadge, { count: Number(count) }));
    expect(html).toContain(label);
    expect(html).toMatch(/^<span /);
    expect(html).not.toMatch(/<button|role=|tabindex=/i);
  });
});
