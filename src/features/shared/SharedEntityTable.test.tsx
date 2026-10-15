import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedEntityTable, SharedEntityRow } from './SharedEntityTable';

const name = 'booking_flight_shopping_with_a_long_descriptive_entity_name';
const description = 'Full description with multiple sentences.\nA second line remains visible, including the final words.';
function render(expanded: boolean) {
  return renderToStaticMarkup(<SharedEntityTable label="Events" columns={[{ label: 'Name', width: '30%' }, { label: 'Description', width: '60%' }, { label: 'Actions', width: '10%' }]}>
    <SharedEntityRow anchor="event-long" name={name} kind="event" expanded={expanded} onToggle={() => {}} cells={[description, <button key="copy">Copy</button>]}>
      <section>Expanded event details</section>
    </SharedEntityRow>
  </SharedEntityTable>);
}
describe('Shared entity table accessibility and readable content', () => {
  it('keeps full names/descriptions in independent semantic cells and a labelled scrolling region', () => {
    const html = render(false);
    expect(html).toContain('role="region" aria-label="Events table" tabindex="0"');
    expect(html).toContain('<caption class="sr-only">Events</caption>');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain(name);
    expect(html).toContain(description);
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).not.toContain('truncate');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Expanded event details');
  });
  it('places inline detail content in a spanning row controlled by the disclosure button', () => {
    const html = render(true);
    expect(html).toContain('aria-expanded="true" aria-controls="event-long-details"');
    expect(html).toContain('<td id="event-long-details" colSpan="3"');
    expect(html).toContain('Expanded event details');
    expect(html).toContain('id="event-long"');
  });
  it('renders a plain row without a false disclosure when no toggle is provided', () => {
    const html = renderToStaticMarkup(<SharedEntityRow name={name} kind="catalog" cells={[description]} />);
    expect(html).not.toContain('aria-expanded');
    expect(html).toContain('data-entity-icon="catalog"');
  });
});
