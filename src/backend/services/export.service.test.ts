import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as IdentityRuleDAL from '../dal/identity-rule.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as SourceDAL from '../dal/source.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
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

  it('renders the identity rules and consent categories sections with resolved names', async () => {
    const source = SourceDAL.createSource(projectId, { name: 'iOS App' });
    const loginEvent = EventDAL.createEvent(projectId, { name: 'login' });

    IdentityRuleDAL.createIdentityRule(projectId, {
      bloomreach_field: 'cookie',
      identity_type: 'hard',
      name: 'Login cookie rule',
      trigger_event_id: loginEvent.id,
      source_id: source.id,
    });

    ConsentCategoryDAL.createConsentCategory(projectId, {
      name: 'Newsletter',
      standard_key: 'newsletter',
    });

    const html = await generateProjectDocumentationHtml(projectId);

    expect(html).toContain('id="identity-rules"');
    expect(html).toContain('Login cookie rule');
    // trigger_event_id and source_id resolved to display names, not raw ids.
    expect(html).toContain('login');
    expect(html).toContain('iOS App');

    expect(html).toContain('id="consent-categories"');
    expect(html).toContain('Newsletter');
    expect(html).toContain('newsletter');
  });

  it('lists a variant under its event and a standard event mapping row (T-1-05)', async () => {
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    const cartUpdate = EventDAL.createEvent(projectId, { name: 'cart_update' });
    EventDAL.attachPropertyToEvent(projectId, cartUpdate.id, {
      property_id: action.id,
      role: 'discriminator',
    });

    const variant = VariantDAL.createVariant(projectId, cartUpdate.id, {
      conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
    });

    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'add_to_cart', {
      event_id: cartUpdate.id,
      variant_id: variant.id,
      field_map_json: {},
    });

    const html = await generateProjectDocumentationHtml(projectId);

    // Variant listed under its event, with its generated name and formatted condition.
    expect(html).toContain(variant.name);
    expect(html).toContain('action = add');

    // Standard event mappings section with the mapping row.
    expect(html).toContain('id="standard-event-mappings"');
    expect(html).toContain('add_to_cart');
    expect(html).toContain('cart_update');
    expect(html).toContain(variant.name);

    // Variant codegen snippet includes the discriminator's literal value (D-03/T-1-05); the
    // snippet is HTML-escaped in <pre><code> (single quotes become &#39;).
    expect(html).toMatch(/action: &#39;add&#39;/);
  });
});
