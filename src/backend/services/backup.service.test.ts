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
import * as CommentDAL from '../dal/comment.dal';
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

const EXPECTED_KEYS = [
  'format',
  'version',
  'exported_at',
  'app',
  'client',
  'project',
  'use_case_templates',
  'sources',
  'properties',
  'property_definitions',
  'events',
  'event_sources',
  'event_properties',
  'variants',
  'standard_event_mappings',
  'identity_rules',
  'catalogs',
  'catalog_fields',
  'consent_categories',
  'use_cases',
  'requirements',
  'rules',
  'property_bundles',
  'property_bundle_items',
  'qa_runs',
  'observations',
  'findings',
  'change_log',
  'comments',
  'files',
  'files_missing',
  'warnings',
].sort();

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

    // An unreferenced template: not instantiated in this project, must not be embedded (reviewer
    // probe / pre-QA fix INFO 4).
    const unreferencedTemplate = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-BACKUP-UNREF',
      name: 'Never instantiated',
      type: 'marketing',
      default_requirements_json: [],
    });

    // A QA run + observation + (via runComparison) findings, exercised again after the use case.
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'manual',
      event_type: 'purchase',
      timestamp: 1700000000,
      properties: {},
    });
    runComparison(projectId);

    // A soft-deleted event with a linked property: the event_properties child row survives the
    // soft delete (deleteEvent only sets events.deleted_at; it never touches event_properties),
    // so the backup's event_properties array must still carry it (reviewer probe / pre-QA fix
    // INFO 4 "child rows of a soft-deleted parent").
    const toDelete = EventDAL.createEvent(projectId, { name: 'backup_soft_delete_event', class: 'custom' });
    const linkedProperty = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'backup_soft_delete_prop',
      data_type: 'string',
    });
    EventDAL.attachPropertyToEvent(projectId, toDelete.id, { property_id: linkedProperty.id });
    EventDAL.deleteEvent(projectId, toDelete.id);

    // A live share token/access: must never appear in the backup (pre-QA fix WARNING 1).
    getDb()
      .prepare('UPDATE projects SET share_token = ?, share_access = ? WHERE id = ?')
      .run('SHARE-TOKEN-SECRET', 'read', projectId);

    // T-4-02 (D-49): a comment on a live event must round-trip through the backup too.
    const purchaseEvent = EventDAL.listEvents(projectId).find((e) => e.name === 'purchase')!;
    CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: purchaseEvent.id,
      author_name: 'Jan',
      body: 'Confirm this before go-live.',
    });

    const backup = await buildBackup(projectId);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.app.schema_migration).toMatch(/^\d+$/);

    // The exact key set (pre-QA fix INFO 4): no extra, no missing.
    expect(Object.keys(backup).sort()).toEqual(EXPECTED_KEYS);

    // project row never leaks its own id or the client's id (D-45).
    expect(backup.project.id).toBeUndefined();
    expect(backup.project.client_id).toBeUndefined();
    expect(backup.project.name).toBe('Acme EU');

    // A live share token/access is exported as null, keys present, never the secret value
    // (pre-QA fix WARNING 1). Assert against the raw serialized JSON too so no other code path
    // (e.g. a nested JSON column) could reintroduce the secret string.
    expect('share_token' in backup.project).toBe(true);
    expect('share_access' in backup.project).toBe(true);
    expect(backup.project.share_token).toBeNull();
    expect(backup.project.share_access).toBeNull();
    expect(JSON.stringify(backup)).not.toContain('SHARE-TOKEN-SECRET');

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

    // Its event_properties link survives too (child row of a soft-deleted parent).
    const survivingLink = backup.event_properties.find(
      (ep) => ep.event_id === toDelete.id && ep.property_id === linkedProperty.id
    );
    expect(survivingLink).toBeTruthy();

    // change_log has rows (T-3-01 wires event/property/variant mutations already).
    expect(backup.change_log.length).toBeGreaterThan(0);

    // T-4-02 (D-49): the comment planted above round-trips into the backup.
    expect(backup.comments.length).toBe(1);
    expect(backup.comments[0].entity_type).toBe('event');
    expect(backup.comments[0].entity_id).toBe(purchaseEvent.id);
    expect(backup.comments[0].body).toBe('Confirm this before go-live.');

    // Referenced use_case_templates included in full; an unreferenced template is excluded.
    expect(backup.use_case_templates.some((t) => t.code === 'UC-BACKUP-01')).toBe(true);
    const templateRow = backup.use_case_templates.find((t) => t.code === 'UC-BACKUP-01');
    expect(templateRow!.name).toBe('Backup test use case');
    expect(backup.use_case_templates.some((t) => t.code === unreferencedTemplate.code)).toBe(false);

    // The uploaded file decodes back to the exact bytes; no missing-file warning for it.
    const fileEntry = backup.files.find((f) => f.path === stored.path);
    expect(fileEntry).toBeTruthy();
    expect(Buffer.from(fileEntry!.base64, 'base64').equals(imageBytes)).toBe(true);
    expect(backup.files_missing).not.toContain(stored.path);

    // No malformed JSON in this fixture: warnings stays empty.
    expect(backup.warnings).toEqual([]);

    // eslint-disable-next-line no-console
    console.log(`T-3-04 fixture backup.json size: ${JSON.stringify(backup).length} bytes`);
  });

  it('observations are ordered by timestamp, id', async () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: 'evt_b', timestamp: 200, properties: {} });
    ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: 'evt_a', timestamp: 100, properties: {} });
    ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: 'evt_c', timestamp: 300, properties: {} });

    const backup = await buildBackup(projectId);
    const timestamps = backup.observations.map((o) => o.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => (a as number) - (b as number)));
    expect(timestamps).toEqual([100, 200, 300]);
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

  it('a malformed *_json cell is kept as its raw string and reported in warnings[], not silently nulled', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'malformed_json_event', class: 'custom' });
    // Bypass the DAL (which always writes through toJsonColumn) to simulate a row that somehow
    // ended up with non-JSON text in a `*_json` column.
    getDb().prepare('UPDATE events SET tags_json = ? WHERE id = ?').run('{not valid json', event.id);

    const backup = await buildBackup(projectId);
    const row = backup.events.find((e) => e.id === event.id);
    expect(row).toBeTruthy();
    expect(row!.tags_json).toBe('{not valid json');
    expect(backup.warnings.some((w) => w.includes('events.tags_json') && w.includes(event.id))).toBe(true);
  });
});
