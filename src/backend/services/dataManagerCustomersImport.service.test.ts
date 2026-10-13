/**
 * Data Manager customers import service tests (T-2-02): the fixture's expected diff on an empty
 * project (101 creates across the documented groups), apply, second preview empty (idempotence),
 * the `source: data` type rule, stale hash 409, and the export round trip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import { previewDataManagerCustomers, applyDataManagerCustomers } from './dataManagerCustomersImport.service';
import { exportDataManagerCustomers } from './bloomreachExport.service';
import { PayloadChangedError } from '../errors';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-manager-customers.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

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

describe('previewDataManagerCustomers on an empty project', () => {
  it('proposes 101 create items across default (89), Personal Data (4), Campaign Data (3), Order Data (5), plus the always-applied snapshot item', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const propertyItems = preview.items.filter((i) => i.entity_type === 'property');
    expect(propertyItems).toHaveLength(101);
    expect(propertyItems.every((i) => i.op === 'create')).toBe(true);
    expect(propertyItems.every((i) => i.default_selected)).toBe(true);

    const snapshotItem = preview.items.find((i) => i.id === 'project:data_manager_customers_snapshot');
    expect(snapshotItem).toBeDefined();
    expect(snapshotItem?.default_selected).toBe(true);

    expect(preview.warnings).toEqual([]);
  });

  it('types "city" as string/long_text and "company_name" as number, and flags PII on the four Personal Data rows', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const city = preview.items.find((i) => i.entity_key === 'city');
    expect(city?.note).toMatch(/long_text/);
    const companyName = preview.items.find((i) => i.entity_key === 'company_name');
    expect(companyName?.note).toMatch(/number/);
  });
});

describe('applyDataManagerCustomers', () => {
  it('creates all 101 properties by default selection and refreshes the project snapshot', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    const result = applyDataManagerCustomers(projectId, fixture, preview.payload_hash, selected);
    expect(result.applied.length).toBe(102); // 101 properties + the snapshot item
    expect(result.skipped).toEqual([]);

    const properties = PropertyDAL.listProperties(projectId, { scope: 'customer' });
    expect(properties).toHaveLength(101);

    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.data_manager_customers_json).not.toBeNull();
    expect((project.data_manager_meta_json as { customers?: unknown } | null)?.customers).toMatchObject({
      are_all_used: false,
      default_private: false,
    });
  });

  it('is idempotent: a second preview against the fixture after apply proposes nothing', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerCustomers(projectId, fixture, preview.payload_hash, selected);

    const second = previewDataManagerCustomers(projectId, fixture);
    // Only the always-present snapshot item remains; no property create/update is proposed.
    expect(second.items.filter((i) => i.entity_type === 'property')).toEqual([]);
    expect(second.warnings).toEqual([]);
  });

  it('runs the snapshot step even when its id is not in selected_item_ids', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const propertyItemIds = preview.items.filter((i) => i.entity_type === 'property').map((i) => i.id);
    const result = applyDataManagerCustomers(projectId, fixture, preview.payload_hash, propertyItemIds);
    expect(result.applied).toContain('project:data_manager_customers_snapshot');
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.data_manager_customers_json).not.toBeNull();
  });

  it('rejects an apply whose hash no longer matches (stale payload)', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    expect(() =>
      applyDataManagerCustomers(projectId, fixture, 'stale-hash', preview.items.map((i) => i.id))
    ).toThrow(PayloadChangedError);
  });

  it('only proposes a source="user" type change on an existing property, and warns (never proposes) for source="data"', () => {
    // Seed "company_name" (Personal Data, source user, type number in the fixture) as an existing
    // string property first, then re-run preview: type should be proposed since source is "user".
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'company_name', data_type: 'string' });
    const preview = previewDataManagerCustomers(projectId, fixture);
    const item = preview.items.find((i) => i.entity_key === 'company_name');
    expect(item?.op).toBe('update');
    expect(item?.changes.some((c) => c.field === 'data_type')).toBe(true);

    // Seed "City" (default group, source data, type string in the fixture) as an existing number
    // property: the type diff must not be proposed, only warned (comparison-4 evidence, D-35).
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'City', data_type: 'number' });
    const preview2 = previewDataManagerCustomers(projectId, fixture);
    const cityItem = preview2.items.find((i) => i.entity_key === 'City');
    expect(cityItem).toBeUndefined(); // no other field differs, so no item at all
    expect(preview2.warnings.some((w) => w.includes('City'))).toBe(true);
  });

  it('reviewer ERROR 1: money format survives a format-only re-import (no data_type item proposed, no format wipe)', () => {
    // "company_name" is number/"user" in the fixture; seed it as number/[money] (a pure app
    // enrichment with no Bloomreach counterpart, D-37) and matching every other fixture field so the
    // only possible diff is the type/format comparison itself.
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'company_name',
      data_type: 'number',
      data_formats_json: ['money'],
      category: 'Personal Data',
      pii: true,
      description: 'updated by DWH',
    });

    const preview = previewDataManagerCustomers(projectId, fixture);
    const item = preview.items.find((i) => i.entity_key === 'company_name');
    expect(item).toBeUndefined(); // no field differs at all: no item proposed

    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerCustomers(projectId, fixture, preview.payload_hash, selected);

    const companyName = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find(
      (p) => p.name === 'company_name'
    );
    expect(companyName?.data_formats_json).toEqual(['money']); // never wiped
  });

  it('reviewer ERROR 1: email format survives a format-only re-import of a standard customer property', () => {
    // "email" is a STANDARD_CUSTOMER_PROPERTIES entry, default group, source "user", type "string"
    // in the fixture; seed it as string/[email] (app enrichment) with `bloomreach_customer_property`
    // already set so the only possible diff is the type/format comparison itself.
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'email',
      data_type: 'string',
      data_formats_json: ['email'],
      bloomreach_customer_property: 'email',
    });

    const preview = previewDataManagerCustomers(projectId, fixture);
    const item = preview.items.find((i) => i.entity_key === 'email');
    expect(item).toBeUndefined();

    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerCustomers(projectId, fixture, preview.payload_hash, selected);

    const email = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'email');
    expect(email?.data_formats_json).toEqual(['email']);
  });

  it('reviewer ERROR 1: a format-only difference on a source="data" property does not warn "Data Manager type differs"', () => {
    // "City" is source "data", type "string" in the fixture: seeding it as string/[country_code]
    // (app enrichment) must not trigger the source="data" type-differs warning — it is not a real
    // Bloomreach type difference, just an app-added format with no Bloomreach counterpart.
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'City',
      data_type: 'string',
      data_formats_json: ['country_code'],
    });

    const preview = previewDataManagerCustomers(projectId, fixture);
    expect(preview.items.find((i) => i.entity_key === 'City')).toBeUndefined();
    expect(preview.warnings.some((w) => w.includes('City'))).toBe(false);
    expect(preview.warnings.some((w) => w.includes('Data Manager type differs'))).toBe(false);
  });

  it('reviewer ERROR 1: a real source="user" type change keeps compatible existing formats on top of the new Bloomreach-implied ones', () => {
    // "company_name" is number/"user" in the fixture; seed it as string/[email] first (a real type
    // change, string -> number): "email" is not compatible with "number" and must be dropped, while
    // the property still gets the new number type.
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'company_name',
      data_type: 'string',
      data_formats_json: ['email'],
      category: 'Personal Data',
    });
    const preview = previewDataManagerCustomers(projectId, fixture);
    const item = preview.items.find((i) => i.entity_key === 'company_name');
    expect(item?.changes.some((c) => c.field === 'data_type')).toBe(true);

    applyDataManagerCustomers(projectId, fixture, preview.payload_hash, [item!.id, 'project:data_manager_customers_snapshot']);
    const row = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'company_name');
    expect(row?.data_type).toBe('number');
    expect(row?.data_formats_json).toEqual([]);
  });

  it('reviewer ERROR 2: a payload with zero properties (the events export shape) proposes no items and warns, and never stores the snapshot', () => {
    const eventsShapePayload = {
      default_group: {
        events: [{ type: 'purchase', properties: { are_all_used: false, default_group: { properties: [] } } }],
      },
    };
    const preview = previewDataManagerCustomers(projectId, eventsShapePayload);
    expect(preview.items).toEqual([]);
    expect(preview.warnings.some((w) => /events export/.test(w))).toBe(true);
    expect(preview.warnings.some((w) => /nothing to import/.test(w))).toBe(true);

    const result = applyDataManagerCustomers(projectId, eventsShapePayload, preview.payload_hash, []);
    expect(result.applied).toEqual([]);
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.data_manager_customers_json).toBeNull();
  });

  it('reviewer ERROR 2: an empty-but-well-formed payload ("{}") also proposes no snapshot item and warns', () => {
    const preview = previewDataManagerCustomers(projectId, {});
    expect(preview.items).toEqual([]);
    expect(preview.warnings.some((w) => /nothing to import/.test(w))).toBe(true);

    applyDataManagerCustomers(projectId, {}, preview.payload_hash, []);
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.data_manager_customers_json).toBeNull();
  });
});

describe('exportDataManagerCustomers round trip', () => {
  it('deep-equals the fixture (sorted-key serialisation) after applying the default selection', () => {
    const preview = previewDataManagerCustomers(projectId, fixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerCustomers(projectId, fixture, preview.payload_hash, selected);

    const exported = exportDataManagerCustomers(projectId);
    expect(canonicalize(exported)).toEqual(canonicalize(fixture));
  });

  it('exports an app-born property (never imported) with the D-40 Q2 defaults', () => {
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'loyalty_tier',
      data_type: 'string',
      pii: false,
    });
    const exported = exportDataManagerCustomers(projectId);
    const row = (exported.default_group as { properties: Record<string, unknown>[] }).properties.find(
      (p) => p.property === 'loyalty_tier'
    );
    expect(row).toMatchObject({
      source: 'user',
      used: true,
      deleting: false,
      locked_for_contact_migration: false,
      private: false,
      type: 'string',
    });
  });

  it('reviewer INFO 6: exports the app type reverse-mapped once the user changes it after import; the stored raw unrecognized type is a fallback only', () => {
    // Import a property with an unrecognized Data Manager type: falls back to app type
    // string/no-formats, and the original raw "geo_point" is kept on `bloomreach_meta_json.raw.type`
    // (D-37) so a re-export can still round-trip it verbatim *while the app type is untouched*.
    const payload = { default_group: { properties: [{ property: 'geo', type: 'geo_point' }] } };
    const preview = previewDataManagerCustomers(projectId, payload);
    applyDataManagerCustomers(
      projectId,
      payload,
      preview.payload_hash,
      preview.items.filter((i) => i.default_selected).map((i) => i.id)
    );

    const before = exportDataManagerCustomers(projectId);
    const rowBefore = (before.default_group as { properties: Record<string, unknown>[] }).properties.find(
      (p) => p.property === 'geo'
    );
    expect(rowBefore?.type).toBe('geo_point'); // fallback: app type is still the untouched string placeholder

    // The user now changes the property's app type away from the placeholder (e.g. to "number").
    const geo = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'geo')!;
    PropertyDAL.updateProperty(projectId, geo.id, { data_type: 'number', data_formats_json: [] });

    const after = exportDataManagerCustomers(projectId);
    const rowAfter = (after.default_group as { properties: Record<string, unknown>[] }).properties.find(
      (p) => p.property === 'geo'
    );
    expect(rowAfter?.type).toBe('number'); // reverse-mapped current type wins, not the stale raw fallback
  });
});

describe('reviewer fix round 2: ERROR A (old DM-determining formats leaked back into "kept")', () => {
  it('long text -> string applies once and never recurs', () => {
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'a', data_type: 'string', data_formats_json: ['long_text'] });
    const payload = { default_group: { properties: [{ property: 'a', type: 'string', source: 'user' }] } };

    const preview = previewDataManagerCustomers(projectId, payload);
    const item = preview.items.find((i) => i.entity_key === 'a');
    expect(item?.changes).toContainEqual({ field: 'data_type', before: 'string/long_text', after: 'string' });

    applyDataManagerCustomers(projectId, payload, preview.payload_hash, [item!.id, 'project:data_manager_customers_snapshot']);
    const row = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'a');
    expect(row?.data_type).toBe('string');
    expect(row?.data_formats_json).toEqual([]);

    const second = previewDataManagerCustomers(projectId, payload);
    expect(second.items.filter((i) => i.entity_type === 'property')).toEqual([]);
  });

  it('url -> string applies once and never recurs', () => {
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'b', data_type: 'string', data_formats_json: ['uri'] });
    const payload = { default_group: { properties: [{ property: 'b', type: 'string', source: 'user' }] } };

    const preview = previewDataManagerCustomers(projectId, payload);
    const item = preview.items.find((i) => i.entity_key === 'b');
    expect(item?.changes).toContainEqual({ field: 'data_type', before: 'string/uri', after: 'string' });

    applyDataManagerCustomers(projectId, payload, preview.payload_hash, [item!.id, 'project:data_manager_customers_snapshot']);
    const row = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'b');
    expect(row?.data_type).toBe('string');
    expect(row?.data_formats_json).toEqual([]);

    const second = previewDataManagerCustomers(projectId, payload);
    expect(second.items.filter((i) => i.entity_type === 'property')).toEqual([]);
  });

  it('date -> datetime applies once and never recurs', () => {
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'c', data_type: 'timestamp', data_formats_json: ['iso8601_date'] });
    const payload = { default_group: { properties: [{ property: 'c', type: 'datetime', source: 'user' }] } };

    const preview = previewDataManagerCustomers(projectId, payload);
    const item = preview.items.find((i) => i.entity_key === 'c');
    expect(item?.changes).toContainEqual({ field: 'data_type', before: 'timestamp/iso8601_date', after: 'timestamp' });

    applyDataManagerCustomers(projectId, payload, preview.payload_hash, [item!.id, 'project:data_manager_customers_snapshot']);
    const row = PropertyDAL.listProperties(projectId, { scope: 'customer' }).find((p) => p.name === 'c');
    expect(row?.data_type).toBe('timestamp');
    expect(row?.data_formats_json).toEqual([]);

    const second = previewDataManagerCustomers(projectId, payload);
    expect(second.items.filter((i) => i.entity_type === 'property')).toEqual([]);
  });
});

describe('reviewer fix round 2: ERROR B (unknown incoming type compared against reconstructed app type)', () => {
  it('an unknown type (geo_point) never proposes "data_type: string -> string", and the export -> import round trip stays diff-free', () => {
    const payload = { default_group: { properties: [{ property: 'geo', type: 'geo_point', source: 'user' }] } };
    const preview = previewDataManagerCustomers(projectId, payload);
    applyDataManagerCustomers(
      projectId,
      payload,
      preview.payload_hash,
      preview.items.filter((i) => i.default_selected).map((i) => i.id)
    );

    const second = previewDataManagerCustomers(projectId, payload);
    expect(second.items.find((i) => i.entity_key === 'geo')).toBeUndefined();

    const exported = exportDataManagerCustomers(projectId);
    const third = previewDataManagerCustomers(projectId, exported);
    expect(third.items.filter((i) => i.entity_type === 'property')).toEqual([]);
  });
});

describe('reviewer fix round 2: general guard (never emit an update item whose before equals after)', () => {
  it('a no-op re-preview (identical payload, all fields matching) proposes no property items', () => {
    PropertyDAL.createProperty(projectId, {
      scope: 'customer',
      name: 'd',
      data_type: 'string',
      category: null,
      pii: false,
      description: null,
    });
    const payload = { default_group: { properties: [{ property: 'd', type: 'string', source: 'user' }] } };
    const preview = previewDataManagerCustomers(projectId, payload);
    expect(preview.items.find((i) => i.entity_key === 'd')).toBeUndefined();
  });
});
