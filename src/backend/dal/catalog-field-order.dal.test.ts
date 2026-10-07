/** T-4-33: catalog field order (sort_order) and the reorder DAL. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as CatalogDAL from './catalog.dal';
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
