/**
 * D-61 amendment (T-4-11B): catalog-linked properties print a one-line comment in the client snippets,
 * the Markdown copy has a Catalog column, and documentation.html shows sources and the catalog field.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as CatalogDAL from '../dal/catalog.dal';
import * as SourceDAL from '../dal/source.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import { buildTrackingDocument } from './document.service';
import { generateProjectDocumentationHtml } from './export.service';
import { eventCardToMarkdown } from '../../domain/document/markdown';

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

function seed() {
  const gb = CatalogDAL.createCatalog(projectId, { name: 'products_gb', mapping_role: 'main', market: 'GB' });
  const cz = CatalogDAL.createCatalog(projectId, { name: 'products_cz', kind: 'product', market: 'CZ' });
  const key = CatalogDAL.createCatalogField(projectId, gb.id, { name: 'item_id', is_lookup_key: true });
  CatalogDAL.createCatalogField(projectId, cz.id, { name: 'item_id', is_lookup_key: true });
  const prop = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'product_id', data_type: 'string', mapped_catalog_id: gb.id, mapped_catalog_field_id: key.id });
  const other = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'brand', data_type: 'string' });
  const source = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
  const event = EventDAL.createEvent(projectId, { name: 'view_x', source_ids: [source.id] });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: prop.id });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: other.id });
  return { cz, event };
}

describe('catalog link comments in codegen', () => {
  it('prints the comment in the client snippets and the Tracking API, with all markets when every market has the field', () => {
    seed();
    const card = buildTrackingDocument(projectId).events.find((e) => e.name === 'view_x')!;
    const line = '// product_id looks up products_gb by item_id; all markets';
    for (const key of ['datalayer', 'gtm', 'web_sdk', 'web_sdk_legacy', 'tracking_api'] as const) {
      expect((card.codegen[key] as string).startsWith(line)).toBe(true);
    }
    expect(card.codegen.gtm_template).not.toContain('looks up');
  });

  it('lists the markets that have the field when some market lacks it', () => {
    const { cz } = seed();
    const f = CatalogDAL.listCatalogFields(projectId, cz.id)[0];
    CatalogDAL.updateCatalogField(projectId, cz.id, f.id, { name: 'other_key' });
    const card = buildTrackingDocument(projectId).events.find((e) => e.name === 'view_x')!;
    expect(card.codegen.datalayer).toContain('// product_id looks up products_gb by item_id; GB');
  });

  it('a server_api event prints it in the Tracking API snippet', () => {
    const { event } = seed();
    EventDAL.updateEvent(projectId, event.id, { implementation_method: 'server_api' });
    const card = buildTrackingDocument(projectId).events.find((e) => e.name === 'view_x')!;
    expect(card.codegen.tracking_api.startsWith('// product_id looks up')).toBe(true);
  });
});

describe('Markdown and documentation.html', () => {
  it('Markdown has a Catalog column', () => {
    seed();
    const card = buildTrackingDocument(projectId).events.find((e) => e.name === 'view_x')!;
    const md = eventCardToMarkdown(card);
    expect(md).toContain('Catalog');
    expect(md).toContain('products_gb.item_id');
    expect(md).toContain('Shopify via GTM data layer');
  });

  it('documentation.html shows Collected from and the catalog field column', async () => {
    seed();
    const html = await generateProjectDocumentationHtml(projectId);
    expect(html).toContain('<dt>Collected from</dt><dd>Shop (Shopify via GTM data layer)</dd>');
    expect(html).toContain('<th>Catalog field</th>');
    expect(html).toContain('products_gb.item_id');
    expect(html).toContain('// product_id looks up products_gb by item_id; all markets');
  });
});

describe('T-4-23: lookup is per catalog kind (D-61)', () => {
  it('every catalog of a kind lists the properties linked to any catalog of that kind; other kinds stay separate', async () => {
    const { cz } = seed();
    const doc = buildTrackingDocument(projectId);
    const gb = doc.catalogs!.find((c) => c.name === 'products_gb')!;
    const czCat = doc.catalogs!.find((c) => c.name === 'products_cz')!;
    expect(gb.mapped_properties!.map((m) => m.property_name)).toEqual(['product_id']);
    expect(czCat.mapped_properties!.map((m) => m.property_name)).toEqual(['product_id']);
    const variantCat = CatalogDAL.createCatalog(projectId, { name: 'variants_gb', kind: 'variant' });
    expect(PropertyDAL.listPropertiesLookingUpCatalog(projectId, variantCat)).toEqual([]);
    expect(PropertyDAL.listPropertiesLookingUpCatalog(projectId, cz)).toHaveLength(1);
    expect(await generateProjectDocumentationHtml(projectId)).toContain('Looked up by (all product catalogs)');
  });
});
