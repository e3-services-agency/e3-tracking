import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import { generateProjectDocumentationHtml } from './export.service';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('generateProjectDocumentationHtml', () => {
  it('renders both events with the property table headers and a codegen snippet', async () => {
    const totalPrice = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    });

    const purchase = EventDAL.createEvent(projectId, {
      name: 'purchase',
      description: 'Fires on order confirmation.',
      purpose: 'Track completed purchases.',
      trigger_text: 'Order confirmation page loads.',
      identity_note: 'Uses the logged-in customer id.',
    });
    EventDAL.attachPropertyToEvent(projectId, purchase.id, {
      property_id: totalPrice.id,
      required: true,
    });

    EventDAL.createEvent(projectId, { name: 'checkout_started' });

    const html = await generateProjectDocumentationHtml(projectId);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('purchase');
    expect(html).toContain('checkout_started');

    // Property table headers (buildPropertyDetailsTable contract).
    expect(html).toContain('<th>Property</th>');
    expect(html).toContain('<th>Required</th>');
    expect(html).toContain('<th>Payload key</th>');
    expect(html).toContain('total_price');

    // T-1-03/T-1-04 integration WARNING 4: `required: link.required` must reach
    // `toAttachedPropertyForCodegen` (no `presence`), so a `required: true` link renders as
    // "Required" in the property table, not "Optional".
    expect(html).toMatch(/<td>total_price<\/td>\s*<td>Required<\/td>/);
    expect(html).not.toMatch(/<td>total_price<\/td>\s*<td>Optional<\/td>/);

    // At least one codegen snippet (dataLayer) rendered for the event with a required property,
    // and it must not be pushed under the "// Optional:" comment.
    expect(html).toContain('window.dataLayer.push');
    expect(html).toContain('total_price: 123');
    expect(html).not.toMatch(/\/\/ Optional:[\s\S]*total_price/);
  });

  it('renders an empty-project doc without throwing', async () => {
    const html = await generateProjectDocumentationHtml(projectId);
    expect(html).toContain('No events defined yet.');
  });
});
