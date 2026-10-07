#!/usr/bin/env node
/**
 * D-60 (T-4-09, rewritten in T-4-11 part A): rebuilds `.claude/team/samples/sandbox-project-backup.json`,
 * the bundled backup `POST /api/projects/sandbox` restores.
 *
 * The project is no longer the QA fixture chain: it is built from the hand-written, readable seed in
 * `scripts/sandbox-seed.mjs` through the app's own DAL and services (no raw SQL), against a scratch
 * on-disk SQLite database, then serialised with `backup.service.ts#buildBackup` (D-45). The fixtures
 * (`data-mapping.json`, Data Manager files, `customer-events-export.json`) stay in the tests; only
 * `use-case-library-sample.json` is still read, as the library the three use cases come from.
 *
 * Run with `npx tsx scripts/build-sandbox-backup.mjs` (tsx transpiles the imported `.ts` modules).
 * Re-run whenever the schema or the seed changes. Regenerating from an unchanged seed differs only in
 * timestamps and ids.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPng } from './sandbox-png.mjs';
import * as seed from './sandbox-seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLES = path.join(ROOT, '.claude/team/samples');
const OUT_PATH = path.join(SAMPLES, 'sandbox-project-backup.json');
const SCRATCH_DB = path.join(ROOT, 'data', 'sandbox-build-scratch.sqlite');
const SCRATCH_FILES_DIR = path.join(ROOT, 'data', 'sandbox-build-scratch-files');

function cleanScratch() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(SCRATCH_DB + suffix);
    } catch {
      // did not exist
    }
  }
  fs.rmSync(SCRATCH_FILES_DIR, { recursive: true, force: true });
}
cleanScratch();
process.env.E3_DB_PATH = SCRATCH_DB;
// Trigger screenshots go through the real FileStore, but into a scratch root, not ./data/files.
process.env.E3_FILES_PATH = SCRATCH_FILES_DIR;

/** Two mock screenshots (320x200): a page with a coloured product block and a button. */
function triggerImage(kind) {
  const common = { width: 320, height: 200, background: [245, 246, 248] };
  const header = { x: 0, y: 0, w: 320, h: 24, color: [34, 49, 63] };
  if (kind === 'cart') {
    return renderPng({
      ...common,
      rects: [header, { x: 20, y: 44, w: 120, h: 110, color: [96, 165, 250] }, { x: 160, y: 140, w: 130, h: 32, color: [22, 163, 74] }],
      texts: [
        { x: 10, y: 8, scale: 1, color: [255, 255, 255], text: 'ACME EU' },
        { x: 160, y: 50, scale: 2, color: [30, 41, 59], text: 'TRAIL RUNNER' },
        { x: 160, y: 80, scale: 2, color: [30, 41, 59], text: '59.90 EUR' },
        { x: 172, y: 151, scale: 1, color: [255, 255, 255], text: 'ADD TO CART' },
      ],
    });
  }
  return renderPng({
    ...common,
    rects: [header, { x: 20, y: 44, w: 280, h: 70, color: [220, 252, 231] }, { x: 20, y: 130, w: 150, h: 32, color: [37, 99, 235] }],
    texts: [
      { x: 10, y: 8, scale: 1, color: [255, 255, 255], text: 'ACME EU CHECKOUT' },
      { x: 32, y: 56, scale: 2, color: [22, 101, 52], text: 'THANK YOU' },
      { x: 32, y: 84, scale: 1, color: [22, 101, 52], text: 'ORDER ORD-5001 CONFIRMED' },
      { x: 32, y: 141, scale: 1, color: [255, 255, 255], text: 'CONTINUE SHOPPING' },
    ],
  });
}

function must(value, what) {
  if (value === undefined || value === null) throw new Error(`Seed refers to ${what}, which does not exist.`);
  return value;
}

async function main() {
  const { closeDb } = await import('../src/backend/db/index.ts');
  const ClientDAL = await import('../src/backend/dal/client.dal.ts');
  const ProjectDAL = await import('../src/backend/dal/project.dal.ts');
  const PropertyDAL = await import('../src/backend/dal/property.dal.ts');
  const DefinitionDAL = await import('../src/backend/dal/property-definition.dal.ts');
  const BundleDAL = await import('../src/backend/dal/bundle.dal.ts');
  const EventDAL = await import('../src/backend/dal/event.dal.ts');
  const VariantDAL = await import('../src/backend/dal/variant.dal.ts');
  const MappingDAL = await import('../src/backend/dal/standard-event-mapping.dal.ts');
  const RuleDAL = await import('../src/backend/dal/rule.dal.ts');
  const CatalogDAL = await import('../src/backend/dal/catalog.dal.ts');
  const SourceDAL = await import('../src/backend/dal/source.dal.ts');
  const ConsentDAL = await import('../src/backend/dal/consent-category.dal.ts');
  const IdentityDAL = await import('../src/backend/dal/identity-rule.dal.ts');
  const IdentifierDAL = await import('../src/backend/dal/identifier.dal.ts');
  const QaRunDAL = await import('../src/backend/dal/qa-run.dal.ts');
  const ObservationDAL = await import('../src/backend/dal/observation.dal.ts');
  const FindingDAL = await import('../src/backend/dal/finding.dal.ts');
  const UseCaseDAL = await import('../src/backend/dal/use-case.dal.ts');
  const RequirementDAL = await import('../src/backend/dal/requirement.dal.ts');
  const UseCaseTemplateDAL = await import('../src/backend/dal/use-case-template.dal.ts');
  const CommentDAL = await import('../src/backend/dal/comment.dal.ts');
  const { getFileStore } = await import('../src/backend/files/FileStore.ts');
  const { previewUseCaseLibrary, applyUseCaseLibrary } = await import('../src/backend/services/useCaseLibraryImport.service.ts');
  const { regenerateNarrative } = await import('../src/backend/services/useCaseNarrative.service.ts');
  const { computeUseCaseCoverage } = await import('../src/backend/services/useCaseCoverage.service.ts');
  const { runComparison } = await import('../src/backend/services/comparison.service.ts');
  const { buildBackup } = await import('../src/backend/services/backup.service.ts');
  const { runWithActor } = await import('../src/backend/context/actor.ts');

  await runWithActor({ actor: 'build-sandbox-backup', source: 'system' }, async () => {
    const client = ClientDAL.createClient(seed.CLIENT);
    const project = ProjectDAL.createProject({ client_id: client.id, key: seed.PROJECT.key, name: seed.PROJECT.name });
    const projectId = project.id;
    ProjectDAL.updateProject(projectId, { industry: seed.PROJECT.industry, description: seed.PROJECT.description });

    // 1. Properties: customer, then event scope.
    const prop = new Map(); // `${scope}:${name}` -> row
    for (const c of seed.CUSTOMER_PROPERTIES) {
      prop.set(
        `customer:${c.name}`,
        PropertyDAL.createProperty(projectId, {
          scope: 'customer',
          name: c.name,
          data_type: c.data_type,
          pii: c.pii ?? false,
          description: c.description,
          bloomreach_customer_property: c.bloomreach_customer_property ?? null,
          allowed_values_json: c.allowed ?? [],
          example_values_json: c.examples ?? [],
          status: 'implemented',
        })
      );
    }
    // definition id by `${property}:${definition name}`
    const definitionId = new Map();
    for (const e of seed.EVENT_PROPERTIES) {
      const created = PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: e.name,
        data_type: e.data_type,
        data_formats_json: e.formats ?? [],
        pii: e.pii ?? false,
        description: e.description,
        allowed_values_json: e.allowed ?? [],
        example_values_json: e.examples ?? [],
        item_schema_json: e.item_schema ?? undefined,
        ...(e.kind ? { kind: e.kind } : {}),
        status: 'implemented',
      });
      prop.set(`event:${e.name}`, created);
      for (const d of e.definitions ?? []) {
        const def = DefinitionDAL.createDefinition(projectId, created.id, {
          name: d.name,
          description: d.description,
          allowed_values_json: d.allowed ?? [],
          example_values_json: d.examples ?? [],
        });
        definitionId.set(`${e.name}:${d.name}`, def.id);
      }
    }
    const ep = (name) => must(prop.get(`event:${name}`), `event property "${name}"`);

    // 2. Bundles.
    const bundle = new Map();
    for (const b of seed.BUNDLES) {
      bundle.set(b.name, BundleDAL.createBundle(projectId, { name: b.name, description: b.description, property_ids: b.properties.map((n) => ep(n).id) }));
    }

    // 2b. Sources (D-62); the project default source is set once the events exist.
    const sources = new Map();
    for (const s of seed.SOURCES) sources.set(s.name, SourceDAL.createSource(projectId, s));

    // 3. Events, their property links, variants and trigger screenshots.
    const events = new Map();
    const variants = new Map(); // `${event}:${prop}=${value}` -> row
    for (const e of seed.EVENTS) {
      const { props, variants: variantSpecs, triggers, bundles, ...fields } = e;
      const sourceName = seed.EVENT_SOURCES[e.name];
      const event = EventDAL.createEvent(projectId, {
        ...fields,
        source_ids: sourceName ? [must(sources.get(sourceName), `source "${sourceName}"`).id] : [],
      });
      events.set(e.name, event);
      for (const b of bundles ?? []) EventDAL.attachBundleToEvent(projectId, event.id, must(bundle.get(b), `bundle "${b}"`).id);
      props.forEach((link, index) => {
        const property = ep(link.name);
        EventDAL.attachPropertyToEvent(projectId, event.id, {
          property_id: property.id,
          required: link.required ?? false,
          role: link.role ?? 'normal',
          definition_id: link.definition ? must(definitionId.get(`${link.name}:${link.definition}`), `definition "${link.definition}"`) : undefined,
          sort_order: index,
        });
      });
      for (const spec of variantSpecs ?? []) {
        const conditions = Object.entries(spec).map(([name, value]) => ({ property_id: ep(name).id, operator: 'equals', values: [value] }));
        const variant = VariantDAL.createVariant(projectId, event.id, { conditions });
        variants.set(`${e.name}:${Object.entries(spec).map(([k, v]) => `${k}=${v}`).join(',')}`, variant);
      }
      if (triggers?.length) {
        const stored = [];
        for (const [order, t] of triggers.entries()) {
          const file = await getFileStore().put(projectId, 'triggers', `${e.name}-${t.image}.png`, triggerImage(t.image), 'image/png');
          stored.push({ title: t.title, description: t.description, image_path: file.path, source: t.source, order });
        }
        EventDAL.updateEvent(projectId, event.id, { triggers_json: stored });
      }
    }

    // 4. Standard event mappings.
    for (const m of seed.STANDARD_MAPPINGS) {
      const fieldMap = {};
      for (const f of m.fields) fieldMap[f] = ep(f).id;
      for (const [standardField, propertyName] of Object.entries(m.renamed ?? {})) fieldMap[standardField] = ep(propertyName).id;
      const variantKey = m.variant ? Object.entries(m.variant).map(([k, v]) => `${k}=${v}`).join(',') : null;
      MappingDAL.upsertStandardEventMapping(projectId, m.standard, {
        event_id: must(events.get(m.event), `event "${m.event}"`).id,
        variant_id: variantKey ? must(variants.get(`${m.event}:${variantKey}`), `variant ${m.event}:${variantKey}`).id : null,
        field_map_json: fieldMap,
      });
    }

    // 5. Rules from the seed templates.
    for (const r of seed.RULE_TEMPLATES) {
      RuleDAL.createRulesFromTemplate(projectId, must(events.get(r.event), `event "${r.event}"`).id, r.template);
    }

    // 6. Catalog, consent categories, identity rules.
    ProjectDAL.updateProject(projectId, { default_source_id: must(sources.get(seed.DEFAULT_SOURCE), `source "${seed.DEFAULT_SOURCE}"`).id });
    const catalogFieldId = new Map(); // `${catalog}.${field}` -> { catalogId, fieldId }
    for (const { fields: catalogFields, live, ...catalogFields0 } of seed.CATALOGS) {
      const catalog = CatalogDAL.createCatalog(projectId, catalogFields0);
      for (const f of catalogFields) {
        const created = CatalogDAL.createCatalogField(projectId, catalog.id, f);
        catalogFieldId.set(`${catalog.name}.${f.name}`, { catalogId: catalog.id, fieldId: created.id });
      }
      if (live) CatalogDAL.setCatalogLive(projectId, catalog.id, true);
    }
    for (const [propertyName, target] of Object.entries(seed.PROPERTY_CATALOG_LINKS)) {
      const link = must(catalogFieldId.get(target), `catalog field "${target}"`);
      PropertyDAL.updateProperty(projectId, ep(propertyName).id, { mapped_catalog_id: link.catalogId, mapped_catalog_field_id: link.fieldId });
    }
    seed.CONSENT_CATEGORIES.forEach((c, sort_order) => ConsentDAL.createConsentCategory(projectId, { ...c, sort_order }));
    for (const ident of seed.IDENTIFIERS) IdentifierDAL.createIdentifier(projectId, ident);
    seed.IDENTITY_RULES.forEach((r, sort_order) => {
      const { trigger_event, transformations, source, ...rest } = r;
      IdentityDAL.createIdentityRule(projectId, {
        ...rest,
        source_id: source ? must(sources.get(source), `source "${source}"`).id : null,
        trigger_event_id: trigger_event ? must(events.get(trigger_event), `event "${trigger_event}"`).id : null,
        transformations_json: transformations ?? null,
        sort_order,
      });
    });

    for (const [eventName, identifiers] of Object.entries(seed.EVENT_IDENTIFIERS)) {
      EventDAL.updateEvent(projectId, must(events.get(eventName), `event "${eventName}"`).id, { identifiers_json: identifiers });
    }

    // 7. Use cases from the library sample (statuses set, narratives generated).
    const library = JSON.parse(fs.readFileSync(path.join(SAMPLES, 'use-case-library-sample.json'), 'utf-8'));
    const libraryPreview = previewUseCaseLibrary(library);
    applyUseCaseLibrary(library, libraryPreview.payload_hash, libraryPreview.items.map((i) => i.id));
    const useCases = new Map();
    for (const code of seed.USE_CASE_CODES) {
      const template = must(UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === code), `library template ${code}`);
      // The sample's gap note is written for QA ("Deliberately unresolvable..."); show a client-safe one.
      if (seed.REQUIREMENT_NOTE_OVERRIDES[code]) {
        UseCaseTemplateDAL.updateUseCaseTemplate(template.id, {
          default_requirements_json: template.default_requirements_json.map((r) => {
            const note = seed.REQUIREMENT_NOTE_OVERRIDES[code][r.event_name ?? ''];
            return note ? { ...r, note } : r;
          }),
        });
      }
      const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id, {});
      UseCaseDAL.updateUseCase(projectId, useCase.id, { status: seed.USE_CASE_STATUS[code] });
      regenerateNarrative(projectId, useCase.id, false);
      useCases.set(code, useCase);
    }

    // 8. QA run: observations, then the full comparison.
    const run = QaRunDAL.createQaRun(projectId, seed.QA_RUN);
    for (const o of seed.OBSERVATIONS) {
      ObservationDAL.createObservation(projectId, run.id, {
        source: 'manual',
        event_type: o.event,
        timestamp: seed.T0 + o.t,
        properties: o.props,
        page_url: o.page ?? null,
      });
    }
    QaRunDAL.finishQaRun(projectId, run.id);
    runComparison(projectId);

    // Every kind the seed meant to provoke has to show up as an open finding.
    const open = FindingDAL.listFindings(projectId, { status: 'open' });
    const kinds = new Set(open.map((f) => f.kind));
    for (const wanted of new Set(seed.OBSERVATIONS.map((o) => o.expect).filter(Boolean))) {
      if (!kinds.has(wanted)) throw new Error(`Seed expects a "${wanted}" finding but the comparison produced: ${[...kinds].join(', ')}`);
    }
    // Every kind the docs (QA-LOCAL.md sandbox recipe) promise, including both unknown_variant comparisons.
    for (const wanted of ['missing_event', 'rename_mismatch', 'unmapped_catalog', 'shape_inconsistent', 'state_list_mismatch']) {
      if (!kinds.has(wanted)) throw new Error(`Docs promise a "${wanted}" finding but the comparison did not produce one.`);
    }
    // D-61: the one deliberate catalog drift (CZ stock_level is text) and nothing else from the catalogs comparison.
    const catalogFindings = open.filter((f) => f.comparison === 'catalogs');
    if (catalogFindings.length !== 1 || catalogFindings[0].kind !== 'catalog_schema_drift') {
      throw new Error(`Expected exactly one catalog_schema_drift finding, got: ${catalogFindings.map((f) => f.kind + ': ' + f.message).join(' | ') || 'none'}`);
    }
    const unknownVariantComparisons = new Set(open.filter((f) => f.kind === 'unknown_variant').map((f) => f.comparison));
    for (const comparison of ['definition_vs_observations', 'mapping_vs_observations']) {
      if (!unknownVariantComparisons.has(comparison)) throw new Error(`No unknown_variant finding from ${comparison}.`);
    }

    // 9. Acknowledge one error finding (D-42's manual-resolve path).
    const toAcknowledge = open.find((f) => f.kind === 'enum_violation' && f.severity === 'error');
    if (!toAcknowledge) throw new Error('No enum_violation error finding to acknowledge.');
    FindingDAL.setFindingStatus(projectId, toAcknowledge.id, 'resolved');

    // 10. Comments (client via share, internal reply, internal-only note, one on a requirement).
    for (const c of seed.COMMENTS) {
      let entityType;
      let entityId;
      if (c.entity.startsWith('event:')) {
        entityType = 'event';
        entityId = must(events.get(c.entity.slice(6)), `event "${c.entity}"`).id;
      } else {
        const [, code, index] = c.entity.split(':');
        entityType = 'requirement';
        entityId = must(RequirementDAL.listRequirements(projectId, must(useCases.get(code), `use case ${code}`).id)[Number(index)], `requirement ${c.entity}`).id;
      }
      CommentDAL.createComment(projectId, { entity_type: entityType, entity_id: entityId, author_name: c.author, body: c.body, via_share: c.via_share, internal_only: c.internal_only ?? false });
    }

    // Coverage is computed on read; evaluate it once so a broken seed fails here, not in the UI.
    for (const useCase of useCases.values()) computeUseCaseCoverage(projectId, useCase.id);

    // 11. Serialise.
    const backup = await buildBackup(projectId);
    fs.writeFileSync(OUT_PATH, JSON.stringify(backup));
    console.log(`Wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
    console.log(`Embedded files: ${backup.files.length}, files_missing: ${backup.files_missing.length}`);
    console.log(
      'Findings open by kind:',
      JSON.stringify(
        FindingDAL.listFindings(projectId, { status: 'open' }).reduce((acc, f) => ((acc[f.kind] = (acc[f.kind] ?? 0) + 1), acc), {})
      )
    );
  });

  closeDb();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(cleanScratch);
