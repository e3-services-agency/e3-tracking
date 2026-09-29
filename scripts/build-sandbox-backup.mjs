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
 *
 * T-4-EXIT W4 fix round (D-60): also attaches one trigger (title, description, page URL, and an
 * uploaded screenshot through the real `FileStore`) on `purchase`, so the bundled backup embeds at
 * least one real file instead of `files: []`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLES = path.join(ROOT, '.claude/team/samples');
const OUT_PATH = path.join(SAMPLES, 'sandbox-project-backup.json');
const SCRATCH_DB = path.join(ROOT, 'data', 'sandbox-build-scratch.sqlite');
const SCRATCH_FILES_DIR = path.join(ROOT, 'data', 'sandbox-build-scratch-files');

// Scratch, throwaway file (not `:memory:`): easier to inspect/delete by hand if the script fails
// partway through. Removed at the end regardless of outcome.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(SCRATCH_DB + suffix);
  } catch {
    // ignore: did not exist
  }
}
try {
  fs.rmSync(SCRATCH_FILES_DIR, { recursive: true, force: true });
} catch {
  // ignore: did not exist
}
process.env.E3_DB_PATH = SCRATCH_DB;
// A scratch files root (T-4-EXIT W4 fix round): the trigger screenshot below is written for real
// through `FileStore.put` so `buildBackup` embeds it, but must not land in the developer's own
// `./data/files` (the default when `E3_FILES_PATH` is unset).
process.env.E3_FILES_PATH = SCRATCH_FILES_DIR;

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES, name), 'utf-8'));
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** Recursively looks for any existing image file under `.claude/team/samples/` (T-4-EXIT W4 fix
 * round, D-60): none exists as of this writing, but a later QA fixture drop might add one, and
 * re-running this script should then pick it up instead of the generated placeholder below. */
function findExistingSampleImage(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findExistingSampleImage(full);
      if (found) return found;
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return full;
    }
  }
  return null;
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

/** A deterministic, minimal valid 1x1 red PNG (well-known fixture bytes), used only when no real
 * sample image exists under `.claude/team/samples/` -- so the bundled sandbox backup always embeds
 * one real trigger screenshot file (T-4-EXIT W4 fix round, D-60). */
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function loadTriggerScreenshotBytes() {
  const existing = findExistingSampleImage(SAMPLES);
  if (existing) {
    return { bytes: fs.readFileSync(existing), filename: path.basename(existing), mime: guessMime(existing) };
  }
  return {
    bytes: Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'),
    filename: 'purchase-confirmation.png',
    mime: 'image/png',
  };
}

async function main() {
  const { closeDb } = await import('../src/backend/db/index.ts');
  const ClientDAL = await import('../src/backend/dal/client.dal.ts');
  const ProjectDAL = await import('../src/backend/dal/project.dal.ts');
  const PropertyDAL = await import('../src/backend/dal/property.dal.ts');
  const EventDAL = await import('../src/backend/dal/event.dal.ts');
  const FindingDAL = await import('../src/backend/dal/finding.dal.ts');
  const UseCaseTemplateDAL = await import('../src/backend/dal/use-case-template.dal.ts');
  const { getFileStore } = await import('../src/backend/files/FileStore.ts');
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
    // D-63 (T-4-17): the item collection lists are arrays (the import leaves them untyped); retyping
    // lets PropertyDAL infer their state list kind and derivation.
    for (const name of ['product_ids', 'product_list', 'variant_ids', 'variant_list']) {
      const p = byName.get(name);
      if (p) PropertyDAL.updateProperty(projectId, p.id, { data_type: 'array', data_format: null });
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

    // 6. One trigger on `purchase`, with a real uploaded screenshot (T-4-EXIT W4 fix round, D-60):
    // title, description, the page URL it was captured on, and the stored file path, through the
    // same `FileStore.put` the event editor's upload uses -- so `buildBackup` embeds the bytes
    // instead of leaving `files: []`.
    const purchase = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase');
    if (purchase) {
      const { bytes, filename, mime } = loadTriggerScreenshotBytes();
      const stored = await getFileStore().put(projectId, 'triggers', filename, bytes, mime);
      EventDAL.updateEvent(projectId, purchase.id, {
        triggers_json: [
          {
            title: 'Checkout confirmation',
            description: 'The confirmation screen shown right after a successful purchase.',
            image_path: stored.path,
            source: 'https://shop.example.com/checkout/confirmation',
            order: 0,
          },
        ],
      });
    } else {
      console.warn('Could not find a "purchase" event to attach a trigger screenshot to.');
    }

    // 7. Full comparison recompute (all four engines).
    runComparison(projectId);

    // 8. Use case library: import the three-template sample, instantiate each into the project.
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

    // 9. Acknowledge one finding (D-42's manual-resolve path), so the sandbox shows that state too.
    runComparison(projectId);
    const openFindings = FindingDAL.listFindings(projectId, { status: 'open' });
    if (openFindings[0]) {
      FindingDAL.setFindingStatus(projectId, openFindings[0].id, 'resolved');
    }

    // 10. Serialise.
    const backup = await buildBackup(projectId);
    fs.writeFileSync(OUT_PATH, JSON.stringify(backup, null, 2));
    console.log(`Wrote ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
    console.log(`Embedded files: ${backup.files.length}, files_missing: ${backup.files_missing.length}`);
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
    try {
      fs.rmSync(SCRATCH_FILES_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
