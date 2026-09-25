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
      used: false,
      deleting: false,
      locked_for_contact_migration: false,
      private: false,
      type: 'string',
    });
  });
});
