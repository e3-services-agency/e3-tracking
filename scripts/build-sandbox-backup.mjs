#!/usr/bin/env node
/**
 * D-60 (T-4-09): rebuilds `.claude/team/samples/sandbox-project-backup.json`, the bundled backup
 * `POST /api/projects/sandbox` restores. Runs the same fixtures through the real import services and
 * DAL used by the phase 1/2 fixture tests (`comparison.service.test.ts`, `docs/QA-LOCAL.md`'s
 * "Phase 1 round-trip recipe") against a scratch, on-disk SQLite database, then serialises the
 * result with `backup.service.ts#buildBackup` (the same full JSON backup format restore already
 * understands, D-45).
 *
 * Run with `npx tsx scripts/build-sandbox-backup.mjs` (no build step needed, `tsx` transpiles the
 * imported `.ts` modules on the fly, same as `scripts/build-ucc-library.mjs`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLES = path.join(ROOT, '.claude/team/samples');
const OUT_PATH = path.join(SAMPLES, 'sandbox-project-backup.json');
const SCRATCH_DB = path.join(ROOT, 'data', 'sandbox-build-scratch.sqlite');

// Scratch, throwaway file (not `:memory:`): easier to inspect/delete by hand if the script fails
// partway through. Removed at the end regardless of outcome.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(SCRATCH_DB + suffix);
  } catch {
    // ignore: did not exist
  }
}
process.env.E3_DB_PATH = SCRATCH_DB;

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES, name), 'utf-8'));
}

async function main() {
  const { closeDb } = await import('../src/backend/db/index.ts');
  const ClientDAL = await import('../src/backend/dal/client.dal.ts');
  const ProjectDAL = await import('../src/backend/dal/project.dal.ts');
  const PropertyDAL = await import('../src/backend/dal/property.dal.ts');
  const FindingDAL = await import('../src/backend/dal/finding.dal.ts');
  const UseCaseTemplateDAL = await import('../src/backend/dal/use-case-template.dal.ts');
  const { previewDataMapping, applyDataMapping } = await import('../src/backend/services/dataMappingImport.service.ts');
  const { previewExpirationSettings, applyExpirationSettings } = await import(
    '../src/backend/services/expirationSettingsImport.service.ts'
  );
  const { previewDataManagerCustomers, applyDataManagerCustomers } = await import(
    '../src/backend/services/dataManagerCustomersImport.service.ts'
  );
  const { previewDataManagerEvents, applyDataManagerEvents } = await import(
    '../src/backend/services/dataManagerEventsImport.service.ts'
  );
  const { previewCustomerEventsExport, applyCustomerEventsExport } = await import(
    '../src/backend/services/customerEventsExportImport.service.ts'
  );
  const { previewUseCaseLibrary, applyUseCaseLibrary } = await import(
    '../src/backend/services/useCaseLibraryImport.service.ts'
  );
  const { runComparison } = await import('../src/backend/services/comparison.service.ts');
  const { buildBackup } = await import('../src/backend/services/backup.service.ts');
  const { runWithActor } = await import('../src/backend/context/actor.ts');

  await runWithActor({ actor: 'build-sandbox-backup', source: 'system' }, async () => {
    const client = ClientDAL.createClient({ key: 'sandbox-fixture', name: 'Sandbox fixture client' });
    const project = ProjectDAL.createProject({
      client_id: client.id,
      key: 'sandbox-fixture',
      name: 'Sandbox: Acme EU',
    });
    const projectId = project.id;

    // 1. Data mapping.
    const dataMapping = readFixture('data-mapping.json');
    const mappingPreview = previewDataMapping(projectId, dataMapping);
    applyDataMapping(
      projectId,
      dataMapping,
      mappingPreview.payload_hash,
      mappingPreview.items.map((i) => i.id)
    );

    // 2. Expiration settings.
    const expirationSettings = readFixture('expiration-settings.json');
    const expirationPreview = previewExpirationSettings(projectId, expirationSettings);
    applyExpirationSettings(
      projectId,
      expirationSettings,
      expirationPreview.payload_hash,
      expirationPreview.items.map((i) => i.id)
    );

    // 3. Retype recipe (docs/QA-LOCAL.md "Phase 1 round-trip recipe" step 4): so the fixture's
    // type_mismatch findings fire once observations are compared.
    const properties = PropertyDAL.listProperties(projectId);
    const byName = new Map(properties.map((p) => [p.name, p]));
    const moneyProps = ['total_price', 'price'];
    const numberProps = ['quantity', 'total_quantity', 'stock_level'];
    for (const name of moneyProps) {
      const p = byName.get(name);
      if (p) PropertyDAL.updateProperty(projectId, p.id, { data_type: 'number', data_format: 'money' });
    }
    for (const name of numberProps) {
      const p = byName.get(name);
      if (p) PropertyDAL.updateProperty(projectId, p.id, { data_type: 'number', data_format: null });
    }
    const isNew = byName.get('is_new');
    if (isNew) PropertyDAL.updateProperty(projectId, isNew.id, { data_type: 'boolean', data_format: null });

    // 4. Data Manager files.
    const dmCustomers = readFixture('data-manager-customers.json');
    const dmCustomersPreview = previewDataManagerCustomers(projectId, dmCustomers);
    applyDataManagerCustomers(
      projectId,
      dmCustomers,
      dmCustomersPreview.payload_hash,
      dmCustomersPreview.items.map((i) => i.id)
    );
    const dmEvents = readFixture('data-manager-events.json');
    const dmEventsPreview = previewDataManagerEvents(projectId, dmEvents);
    applyDataManagerEvents(
      projectId,
      dmEvents,
      dmEventsPreview.payload_hash,
      dmEventsPreview.items.map((i) => i.id)
    );

    // 5. Customer events export -> one QA run, 19 observations, comparison 3 runs automatically.
    const customerEvents = readFixture('customer-events-export.json');
    const eventsPreview = previewCustomerEventsExport(projectId, customerEvents);
    applyCustomerEventsExport(
      projectId,
      customerEvents,
      eventsPreview.payload_hash,
      eventsPreview.items.map((i) => i.id),
      'build-sandbox-backup'
    );

    // 6. Full comparison recompute (all four engines).
    runComparison(projectId);

    // 7. Use case library: import the three-template sample, instantiate each into the project.
    const library = readFixture('use-case-library-sample.json');
    const libraryPreview = previewUseCaseLibrary(library);
    applyUseCaseLibrary(
      library,
      libraryPreview.payload_hash,
      libraryPreview.items.map((i) => i.id)
    );
    const templates = UseCaseTemplateDAL.listUseCaseTemplates().filter((t) =>
      ['UC-01', 'UC-02', 'UC-03'].includes(t.code)
    );
    for (const template of templates) {
      try {
        UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id, {});
      } catch (err) {
        console.warn(`Could not instantiate template ${template.code}: ${err.message}`);
      }
    }

    // 8. Acknowledge one finding (D-42's manual-resolve path), so the sandbox shows that state too.
    runComparison(projectId);
    const openFindings = FindingDAL.listFindings(projectId, { status: 'open' });
    if (openFindings[0]) {
      FindingDAL.setFindingStatus(projectId, openFindings[0].id, 'resolved');
    }

    // 9. Serialise.
    const backup = await buildBackup(projectId);
    fs.writeFileSync(OUT_PATH, JSON.stringify(backup, null, 2));
    console.log(`Wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
  });

  closeDb();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(SCRATCH_DB + suffix);
      } catch {
        // ignore
      }
    }
  });
