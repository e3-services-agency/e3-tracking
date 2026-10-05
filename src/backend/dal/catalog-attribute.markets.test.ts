/**
 * T-4-11B (D-61, D-57): `catalog_attribute` requirements resolve per kind across the markets'
 * catalogs. Every market has the field: satisfied. A market lacks it: partial gap (status `gap`,
 * note listing the markets), and the preview carries the per-market result.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as CatalogDAL from './catalog.dal';
import * as UseCaseTemplateDAL from './use-case-template.dal';
import * as RequirementDAL from './requirement.dal';

let projectId: string;
let templateId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  templateId = UseCaseTemplateDAL.createUseCaseTemplate({
    code: 'T-CAT',
    name: 'Catalog template',
    type: 'marketing',
    default_requirements_json: [
      { target_kind: 'catalog_attribute', field_name: 'image', level: 'R' },
      { target_kind: 'catalog_attribute', field_name: 'price', level: 'O', note: 'Shown in the email.' },
    ],
  } as never).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

function market(name: string, role: string | null, market: string, fields: string[], kind = 'product') {
  const c = CatalogDAL.createCatalog(projectId, { name, mapping_role: role, kind, market });
  for (const f of fields) CatalogDAL.createCatalogField(projectId, c.id, { name: f });
  return c;
}

describe('catalog_attribute per kind (D-61)', () => {
  it('is satisfied when every catalog of the kind has the field', () => {
    market('products_gb', 'main', 'GB', ['image', 'price']);
    market('products_cz', null, 'CZ', ['image', 'price']);
    const preview = UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, templateId);
    expect(preview.unresolved).toEqual([]);
    expect(preview.resolved.every((r) => !r.partial)).toBe(true);
    expect(preview.resolved[0].catalog_markets?.map((m) => m.has_field)).toEqual([true, true]);
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, templateId);
    const reqs = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(reqs.map((r) => r.status)).toEqual([null, null]);
  });

  it('is a partial gap naming the markets that lack the field, and ignores catalogs of another kind', () => {
    market('products_gb', 'main', 'GB', ['image', 'price']);
    market('products_cz', null, 'CZ', ['price']);
    market('variants_gb', 'variant', 'GB', ['sku'], 'variant');
    const preview = UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, templateId);
    const image = preview.resolved.find((r) => r.index === 0)!;
    expect(image.partial).toBe(true);
    expect(image.partial_note).toContain('CZ');
    expect(image.catalog_markets?.map((m) => `${m.name}:${m.has_field}`)).toEqual(['products_cz:false', 'products_gb:true']);
    expect(preview.groups.find((g) => g.group === 'catalog')).toMatchObject({ total: 2, resolved: 1, status: 'mixed' });

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, templateId);
    const reqs = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(reqs[0]).toMatchObject({ target_kind: 'catalog_attribute', status: 'gap' });
    expect(reqs[0].catalog_field_id).not.toBeNull();
    expect(reqs[0].note).toContain('missing in: CZ');
    expect(reqs[1].status).toBeNull();
    expect(reqs[1].note).toBe('Shown in the email.');
  });

  it('still unresolved without a main catalog or when the main catalog lacks the field', () => {
    expect(UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, templateId).unresolved).toHaveLength(2);
    market('products_gb', 'main', 'GB', ['price']);
    const preview = UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, templateId);
    expect(preview.unresolved.map((u) => u.index)).toEqual([0]);
  });
});
