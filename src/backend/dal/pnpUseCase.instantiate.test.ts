/**
 * T-4-08 (D-59): round trip of the new library/template fields (`prerequisites_json`,
 * `expected_assets_json`, `source_json`, `documentation_url`, `internal_notes`, `internal_url`)
 * through `use-case-template.dal.ts`, and instantiating the generated welcome-flow template
 * (`samples/use-case-library-ucc.json`, converted from `samples/br-pnp/lwef-welcome-flow.json`)
 * against the data-mapping fixture project: catalog image/price/title/url/product_id resolve, and
 * the `newsletter` consent resolves to the project's own consent category (fixture's data-mapping
 * apply maps `consents.newsletter` -> `brand_consent`, D-59 acceptance wording).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as CatalogDAL from './catalog.dal';
import * as UseCaseTemplateDAL from './use-case-template.dal';
import * as RequirementDAL from './requirement.dal';
import { previewDataMapping, applyDataMapping } from '../services/dataMappingImport.service';
import { parseUseCaseLibrary } from '../../domain/import/useCaseLibrary';
import { ValidationError } from '../errors';
import * as UseCaseDAL from './use-case.dal';

const dataMappingFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json');
const dataMappingFixture = JSON.parse(fs.readFileSync(dataMappingFixturePath, 'utf-8'));
const uccFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/use-case-library-ucc.json');
const uccFixture = JSON.parse(fs.readFileSync(uccFixturePath, 'utf-8'));

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

describe('use-case-template.dal: D-59 fields round trip', () => {
  it('creates and reads prerequisites_json, expected_assets_json, source_json, documentation_url, internal_notes, internal_url', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T-D59',
      name: 'D-59 fields',
      type: 'marketing',
      prerequisites_json: ['Requires the main catalog.'],
      expected_assets_json: [{ type: 'campaign_design', headline: 'Email Campaign' }],
      source_json: { kind: 'pnp_usecase', template_id: 'synth', documentation_link: 'https://example.com/docs', callout: 'A quote.' },
      documentation_url: 'https://example.com/docs',
      internal_notes: 'internal note',
      internal_url: 'https://internal.example.com',
    });
    expect(template.prerequisites_json).toEqual(['Requires the main catalog.']);
    expect(template.expected_assets_json).toEqual([{ type: 'campaign_design', headline: 'Email Campaign' }]);
    expect(template.source_json).toEqual({ kind: 'pnp_usecase', template_id: 'synth', documentation_link: 'https://example.com/docs', callout: 'A quote.' });
    expect(template.documentation_url).toBe('https://example.com/docs');
    expect(template.internal_notes).toBe('internal note');
    expect(template.internal_url).toBe('https://internal.example.com');

    const updated = UseCaseTemplateDAL.updateUseCaseTemplate(template.id, { internal_notes: null });
    expect(updated.internal_notes).toBeNull();
    expect(updated.documentation_url).toBe('https://example.com/docs'); // unrelated field untouched
  });

  it('WARNING 8: rejects a non-http(s) documentation_url/internal_url (400) and a non-string value (400), on both templates and use cases', () => {
    expect(() =>
      UseCaseTemplateDAL.createUseCaseTemplate({
        code: 'UC-BAD-URL',
        name: 'Bad url',
        type: 'marketing',
        documentation_url: 'javascript:alert(1)',
      })
    ).toThrow(ValidationError);
    expect(() =>
      UseCaseTemplateDAL.createUseCaseTemplate({
        code: 'UC-BAD-URL-2',
        name: 'Bad url 2',
        type: 'marketing',
        // @ts-expect-error deliberately wrong type, probing the runtime guard
        documentation_url: 123,
      })
    ).toThrow(ValidationError);

    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-OK-URL', name: 'Ok url', type: 'marketing' });
    expect(() => UseCaseTemplateDAL.updateUseCaseTemplate(template.id, { internal_url: 'javascript:alert(1)' })).toThrow(
      ValidationError
    );

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(() => UseCaseDAL.updateUseCase(projectId, useCase.id, { name: useCase.name, documentation_url: 'ftp://nope' })).toThrow(
      ValidationError
    );
    // A valid http(s) URL, and clearing with null, both still work.
    const patched = UseCaseDAL.updateUseCase(projectId, useCase.id, { name: useCase.name, documentation_url: 'https://ok.example.com' });
    expect(patched.documentation_url).toBe('https://ok.example.com');
    const cleared = UseCaseDAL.updateUseCase(projectId, useCase.id, { name: useCase.name, documentation_url: null });
    expect(cleared.documentation_url).toBeNull();
  });

  it('pre-QA fix: createUseCase rejects a bad internal_notes/documentation_url with a ValidationError, not a 500-mapped DatabaseError', () => {
    // Before the fix, normalizeHttpUrl/normalizeOptionalText ran *inside* createUseCase's
    // try/catch (as part of evaluating the .run({...}) argument), so the ValidationError they threw
    // was caught and remapped by mapWriteError into a generic DatabaseError (no SQLite constraint
    // code matches, so mapWriteError's fallback fires) -- a 500, not the 400 the field guard promises.
    expect(() =>
      UseCaseDAL.createUseCase(projectId, {
        name: 'Bad create',
        // @ts-expect-error deliberately wrong type, probing the runtime guard
        internal_notes: 123,
      })
    ).toThrow(ValidationError);
    expect(() =>
      UseCaseDAL.createUseCase(projectId, { name: 'Bad create 2', documentation_url: 'javascript:alert(1)' })
    ).toThrow(ValidationError);
    expect(() =>
      UseCaseDAL.createUseCase(projectId, { name: 'Bad create 3', internal_url: 'ftp://nope' })
    ).toThrow(ValidationError);

    const good = UseCaseDAL.createUseCase(projectId, {
      name: 'Good create',
      documentation_url: 'https://example.com/docs',
      internal_notes: 'a note',
      internal_url: 'https://internal.example.com',
    });
    expect(good.documentation_url).toBe('https://example.com/docs');
    expect(good.internal_notes).toBe('a note');
    expect(good.internal_url).toBe('https://internal.example.com');
  });

  it('instantiate copies documentation_url/internal_notes/internal_url from the template onto the use case', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T-COPY',
      name: 'Copy test',
      type: 'marketing',
      documentation_url: 'https://example.com/docs',
      internal_notes: 'internal note',
      internal_url: 'https://internal.example.com',
    });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(useCase.documentation_url).toBe('https://example.com/docs');
    expect(useCase.internal_notes).toBe('internal note');
    expect(useCase.internal_url).toBe('https://internal.example.com');
  });
});

describe('generated welcome-flow template instantiated on the data-mapping fixture project (D-59 acceptance)', () => {
  beforeEach(() => {
    const preview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(projectId, dataMappingFixture, preview.payload_hash, preview.items.map((i) => i.id));

    // `item_id`, not `product_id` (WARNING 7, D-57 amendment): the Bloomreach main catalog's own
    // column name, exercising the alias `resolveEntry` now applies for `catalog_attribute`.
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products', mapping_role: 'main' });
    for (const field of ['image', 'price', 'title', 'url', 'item_id']) {
      CatalogDAL.createCatalogField(projectId, catalog.id, { name: field });
    }

    const libraryModel = parseUseCaseLibrary(uccFixture);
    for (const t of libraryModel.templates) {
      UseCaseTemplateDAL.createUseCaseTemplate({
        code: t.code,
        name: t.name,
        type: t.type,
        description: t.description,
        default_requirements_json: t.default_requirements,
        narrative_template: t.narrative_template,
        tags_json: t.tags,
        flags_json: t.flags,
        prerequisites_json: t.prerequisites,
        expected_assets_json: t.expected_assets,
        source_json: t.source,
        documentation_url: t.documentation_url,
      });
    }
  });

  it('resolves the catalog fields and the newsletter consent, carries documentation_url onto the use case', () => {
    const template = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'LWEF-WELCOME-FLOW')!;
    expect(template).toBeDefined();
    expect(template.documentation_url).toBe('https://documentation.bloomreach.com/engagement/docs/welcome-flow');

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(useCase.documentation_url).toBe('https://documentation.bloomreach.com/engagement/docs/welcome-flow');

    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    const catalogReqs = requirements.filter((r) => r.target_kind === 'catalog_attribute');
    expect(catalogReqs).toHaveLength(5);
    expect(catalogReqs.every((r) => r.catalog_field_id !== null)).toBe(true);

    const consentReq = requirements.find((r) => r.target_kind === 'consent')!;
    expect(consentReq).toBeDefined();
    expect(consentReq.consent_category_id).not.toBeNull();
  });
});
