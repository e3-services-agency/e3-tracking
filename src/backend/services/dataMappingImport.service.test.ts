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
