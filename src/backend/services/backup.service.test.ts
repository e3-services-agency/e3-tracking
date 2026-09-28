/**
 * `buildBackup` (D-45, T-3-04): fixture project with the data-mapping/expiration/Data Manager
 * fixtures applied, one instantiated use case from a template, a QA run + finding, one uploaded
 * trigger screenshot and one soft-deleted event -> every array has the expected shape, the file
 * entry decodes to the uploaded bytes, `project.id`/`client_id` are absent, referenced
 * `use_case_templates` are included in full, `change_log` rows are present, the soft-deleted event
 * is included with `deleted_at` set.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { getFileStore } from '../files/FileStore';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { previewExpirationSettings, applyExpirationSettings } from './expirationSettingsImport.service';
import { previewDataManagerCustomers, applyDataManagerCustomers } from './dataManagerCustomersImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { previewCustomerEventsExport, applyCustomerEventsExport } from './customerEventsExportImport.service';
import { runComparison } from './comparison.service';
import { buildBackup } from './backup.service';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../../domain/enums';

const samplesDir = path.resolve(__dirname, '../../../.claude/team/samples');
const dataMappingFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-mapping.json'), 'utf-8'));
const expirationFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'expiration-settings.json'), 'utf-8'));
const dataManagerCustomersFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-customers.json'), 'utf-8'));
const dataManagerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-events.json'), 'utf-8'));
const customerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'customer-events-export.json'), 'utf-8'));

let projectId: string;
let filesDir: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-backup-test-'));
  process.env.E3_FILES_PATH = filesDir;
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme', bloomreach_account_id: 'acc-1', notes: 'ref only' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
  fs.rmSync(filesDir, { recursive: true, force: true });
});

/** Same "phase 1 test definition" retyping every T-2-0x fixture test shares. */
function retypeForTypeMismatches(): void {
  for (const name of ['total_price', 'price']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number', data_formats_json: ['money'] });
  }
  for (const name of ['quantity', 'total_quantity', 'stock_level']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number' });
  }
}

function applyAllFixtures(): void {
  const dm = previewDataMapping(projectId, dataMappingFixture);
  applyDataMapping(projectId, dataMappingFixture, dm.payload_hash, dm.items.map((i) => i.id));

  const exp = previewExpirationSettings(projectId, expirationFixture);
  applyExpirationSettings(projectId, expirationFixture, exp.payload_hash, exp.items.map((i) => i.id));

  retypeForTypeMismatches();

  const dmc = previewDataManagerCustomers(projectId, dataManagerCustomersFixture);
  applyDataManagerCustomers(projectId, dataManagerCustomersFixture, dmc.payload_hash, dmc.items.map((i) => i.id));

  const dme = previewDataManagerEvents(projectId, dataManagerEventsFixture);
  applyDataManagerEvents(
    projectId,
    dataManagerEventsFixture,
    dme.payload_hash,
    dme.items.filter((i) => i.default_selected).map((i) => i.id)
  );

  const cee = previewCustomerEventsExport(projectId, customerEventsFixture);
  applyCustomerEventsExport(projectId, customerEventsFixture, cee.payload_hash, cee.items.map((i) => i.id), 'Jan');

  runComparison(projectId);
}

describe('buildBackup on the Data Manager fixture project', () => {
  it('every table array has the expected counts, files embed, ids stripped from project, templates included, soft-deleted rows survive', async () => {
    applyAllFixtures();

    // Upload one trigger screenshot on an existing event (T-3-04 acceptance).
    const purchase = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase');
    expect(purchase).toBeTruthy();
    const imageBytes = Buffer.from('fake-png-bytes');
    const stored = await getFileStore().put(projectId, 'triggers', 'screenshot.png', imageBytes, 'image/png');
    EventDAL.updateEvent(projectId, purchase!.id, {
      triggers_json: [{ title: 'Checkout screenshot', description: 'purchase confirmation', image_path: stored.path, order: 0 }],
    });

    // A use case instantiated from a template (referenced templates included in full).
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-BACKUP-01',
      name: 'Backup test use case',
      type: 'marketing',
      default_requirements_json: [],
    });
    UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);

    // A QA run + observation + (via runComparison) findings, exercised again after the use case.
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'manual',
      event_type: 'purchase',
      timestamp: 1700000000,
      properties: {},
    });
    runComparison(projectId);

    // A soft-deleted event: still present in the backup with `deleted_at` set.
    const toDelete = EventDAL.createEvent(projectId, { name: 'backup_soft_delete_event', class: 'custom' });
    EventDAL.deleteEvent(projectId, toDelete.id);

    const backup = await buildBackup(projectId);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.app.schema_migration).toMatch(/^\d+$/);

    // project row never leaks its own id or the client's id (D-45).
    expect(backup.project.id).toBeUndefined();
    expect(backup.project.client_id).toBeUndefined();
    expect(backup.project.name).toBe('Acme EU');

    // Client is reference-only, the four documented fields.
    expect(backup.client).toEqual({ key: 'acme', name: 'Acme', bloomreach_account_id: 'acc-1', notes: 'ref only' });

    // Every table array present with counts matching the live DAL/DB state.
    const db = getDb();
    const countOf = (sql: string): number => (db.prepare(sql).get(projectId) as { n: number }).n;
    expect(backup.events.length).toBe(countOf('SELECT COUNT(*) as n FROM events WHERE project_id = ?'));
    expect(backup.properties.length).toBe(countOf('SELECT COUNT(*) as n FROM properties WHERE project_id = ?'));
    expect(backup.variants.length).toBe(countOf('SELECT COUNT(*) as n FROM variants WHERE project_id = ?'));
    expect(backup.use_cases.length).toBe(countOf('SELECT COUNT(*) as n FROM use_cases WHERE project_id = ?'));
    expect(backup.qa_runs.length).toBe(countOf('SELECT COUNT(*) as n FROM qa_runs WHERE project_id = ?'));
    expect(backup.observations.length).toBe(countOf('SELECT COUNT(*) as n FROM observations WHERE project_id = ?'));
    expect(backup.findings.length).toBe(countOf('SELECT COUNT(*) as n FROM findings WHERE project_id = ?'));

    // Soft-deleted event included, with deleted_at set (a backup is a faithful snapshot).
    const softDeletedRow = backup.events.find((e) => e.name === 'backup_soft_delete_event');
    expect(softDeletedRow).toBeTruthy();
    expect(softDeletedRow!.deleted_at).toBeTruthy();

    // change_log has rows (T-3-01 wires event/property/variant mutations already).
    expect(backup.change_log.length).toBeGreaterThan(0);

    // comments table does not exist yet (T-4-02): always [].
    expect(backup.comments).toEqual([]);

    // Referenced use_case_templates included in full.
    expect(backup.use_case_templates.some((t) => t.code === 'UC-BACKUP-01')).toBe(true);
    const templateRow = backup.use_case_templates.find((t) => t.code === 'UC-BACKUP-01');
    expect(templateRow!.name).toBe('Backup test use case');

    // The uploaded file decodes back to the exact bytes; no missing-file warning for it.
    const fileEntry = backup.files.find((f) => f.path === stored.path);
    expect(fileEntry).toBeTruthy();
    expect(Buffer.from(fileEntry!.base64, 'base64').equals(imageBytes)).toBe(true);
    expect(backup.files_missing).not.toContain(stored.path);

    // eslint-disable-next-line no-console
    console.log(`T-3-04 fixture backup.json size: ${JSON.stringify(backup).length} bytes`);
  });

  it('a referenced file missing on disk becomes a files_missing warning, not a thrown error', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'missing_file_event', class: 'custom' });
    EventDAL.updateEvent(projectId, event.id, {
      triggers_json: [{ title: 't', description: 'd', image_path: 'nowhere/does-not-exist.png', order: 0 }],
    });

    const backup = await buildBackup(projectId);
    expect(backup.files_missing).toContain('nowhere/does-not-exist.png');
    expect(backup.files.some((f) => f.path === 'nowhere/does-not-exist.png')).toBe(false);
  });
});
