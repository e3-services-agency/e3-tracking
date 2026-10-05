/**
 * T-4-11B (D-61, D-62): a backup round-trips the new catalog columns, the source system and method,
 * and the project default source (remapped to the restored source, set after the sources exist).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as SourceDAL from '../dal/source.dal';
import { buildBackup } from './backup.service';
import { previewRestore, applyRestore } from './backupRestore.service';

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

describe('backup restore: catalogs per market and sources', () => {
  it('restores kind, market, language, version, live snapshot, source system/method and the default source', async () => {
    const source = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    ProjectDAL.updateProject(projectId, { default_source_id: source.id });
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'products_gb', mapping_role: 'main', market: 'GB', language: 'en-GB', version: 'v2' });
    CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'title', is_searchable: true });
    CatalogDAL.setCatalogLive(projectId, catalog.id, true);

    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const { project } = await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored', client_id: client.id });

    const restoredSources = SourceDAL.listSources(project.id);
    expect(restoredSources).toHaveLength(1);
    expect(restoredSources[0]).toMatchObject({ name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    expect(restoredSources[0].id).not.toBe(source.id);
    expect(ProjectDAL.getProjectOrThrow(project.id).default_source_id).toBe(restoredSources[0].id);

    const [restoredCatalog] = CatalogDAL.listCatalogs(project.id);
    expect(restoredCatalog).toMatchObject({ kind: 'product', market: 'GB', language: 'en-GB', version: 'v2', searchable_snapshot_json: ['title'] });
    expect(restoredCatalog.live_at).toBeTruthy();
  });
});

describe('backup restore: catalog-linked property and a dangling default source', () => {
  it('a property linked to a catalog field is restored with remapped catalog and field ids', async () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'products_gb', mapping_role: 'main', market: 'GB' });
    const key = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'item_id', is_lookup_key: true });
    const PropertyDAL = await import('../dal/property.dal');
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string', mapped_catalog_id: catalog.id, mapped_catalog_field_id: key.id });

    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const { project } = await applyRestore(backup, preview.payload_hash, { name: 'Restored', key: 'restored', client_id: client.id });

    const [restoredCatalog] = CatalogDAL.listCatalogs(project.id);
    const [restoredField] = CatalogDAL.listCatalogFields(project.id, restoredCatalog.id);
    const restoredProp = PropertyDAL.listProperties(project.id).find((p) => p.name === 'product_id')!;
    expect(restoredCatalog.id).not.toBe(catalog.id);
    expect(restoredProp.mapped_catalog_id).toBe(restoredCatalog.id);
    expect(restoredProp.mapped_catalog_field_id).toBe(restoredField.id);
  });

  it('a default_source_id that points at no source in the file is a clean 400 and restores nothing', async () => {
    SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: null });
    const backup = (await buildBackup(projectId)) as { project: Record<string, unknown> };
    backup.project.default_source_id = 'no-such-source-id';
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'other', name: 'Other' });
    await expect(
      applyRestore(backup, preview.payload_hash, { name: 'Dangling', key: 'dangling', client_id: client.id })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', field: 'backup' });
    expect(ProjectDAL.listProjects().some((p) => p.key === 'dangling')).toBe(false);
  });
});
