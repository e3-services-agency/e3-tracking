/** T-4-33: catalog field order (sort_order) and the reorder DAL. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as CatalogDAL from './catalog.dal';
import * as PropertyDAL from './property.dal';
import * as ChangeLogDAL from './change-log.dal';
import { ValidationError } from '../errors';

let projectId: string;
let catalogId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  catalogId = CatalogDAL.createCatalog(projectId, { name: 'products' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('catalog field order', () => {
  it('lists in creation order, then in the saved order', () => {
    const z = CatalogDAL.createCatalogField(projectId, catalogId, { name: 'z_first' });
    const a = CatalogDAL.createCatalogField(projectId, catalogId, { name: 'a_second' });
    expect(CatalogDAL.listCatalogFields(projectId, catalogId).map((f) => f.name)).toEqual(['z_first', 'a_second']);
    const out = CatalogDAL.reorderCatalogFields(projectId, catalogId, [a.id, z.id]);
    expect(out.map((f) => f.name)).toEqual(['a_second', 'z_first']);
    const c = CatalogDAL.createCatalogField(projectId, catalogId, { name: 'c_third' });
    expect(CatalogDAL.listCatalogFields(projectId, catalogId).map((f) => f.id)).toEqual([a.id, z.id, c.id]);
  });
  it('rejects a list that is not exactly the catalog fields', () => {
    const a = CatalogDAL.createCatalogField(projectId, catalogId, { name: 'a' });
    CatalogDAL.createCatalogField(projectId, catalogId, { name: 'b' });
    expect(() => CatalogDAL.reorderCatalogFields(projectId, catalogId, [a.id])).toThrow(ValidationError);
    expect(() => CatalogDAL.reorderCatalogFields(projectId, catalogId, [a.id, a.id])).toThrow(ValidationError);
  });
});

describe('deleting a linked catalog field', () => {
  it('clears the property link and logs the property update', () => {
    const f = CatalogDAL.createCatalogField(projectId, catalogId, { name: 'item_id' });
    const prop = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string', mapped_catalog_id: catalogId, mapped_catalog_field_id: f.id } as never);
    CatalogDAL.deleteCatalogField(projectId, catalogId, f.id);
    const after = PropertyDAL.getPropertyOrThrow(projectId, prop.id);
    expect(after.mapped_catalog_field_id).toBeNull();
    expect(after.mapped_catalog_id).toBe(catalogId);
    const log = ChangeLogDAL.listChanges(projectId, {} as never) as unknown as { items?: { entity_type: string; action: string }[] };
    const items = log.items ?? (log as unknown as { entity_type: string; action: string }[]);
    expect(items.some((c) => c.entity_type === 'property' && c.action === 'update')).toBe(true);
  });
});
