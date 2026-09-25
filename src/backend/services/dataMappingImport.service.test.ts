/**
 * Data mapping import service tests (T-1-08): the fixture's expected diff on an empty project
 * (PLAN "Import / export contracts" > Data mapping), apply, apply idempotence, stale hash 409,
 * deselect skips, and the export round trip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import * as ConsentCategoryDAL from '../dal/consent-category.dal';
import * as RuleDAL from '../dal/rule.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { exportDataMapping } from './bloomreachExport.service';
import { PayloadChangedError } from '../errors';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

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

describe('previewDataMapping on an empty project', () => {
  it('proposes the events, properties, variants, mappings, customer properties, consent and catalog warning from the fixture', () => {
    const preview = previewDataMapping(projectId, fixture);

    const eventKeys = preview.items.filter((i) => i.entity_type === 'event').map((i) => i.entity_key).sort();
    expect(eventKeys).toEqual(
      ['cart_update', 'checkout', 'purchase', 'purchase_item', 'view_category', 'view_item'].sort()
    );

    const variantKeys = preview.items.filter((i) => i.entity_type === 'variant').map((i) => i.entity_key);
    expect(variantKeys).toContain('cart_update[action=add]');
    expect(variantKeys).toContain('purchase[purchase_status=success]');

    const propertyKeys = preview.items.filter((i) => i.entity_type === 'property').map((i) => i.entity_key);
    expect(propertyKeys).toEqual(
      expect.arrayContaining([
        'action',
        'purchase_status',
        'product_id',
        'total_price',
        'total_quantity',
        'product_ids',
        'product_list',
        'purchase_id',
        'voucher_code',
        'category_level_1',
        'category_level_2',
        'category_level_3',
        'size',
        'price',
        'quantity',
        'brand',
        'stock_level',
        'title',
        'address',
        'email',
        'first_name',
        'gender',
        'last_name',
        'phone',
      ])
    );

    const mappingKeys = preview.items.filter((i) => i.entity_type === 'standard_event_mapping').map((i) => i.entity_key);
    expect(mappingKeys).toEqual(
      expect.arrayContaining(['add_to_cart', 'checkout', 'purchase', 'purchase_item', 'view_category', 'view_item'])
    );
    const purchaseItemMapping = preview.items.find(
      (i) => i.entity_type === 'standard_event_mapping' && i.entity_key === 'purchase_item'
    )!;
    expect(purchaseItemMapping.note).toContain('total_price=price');
    expect(purchaseItemMapping.note).toContain('total_quantity=quantity');

    const consentKeys = preview.items.filter((i) => i.entity_type === 'consent_category').map((i) => i.entity_key);
    expect(consentKeys).toEqual(['newsletter']);
    const consentItem = preview.items.find((i) => i.entity_type === 'consent_category')!;
    expect(consentItem.note).toContain('brand_consent');

    expect(preview.warnings.some((w) => w.includes('empty catalog block'))).toBe(true);
    expect(preview.payload_hash).toEqual(expect.any(String));
  });
});

describe('applyDataMapping', () => {
  it('creates every proposed entity in one transaction when all items are selected', () => {
    const preview = previewDataMapping(projectId, fixture);
    const summary = applyDataMapping(
      projectId,
      fixture,
      preview.payload_hash,
      preview.items.map((i) => i.id)
    );
    expect(summary.applied.length).toBe(preview.items.length);
    expect(summary.skipped).toEqual([]);

    const events = EventDAL.listEvents(projectId);
    expect(events.map((e) => e.name).sort()).toEqual(
      ['cart_update', 'checkout', 'purchase', 'purchase_item', 'view_category', 'view_item'].sort()
    );

    const cartUpdate = events.find((e) => e.name === 'cart_update')!;
    const cartVariants = VariantDAL.listVariants(projectId, cartUpdate.id);
    expect(cartVariants.map((v) => v.name)).toContain('cart_update[action=add]');

    const purchaseItemMapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'purchase_item')!;
    const priceProperty = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'price')!;
    expect(purchaseItemMapping.field_map_json.total_price).toBe(priceProperty.id);

    const consent = ConsentCategoryDAL.listConsentCategories(projectId).find((c) => c.standard_key === 'newsletter')!;
    expect(consent.name).toBe('brand_consent');
  });

  it('is idempotent: a second preview after a full apply proposes no create items', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(
      projectId,
      fixture,
      first.payload_hash,
      first.items.map((i) => i.id)
    );

    const second = previewDataMapping(projectId, fixture);
    expect(second.items.filter((i) => i.op === 'create')).toEqual([]);
  });

  it('rejects apply with a stale hash (409 PAYLOAD_CHANGED)', () => {
    const preview = previewDataMapping(projectId, fixture);
    expect(() => applyDataMapping(projectId, fixture, 'stale-hash', preview.items.map((i) => i.id))).toThrow(
      PayloadChangedError
    );
  });

  it('skips a deselected item', () => {
    const preview = previewDataMapping(projectId, fixture);
    const consentItem = preview.items.find((i) => i.entity_type === 'consent_category')!;
    const selected = preview.items.filter((i) => i.id !== consentItem.id).map((i) => i.id);

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, selected);
    expect(summary.skipped).toEqual([consentItem.id]);
    expect(ConsentCategoryDAL.listConsentCategories(projectId)).toEqual([]);
  });
});

// T-2-07 (D-31): the fixture maps both "purchase" and "purchase_item", so the import proposes
// instantiating the purchase_items_total rounding_drift rule template.
describe('applyDataMapping proposes the purchase_items_total rule template (D-31, T-2-07)', () => {
  it('preview proposes "rule:purchase_items_total", selected by default', () => {
    const preview = previewDataMapping(projectId, fixture);
    const item = preview.items.find((i) => i.id === 'rule:purchase_items_total');
    expect(item).toBeDefined();
    expect(item?.op).toBe('create');
    expect(item?.entity_type).toBe('rule');
    expect(item?.default_selected).toBe(true);
  });

  it('apply creates the rule on the purchase event, template_key set, report_kind rounding_drift', () => {
    const preview = previewDataMapping(projectId, fixture);
    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toContain('rule:purchase_items_total');

    const purchaseEvent = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase')!;
    const rules = RuleDAL.listRulesByEvent(projectId, purchaseEvent.id);
    const rule = rules.find((r) => r.template_key === 'purchase_items_total');
    expect(rule).toBeDefined();
    expect(rule?.kind).toBe('cross_event');
    expect(rule?.report_kind).toBe('rounding_drift');
    expect(rule?.tolerance_mode).toBe('money');
  });

  it('is idempotent: a second preview/apply after a full apply proposes and creates no duplicate rule', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, first.payload_hash, first.items.map((i) => i.id));

    const second = previewDataMapping(projectId, fixture);
    expect(second.items.find((i) => i.id === 'rule:purchase_items_total')).toBeUndefined();

    const purchaseEvent = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase')!;
    expect(RuleDAL.listRulesByEvent(projectId, purchaseEvent.id).filter((r) => r.template_key === 'purchase_items_total')).toHaveLength(1);
  });

  it('does not propose the rule when only one of purchase/purchase_item is mapped', () => {
    const partial = {
      standard_events: {
        purchase: fixture.standard_events.purchase,
      },
    };
    const preview = previewDataMapping(projectId, partial);
    expect(preview.items.find((i) => i.id === 'rule:purchase_items_total')).toBeUndefined();
  });
});

describe('exportDataMapping round trip', () => {
  it('deep-equals the fixture after import, ignoring key order and _id/success', () => {
    const preview = previewDataMapping(projectId, fixture);
    applyDataMapping(
      projectId,
      fixture,
      preview.payload_hash,
      preview.items.map((i) => i.id)
    );

    const exported = exportDataMapping(projectId);
    const normalize = (v: unknown) => {
      const clone = JSON.parse(JSON.stringify(v));
      delete clone._id;
      delete clone.success;
      return clone;
    };
    expect(normalize(exported)).toEqual(normalize(fixture));
  });
});

// fix round (2026-09-24 22:36 reviewer FAIL) regression tests.
describe('fix round: ERROR 1 - unknown standard event/consent keys applied end to end', () => {
  it('applies an unknown standard event key (with fields) and adds a project_addition before the mapping', () => {
    const raw = { standard_events: { travel_booking: { event: { type: 'booking', filter: [] }, price: { property: 'price' } } } };
    const preview = previewDataMapping(projectId, raw);
    const additionItem = preview.items.find((i) => i.id === 'project_addition:standard_event:travel_booking')!;
    expect(additionItem).toBeDefined();
    const mappingItem = preview.items.find((i) => i.id === 'standard_event_mapping:travel_booking')!;
    expect(mappingItem).toBeDefined();
    // Addition step comes before the mapping step in the plan (apply order).
    expect(preview.items.indexOf(additionItem)).toBeLessThan(preview.items.indexOf(mappingItem));

    const summary = applyDataMapping(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toContain('project_addition:standard_event:travel_booking');
    expect(summary.applied).toContain('standard_event_mapping:travel_booking');
    expect(summary.skipped).toEqual([]);

    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.standard_event_additions_json).toEqual([{ key: 'travel_booking', fields: ['price'] }]);
    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'travel_booking');
    expect(mapping).not.toBeNull();
  });

  it('applies an unknown standard event key with no other fields (empty field list addition)', () => {
    const raw = { standard_events: { loyalty_scan: { event: { type: 'loyalty_scan', filter: [] } } } };
    const preview = previewDataMapping(projectId, raw);
    const additionItem = preview.items.find((i) => i.id === 'project_addition:standard_event:loyalty_scan')!;
    expect(additionItem).toBeDefined();

    const summary = applyDataMapping(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toContain('project_addition:standard_event:loyalty_scan');
    expect(summary.applied).toContain('standard_event_mapping:loyalty_scan');

    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.standard_event_additions_json).toEqual([{ key: 'loyalty_scan', fields: [] }]);
  });

  it('applies an unknown standard consent key end to end', () => {
    const raw = { consents: { loyalty_program: 'loyalty_consent' } };
    const preview = previewDataMapping(projectId, raw);
    const additionItem = preview.items.find((i) => i.id === 'project_addition:consent_key:loyalty_program')!;
    const consentItem = preview.items.find((i) => i.id === 'consent:loyalty_program')!;
    expect(additionItem).toBeDefined();
    expect(consentItem).toBeDefined();
    expect(preview.items.indexOf(additionItem)).toBeLessThan(preview.items.indexOf(consentItem));

    const summary = applyDataMapping(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.consent_key_additions_json).toEqual(['loyalty_program']);
    const consent = ConsentCategoryDAL.listConsentCategories(projectId).find((c) => c.standard_key === 'loyalty_program');
    expect(consent?.name).toBe('loyalty_consent');
  });
});

describe('fix round: ERROR 2 - a changed filter value repoints the mapping', () => {
  it('re-import with a changed operand value creates the new variant and repoints add_to_cart at it', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, first.payload_hash, first.items.map((i) => i.id));

    const changed = JSON.parse(JSON.stringify(fixture));
    changed.standard_events.add_to_cart.event.filter[0].constraint.operands[0].value = 'added';

    const preview = previewDataMapping(projectId, changed);
    const variantItem = preview.items.find((i) => i.entity_type === 'variant' && i.entity_key === 'cart_update[action=added]');
    expect(variantItem).toBeDefined();
    const mappingItem = preview.items.find((i) => i.id === 'standard_event_mapping:add_to_cart')!;
    expect(mappingItem).toBeDefined();
    expect(mappingItem.op).toBe('update');
    expect(mappingItem.changes.some((c) => c.field === 'variant')).toBe(true);

    const summary = applyDataMapping(projectId, changed, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);

    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    const cartUpdate = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    const variants = VariantDAL.listVariants(projectId, cartUpdate.id);
    const newVariant = variants.find((v) => v.name === 'cart_update[action=added]')!;
    expect(mapping.variant_id).toBe(newVariant.id);

    // A second preview is empty: the export now emits "added", proving the mapping actually moved.
    const second = previewDataMapping(projectId, changed);
    expect(second.items).toEqual([]);
    const exported = exportDataMapping(projectId);
    const addToCart = (exported.standard_events as Record<string, { event: { filter: { constraint: { operands: { value: string }[] } }[] } }>).add_to_cart;
    expect(addToCart.event.filter[0].constraint.operands[0].value).toBe('added');

    // The old variant is left in place but is no longer referenced by any mapping (warned).
    const oldVariant = variants.find((v) => v.name === 'cart_update[action=add]');
    expect(oldVariant).toBeDefined();
    expect(summary.warnings.some((w) => w.includes('cart_update[action=add]') && w.includes('no longer mapped'))).toBe(true);
  });
});

describe('fix round: ERROR 5 - promoting a pre-linked "normal" filter attribute to discriminator', () => {
  it('promotes the property role before creating the variant, when events are defined before the mapping is pasted', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'normal' });

    const preview = previewDataMapping(projectId, fixture);
    const promotionItem = preview.items.find((i) => i.id === 'event_property:cart_update.action:role')!;
    expect(promotionItem).toBeDefined();
    expect(promotionItem.op).toBe('update');
    expect(promotionItem.changes).toEqual([{ field: 'role', before: 'normal', after: 'discriminator' }]);

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);

    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    const link = properties.find((p) => p.property_id === property.id)!;
    expect(link.role).toBe('discriminator');

    const variants = VariantDAL.listVariants(projectId, event.id);
    expect(variants.map((v) => v.name)).toContain('cart_update[action=add]');
  });
});

describe('fix round: ERROR 4 - property rename between two imports is picked up fresh', () => {
  it('resolves the renamed property by its new name on a second import, without a stale-cache duplicate', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, first.payload_hash, first.items.map((i) => i.id));

    const actionProperty = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'action')!;
    PropertyDAL.updateProperty(projectId, actionProperty.id, { name: 'cart_action' });

    const renamed = JSON.parse(JSON.stringify(fixture));
    renamed.standard_events.add_to_cart.event.filter[0].attribute.property = 'cart_action';

    const preview = previewDataMapping(projectId, renamed);
    // No duplicate "create variant" or "create property" proposed: the existing variant/property
    // resolve correctly under the new name.
    expect(preview.items.filter((i) => i.entity_type === 'variant')).toEqual([]);
    expect(preview.items.some((i) => i.entity_type === 'property' && i.entity_key === 'cart_action')).toBe(false);

    const summary = applyDataMapping(projectId, renamed, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);

    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(mapping.variant_id).not.toBeNull();
    const cartUpdate = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    const variant = VariantDAL.listVariants(projectId, cartUpdate.id).find((v) => v.id === mapping.variant_id)!;
    expect(variant.name).toBe('cart_update[cart_action=add]');
  });
});

describe('fix round: WARNING 6 - dependency-deselected steps are reported skipped, not partially written', () => {
  it('skips the variant and the mapping (never variant_id: null) when their property dependency is deselected', () => {
    const preview = previewDataMapping(projectId, fixture);
    const propertyItemId = 'property:event:action';
    const variantItemId = preview.items.find((i) => i.entity_type === 'variant' && i.entity_key === 'cart_update[action=add]')!.id;
    const mappingItemId = 'standard_event_mapping:add_to_cart';
    const selected = preview.items.map((i) => i.id).filter((id) => id !== propertyItemId);

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, selected);
    expect(summary.skipped).toEqual(expect.arrayContaining([variantItemId, mappingItemId]));
    expect(summary.applied).not.toContain(variantItemId);
    expect(summary.applied).not.toContain(mappingItemId);
    expect(summary.warnings.some((w) => w.includes(variantItemId) || w.includes(mappingItemId))).toBe(true);

    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart');
    expect(mapping).toBeNull();
    const events = EventDAL.listEvents(projectId);
    const cartUpdate = events.find((e) => e.name === 'cart_update')!;
    expect(VariantDAL.listVariants(projectId, cartUpdate.id)).toEqual([]);
  });

  it('does not create a variant when only the variant item is selected on an empty project', () => {
    const preview = previewDataMapping(projectId, fixture);
    const variantItemId = preview.items.find((i) => i.entity_type === 'variant' && i.entity_key === 'cart_update[action=add]')!.id;

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, [variantItemId]);
    expect(summary.applied).toEqual([]);
    expect(summary.skipped).toContain(variantItemId);
    expect(EventDAL.listEvents(projectId)).toEqual([]);
  });
});

// second fix round (2026-09-24 23:20 reviewer FAIL) regression tests.
describe('second fix round: ERROR A/WARNING B - the parsed filter is canonicalized before naming/matching', () => {
  it('re-pasting with "equals" changed to a one-value "in" proposes no items and never detaches the mapping', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, first.payload_hash, first.items.map((i) => i.id));

    const mappingBefore = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(mappingBefore.variant_id).not.toBeNull();

    const reImported = JSON.parse(JSON.stringify(fixture));
    reImported.standard_events.add_to_cart.event.filter[0].constraint.operator = 'in';
    // same single operand as the stored "equals" filter - canonicalizes to the same variant.

    const preview = previewDataMapping(projectId, reImported);
    expect(preview.items).toEqual([]);
    expect(preview.warnings.some((w) => w.includes('no longer mapped'))).toBe(false);

    const summary = applyDataMapping(projectId, reImported, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toEqual([]);
    expect(summary.skipped).toEqual([]);

    // The silent-detach scenario (ERROR A) is impossible: the mapping keeps pointing at the same
    // variant, and no second, duplicate variant was created for the same (now-canonical) filter.
    const mappingAfter = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(mappingAfter.variant_id).toBe(mappingBefore.variant_id);
    const cartUpdate = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    const variants = VariantDAL.listVariants(projectId, cartUpdate.id);
    expect(variants.filter((v) => v.name.startsWith('cart_update[action'))).toHaveLength(1);

    const exported = exportDataMapping(projectId);
    const addToCart = (
      exported.standard_events as Record<
        string,
        { event: { filter: { constraint: { operands: { value: string }[] } }[] } }
      >
    ).add_to_cart;
    expect(addToCart.event.filter[0].constraint.operands[0].value).toBe('add');
  });

  it('reversed "in" operands propose no items and keep the mapping on the same variant', () => {
    const raw = {
      standard_events: {
        add_to_cart: {
          event: {
            filter: [
              {
                attribute: { property: 'action', type: 'property' },
                constraint: {
                  operands: [
                    { type: 'constant', value: 'add' },
                    { type: 'constant', value: 'remove' },
                  ],
                  operator: 'in',
                  type: 'string',
                },
              },
            ],
            type: 'cart_update',
          },
          total_price: { property: 'total_price' },
        },
      },
    };
    const first = previewDataMapping(projectId, raw);
    applyDataMapping(projectId, raw, first.payload_hash, first.items.map((i) => i.id));
    const mappingBefore = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(mappingBefore.variant_id).not.toBeNull();

    const reversed = JSON.parse(JSON.stringify(raw));
    reversed.standard_events.add_to_cart.event.filter[0].constraint.operands = [
      { type: 'constant', value: 'remove' },
      { type: 'constant', value: 'add' },
    ];

    const preview = previewDataMapping(projectId, reversed);
    expect(preview.items).toEqual([]);

    const summary = applyDataMapping(projectId, reversed, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied).toEqual([]);
    expect(summary.skipped).toEqual([]);

    const mappingAfter = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')!;
    expect(mappingAfter.variant_id).toBe(mappingBefore.variant_id);
    const cartUpdate = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    expect(VariantDAL.listVariants(projectId, cartUpdate.id)).toHaveLength(1);
  });
});

describe('second fix round: WARNING C/LOW E - role promotion depends on its property and never silently no-ops', () => {
  it('reports the promotion, variant and mapping as skipped (not applied) when the property\'s own dependency (its missing allowed value) is deselected', () => {
    // The property exists but has no allowed values yet (so `RoleRequiresEnumError` would abort the
    // promotion if it ran); Phase 2 proposes an "add allowed value" update on `property:event:action`
    // and the promotion step must depend on it (WARNING C) so deselecting it is what actually blocks
    // the promotion, instead of the promotion silently no-op'ing at apply while reported as applied.
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'normal' });

    const preview = previewDataMapping(projectId, fixture);
    const propertyItemId = 'property:event:action';
    const promotionItemId = 'event_property:cart_update.action:role';
    const variantItemId = preview.items.find((i) => i.entity_type === 'variant' && i.entity_key === 'cart_update[action=add]')!.id;
    const mappingItemId = 'standard_event_mapping:add_to_cart';
    const propertyItem = preview.items.find((i) => i.id === propertyItemId)!;
    expect(propertyItem.op).toBe('update'); // adding the missing "add" allowed value, not a create
    const selected = preview.items.map((i) => i.id).filter((id) => id !== propertyItemId);

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, selected);
    expect(summary.skipped).toEqual(expect.arrayContaining([promotionItemId, variantItemId, mappingItemId]));
    expect(summary.applied).not.toContain(promotionItemId);
    expect(summary.applied).not.toContain(variantItemId);
    expect(summary.applied).not.toContain(mappingItemId);

    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(properties.find((p) => p.property_id === property.id)!.role).toBe('normal');
    expect(VariantDAL.listVariants(projectId, event.id)).toEqual([]);
    expect(StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')).toBeNull();
  });

  it('surfaces the two-discriminators-already-present case as a preview warning that blocks the variant and mapping', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const already1 = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }],
    });
    const already2 = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'source',
      data_type: 'string',
      allowed_values_json: [{ value: 'mobile' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: already1.id, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: already2.id, role: 'discriminator' });
    const action = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, role: 'normal' });

    const preview = previewDataMapping(projectId, fixture);
    expect(preview.warnings.some((w) => w.includes('action') && w.includes('cart_update') && w.includes('2 discriminator'))).toBe(
      true
    );
    expect(preview.items.some((i) => i.entity_type === 'variant' && i.entity_key.startsWith('cart_update[action'))).toBe(false);
    expect(preview.items.some((i) => i.id === 'standard_event_mapping:add_to_cart')).toBe(false);
    expect(preview.items.some((i) => i.id === 'event_property:cart_update.action:role')).toBe(false);

    const summary = applyDataMapping(projectId, fixture, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);
    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(properties.find((p) => p.property_id === action.id)!.role).toBe('normal');
    expect(StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'add_to_cart')).toBeNull();
  });
});

describe('fix round: WARNING 7 - DiffItem.changes is populated for standard_event_mapping updates', () => {
  it('shows event/field_map_json before-after on an update', () => {
    const first = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, first.payload_hash, first.items.map((i) => i.id));

    const changed = JSON.parse(JSON.stringify(fixture));
    changed.standard_events.purchase_item.total_price = null;

    const preview = previewDataMapping(projectId, changed);
    const mappingItem = preview.items.find((i) => i.id === 'standard_event_mapping:purchase_item')!;
    expect(mappingItem.changes.length).toBeGreaterThan(0);
    const fieldChange = mappingItem.changes.find((c) => c.field === 'field_map_json')!;
    expect(fieldChange).toBeDefined();
    expect((fieldChange.before as Record<string, string | null>).total_price).toBe('price');
    expect((fieldChange.after as Record<string, string | null>).total_price).toBeNull();
  });
});
