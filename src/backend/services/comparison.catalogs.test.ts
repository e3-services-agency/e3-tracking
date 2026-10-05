/**
 * `runComparison` runs the `catalogs` comparison (D-61, T-4-11B): findings are persisted by
 * fingerprint, reopen/resolve with the data, and the linked-field alignment sees real properties.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as FindingDAL from '../dal/finding.dal';
import { runComparison } from './comparison.service';

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

function openCatalogFindings() {
  return FindingDAL.listFindings(projectId, { comparison: 'catalogs', status: 'open' });
}

describe('runComparison: catalogs', () => {
  it('reports drift, a missing lookup key and a type mismatch, then resolves them when fixed', () => {
    const gb = CatalogDAL.createCatalog(projectId, { name: 'products_gb', mapping_role: 'main', market: 'GB' });
    const cz = CatalogDAL.createCatalog(projectId, { name: 'products_cz', kind: 'product', market: 'CZ' });
    CatalogDAL.createCatalogField(projectId, gb.id, { name: 'product_id', is_lookup_key: true });
    const gbPrice = CatalogDAL.createCatalogField(projectId, gb.id, { name: 'price', data_type: 'number' });
    CatalogDAL.createCatalogField(projectId, cz.id, { name: 'product_id', is_lookup_key: true });
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'price', data_type: 'string', mapped_catalog_id: gb.id, mapped_catalog_field_id: gbPrice.id });

    const summary = runComparison(projectId);
    expect(summary.by_comparison.catalogs).toBeDefined();
    const kinds = openCatalogFindings().map((f) => f.kind).sort();
    expect(kinds).toEqual(['catalog_schema_drift', 'catalog_type_mismatch']);

    // fix both: add the missing field in CZ, make the property a number
    CatalogDAL.createCatalogField(projectId, cz.id, { name: 'price', data_type: 'number' });
    const price = PropertyDAL.listProperties(projectId).find((p) => p.name === 'price')!;
    PropertyDAL.updateProperty(projectId, price.id, { data_type: 'number' });
    const after = runComparison(projectId);
    expect(openCatalogFindings()).toEqual([]);
    expect(after.by_comparison.catalogs.resolved).toBe(2);
  });

  it('a catalog without a lookup key is an error finding', () => {
    CatalogDAL.createCatalog(projectId, { name: 'stores' });
    runComparison(projectId);
    const findings = openCatalogFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'catalog_lookup_key', severity: 'error' });
  });
});
