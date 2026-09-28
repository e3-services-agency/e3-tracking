/**
 * `previewRestore`/`applyRestore` (T-3-05, D-45): fixture project (data-mapping + expiration +
 * Data Manager + customer events, retyped for the phase 1 type mismatches, one trigger screenshot,
 * one acknowledged finding) -> backup -> restore into a new project. Per-table counts equal, no old
 * id string survives anywhere in the restored rows, the tracking document matches after masking
 * ids/timestamps, a variant condition still resolves against the restored observations, the
 * acknowledged finding stays acknowledged after the post-restore recompute, restoring twice works,
 * an unknown column warns, and a wrong format/version is a 400.
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
import * as VariantDAL from '../dal/variant.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { setFindingStatus, listFindings } from '../dal/finding.dal';
import { getFileStore } from '../files/FileStore';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { previewExpirationSettings, applyExpirationSettings } from './expirationSettingsImport.service';
import { previewDataManagerCustomers, applyDataManagerCustomers } from './dataManagerCustomersImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { previewCustomerEventsExport, applyCustomerEventsExport } from './customerEventsExportImport.service';
import { runComparison } from './comparison.service';
import { buildBackup } from './backup.service';
import { buildTrackingDocument } from './document.service';
import { previewRestore, applyRestore } from './backupRestore.service';
import { BadRequestError, PayloadChangedError, ProjectKeyTakenError } from '../errors';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../../domain/enums';
import { payloadHash } from '../../domain/diff/hash';

const samplesDir = path.resolve(__dirname, '../../../.claude/team/samples');
const dataMappingFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-mapping.json'), 'utf-8'));
const expirationFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'expiration-settings.json'), 'utf-8'));
const dataManagerCustomersFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-customers.json'), 'utf-8'));
const dataManagerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-events.json'), 'utf-8'));
const customerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'customer-events-export.json'), 'utf-8'));

let clientId: string;
let projectId: string;
let filesDir: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-restore-test-'));
  process.env.E3_FILES_PATH = filesDir;
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  clientId = client.id;
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
  delete process.env.E3_FILES_PATH;
  fs.rmSync(filesDir, { recursive: true, force: true });
});

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

async function applyAllFixtures(): Promise<void> {
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

  const cartUpdate = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update');
  expect(cartUpdate).toBeTruthy();
  const screenshot = Buffer.from('fake-png-bytes');
  const stored = await getFileStore().put(projectId, 'triggers', 'cart-screenshot.png', screenshot, 'image/png');
  EventDAL.updateEvent(projectId, cartUpdate!.id, {
    triggers_json: [{ title: 'Cart screenshot', description: 'add to cart', image_path: stored.path, order: 0 }],
  });

  runComparison(projectId);
}

function collectAllIdStrings(row: unknown, ids: Set<string>): void {
  if (typeof row === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row)) {
    ids.add(row);
  } else if (Array.isArray(row)) {
    row.forEach((v) => collectAllIdStrings(v, ids));
  } else if (row && typeof row === 'object') {
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      collectAllIdStrings(k, ids);
      collectAllIdStrings(v, ids);
    }
  }
}

/** Walks every value (including inside JSON strings) of every row of every table array in `backup`. */
function walkEveryString(backup: Record<string, unknown>, visit: (s: string) => void): void {
  const visitValue = (v: unknown): void => {
    if (typeof v === 'string') visit(v);
    else if (Array.isArray(v)) v.forEach(visitValue);
    else if (v && typeof v === 'object') {
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
        visit(k);
        visitValue(vv);
      }
    }
  };
  visitValue(backup);
}

function maskIdsAndTimestamps(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return '<id>';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return '<ts>';
    return value;
  }
  if (Array.isArray(value)) return value.map(maskIdsAndTimestamps);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'generated_at') {
        out[k] = '<generated_at>';
      } else if (k === 'project') {
        // The restored project deliberately gets a new name/key/client (T-3-05 always creates a
        // brand-new project); only the identity block is masked here, everything else (events,
        // properties, findings, ...) must still match verbatim.
        out[k] = '<project>';
      } else {
        out[k] = maskIdsAndTimestamps(v);
      }
    }
    return out;
  }
  return value;
}

describe('previewRestore', () => {
  it('rejects an unknown format/version with a 400', () => {
    expect(() => previewRestore({ format: 'something-else', version: 1 })).toThrow(BadRequestError);
    expect(() => previewRestore({ format: BACKUP_FORMAT, version: 99 })).toThrow(BadRequestError);
  });

  it('returns counts, project name/key and a payload_hash without writing anything', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    expect(preview.project).toEqual({ name: 'Acme EU', key: 'acme-eu' });
    expect(preview.counts.events).toBe(backup.events.length);
    expect(preview.counts.properties).toBe(backup.properties.length);
    expect(preview.counts.files).toBe(backup.files.length);
    expect(preview.payload_hash).toBeTruthy();
    // read-only: no new project was created.
    expect(ProjectDAL.listProjects().length).toBe(1);
  });

  it('warns (does not throw) on an unknown column, and drops it on restore', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    (backup.events[0] as Record<string, unknown>).made_up_future_column = 'x';
    const preview = previewRestore(backup);
    expect(preview.warnings.some((w) => w.includes('events') && w.includes('made_up_future_column'))).toBe(true);
  });
});

describe('applyRestore', () => {
  it('per-table counts equal, no old id survives, tracking documents match, variant/finding evidence survives', async () => {
    await applyAllFixtures();

    // Acknowledge one open error finding by hand (D-42) before the doc/backup are captured, so its
    // resolved_by='user' survives restore + the post-restore recompute, and the source/restored
    // tracking documents are compared from the same acknowledged state.
    const openError = listFindings(projectId, {}).find((f) => f.status === 'open' && f.severity === 'error');
    expect(openError).toBeTruthy();
    setFindingStatus(projectId, openError!.id, 'resolved');

    const sourceDoc = buildTrackingDocument(projectId);
    const backupWithAck = await buildBackup(projectId);

    const preview = previewRestore(backupWithAck);
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other Co' });
    const { project: restoredProject, counts } = await applyRestore(backupWithAck, preview.payload_hash, {
      name: 'Acme EU restored',
      key: 'acme-eu-restored',
      client_id: otherClient.id,
    });

    expect(restoredProject.id).not.toBe(projectId);
    expect(restoredProject.client_id).toBe(otherClient.id);
    expect(restoredProject.key).toBe('acme-eu-restored');
    expect(restoredProject.share_token).toBeNull();
    expect(restoredProject.share_access).toBeNull();

    // Per-table counts equal the backup's own array lengths.
    expect(counts.events).toBe(backupWithAck.events.length);
    expect(counts.properties).toBe(backupWithAck.properties.length);
    expect(counts.variants).toBe(backupWithAck.variants.length);
    expect(counts.use_cases).toBe(backupWithAck.use_cases.length);
    expect(counts.qa_runs).toBe(backupWithAck.qa_runs.length);
    expect(counts.observations).toBe(backupWithAck.observations.length);
    expect(counts.findings).toBe(backupWithAck.findings.length);

    const db = getDb();
    const countOf = (table: string): number =>
      (db.prepare(`SELECT COUNT(*) as n FROM ${table} WHERE project_id = ?`).get(restoredProject.id) as { n: number }).n;
    expect(countOf('events')).toBe(backupWithAck.events.length);
    expect(countOf('properties')).toBe(backupWithAck.properties.length);
    expect(countOf('variants')).toBe(backupWithAck.variants.length);
    expect(countOf('qa_runs')).toBe(backupWithAck.qa_runs.length);
    expect(countOf('observations')).toBe(backupWithAck.observations.length);

    // No string equal to any old id anywhere in the restored tables (walk id, project_id, and
    // every JSON column of every restored row).
    const oldIds = new Set<string>();
    collectAllIdStrings(backupWithAck, oldIds);
    oldIds.delete(otherClient.id); // not an "old" id: the target client, never part of the source project

    const restoredTables = ['events', 'properties', 'variants', 'standard_event_mappings', 'identity_rules', 'catalogs', 'consent_categories', 'use_cases', 'rules', 'qa_runs', 'observations', 'findings', 'change_log'];
    for (const table of restoredTables) {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE project_id = ?`).all(restoredProject.id) as Record<string, unknown>[];
      for (const row of rows) {
        walkEveryString(row, (s) => {
          expect(oldIds.has(s)).toBe(false);
        });
      }
    }
    // Tables scoped through a parent, not their own `project_id` column.
    const catalogFieldRows = db
      .prepare(
        'SELECT cf.* FROM catalog_fields cf JOIN catalogs c ON c.id = cf.catalog_id WHERE c.project_id = ?'
      )
      .all(restoredProject.id) as Record<string, unknown>[];
    const requirementRows = db
      .prepare(
        'SELECT r.* FROM requirements r JOIN use_cases uc ON uc.id = r.use_case_id WHERE uc.project_id = ?'
      )
      .all(restoredProject.id) as Record<string, unknown>[];
    for (const row of [...catalogFieldRows, ...requirementRows]) {
      walkEveryString(row, (s) => {
        expect(oldIds.has(s)).toBe(false);
      });
    }
    // The restored project row itself never carries the old project id or the old client id.
    const restoredProjectRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(restoredProject.id) as Record<string, unknown>;
    walkEveryString(restoredProjectRow, (s) => {
      expect(oldIds.has(s)).toBe(false);
    });

    // The tracking document matches after masking ids/timestamps/generated_at.
    const restoredDoc = buildTrackingDocument(restoredProject.id);
    expect(maskIdsAndTimestamps(restoredDoc)).toEqual(maskIdsAndTimestamps(sourceDoc));

    // The restored variant still resolves (cart_update[action=add]) -- comparison re-ran and did
    // not blow up producing findings for every event.
    const cartUpdate = EventDAL.listEvents(restoredProject.id).find((e) => e.name === 'cart_update');
    expect(cartUpdate).toBeTruthy();
    const variants = VariantDAL.listVariants(restoredProject.id, cartUpdate!.id);
    expect(variants.some((v) => v.name.toLowerCase().includes('add'))).toBe(true);

    // The trigger screenshot is served from the new project's own path.
    const restoredCartUpdate = EventDAL.getEventById(restoredProject.id, cartUpdate!.id);
    const triggers = restoredCartUpdate!.triggers_json as { image_path: string }[];
    expect(triggers[0].image_path).not.toBe((backupWithAck.events.find((e) => e.name === 'cart_update')!.triggers_json as any)[0].image_path);
    const opened = await getFileStore().openForProject(restoredProject.id, triggers[0].image_path);
    expect(opened.buffer.toString()).toBe('fake-png-bytes');

    // The acknowledged finding stays acknowledged after restore + the post-restore recompute.
    const restoredFindings = listFindings(restoredProject.id, {});
    const restoredAck = restoredFindings.find((f) => f.status === 'resolved' && (f as any).resolved_by === 'user');
    expect(restoredAck).toBeTruthy();

    // One `restore` change_log row was appended.
    const restoreRow = db
      .prepare("SELECT * FROM change_log WHERE project_id = ? AND action = 'restore'")
      .get(restoredProject.id) as Record<string, unknown> | undefined;
    expect(restoreRow).toBeTruthy();
  }, 60000);

  it('remaps change_log.batch_id: rows of one old import batch keep sharing one batch_id, but a fresh one (T-3-05b)', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'batchremap', name: 'Batch Remap Co' });
    const { project: restored } = await applyRestore(backup, preview.payload_hash, {
      name: 'Batch remap test',
      key: 'batch-remap-test',
      client_id: client.id,
    });

    const oldBatchRows = (backup.change_log as Record<string, unknown>[]).filter(
      (r) => typeof r.batch_id === 'string' && r.batch_id
    );
    const oldBatchGroups = new Map<string, number>();
    for (const row of oldBatchRows) {
      const batchId = row.batch_id as string;
      oldBatchGroups.set(batchId, (oldBatchGroups.get(batchId) ?? 0) + 1);
    }
    // The fixture applies several imports (data mapping, expiration, Data Manager x2, customer
    // events), each its own batch, so there is more than one group to tell apart.
    expect(oldBatchGroups.size).toBeGreaterThan(1);

    const db = getDb();
    // Exclude the restore's own `action = 'restore'` change_log row: it is a brand-new row applyRestore
    // itself appends (not one of the backup's own rows) and carries the whole-restore batch id, not
    // one of the backup's import batch ids.
    const restoredRows = db
      .prepare("SELECT batch_id FROM change_log WHERE project_id = ? AND batch_id IS NOT NULL AND action != 'restore'")
      .all(restored.id) as { batch_id: string }[];
    expect(restoredRows.length).toBe(oldBatchRows.length);

    const restoredGroups = new Map<string, number>();
    for (const row of restoredRows) {
      restoredGroups.set(row.batch_id, (restoredGroups.get(row.batch_id) ?? 0) + 1);
    }

    // Same grouping (a multiset of batch sizes) survives restore -- rows of one old batch still
    // share one id -- but every restored batch_id is a fresh one, never one of the old ones.
    expect(Array.from(restoredGroups.values()).sort()).toEqual(Array.from(oldBatchGroups.values()).sort());
    expect(restoredGroups.size).toBe(oldBatchGroups.size);
    for (const oldBatchId of oldBatchGroups.keys()) {
      expect(restoredGroups.has(oldBatchId)).toBe(false);
    }
  });

  it('rejects a stale payload_hash with 409 PAYLOAD_CHANGED', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    const client = ClientDAL.createClient({ key: 'stale', name: 'Stale Co' });
    await expect(
      applyRestore(backup, 'not-the-real-hash', { name: 'X', key: 'x-project', client_id: client.id })
    ).rejects.toThrow(PayloadChangedError);
  });

  it('rejects a key already taken by another project with 409 PROJECT_KEY_TAKEN', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'taken', name: 'Taken Co' });
    await expect(
      applyRestore(backup, preview.payload_hash, { name: 'Dup', key: 'acme-eu', client_id: client.id })
    ).rejects.toThrow(ProjectKeyTakenError);
  });

  it('rejects an unknown format with 400', async () => {
    const client = ClientDAL.createClient({ key: 'wrongfmt', name: 'Wrong Format Co' });
    const badBackup = { format: 'nope', version: 1 };
    await expect(
      applyRestore(badBackup, payloadHash(badBackup), { name: 'X', key: 'x-2', client_id: client.id })
    ).rejects.toThrow(BadRequestError);
  });

  it('restoring the same backup twice into two different keys both succeed', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'twice', name: 'Twice Co' });

    const first = await applyRestore(backup, preview.payload_hash, { name: 'First', key: 'first-key', client_id: client.id });
    const second = await applyRestore(backup, preview.payload_hash, { name: 'Second', key: 'second-key', client_id: client.id });

    expect(first.project.id).not.toBe(second.project.id);
    expect(first.project.key).toBe('first-key');
    expect(second.project.key).toBe('second-key');
    expect(EventDAL.listEvents(first.project.id).length).toBe(EventDAL.listEvents(second.project.id).length);
  });

  it('a backup with an unknown column restores with a warning', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    (backup.properties[0] as Record<string, unknown>).made_up_future_column = 'x';
    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'unkcol', name: 'Unknown Column Co' });
    const { project: restored } = await applyRestore(backup, preview.payload_hash, {
      name: 'Unknown col test',
      key: 'unknown-col-test',
      client_id: client.id,
    });
    expect(EventDAL.listEvents(restored.id).length).toBeGreaterThan(0);
    expect(preview.warnings.some((w) => w.includes('properties') && w.includes('made_up_future_column'))).toBe(true);
  });

  it('a failed apply removes every file it already wrote, leaving no orphan directory (fix round WARNING 1)', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    expect(backup.files.length).toBeGreaterThan(0); // the cart_update trigger screenshot

    // Corrupt one finding's property_id to a uuid that will never exist in the restored project:
    // insertGenericRow (inside the transaction, after the files are already written) then hits a
    // real FOREIGN KEY violation, the same shape of failure the reviewer probed with a bad
    // `severity` value -- any mid-transaction throw after the file write must be handled alike.
    expect(backup.findings.length).toBeGreaterThan(0);
    (backup.findings[0] as Record<string, unknown>).property_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'cleanup', name: 'Cleanup Co' });

    const beforeDirs = fs.readdirSync(filesDir).sort();
    await expect(
      applyRestore(backup, preview.payload_hash, { name: 'Cleanup test', key: 'cleanup-test', client_id: client.id })
    ).rejects.toThrow();
    const afterDirs = fs.readdirSync(filesDir).sort();

    expect(afterDirs).toEqual(beforeDirs); // no new (orphaned) project directory was left behind
    expect(ProjectDAL.listProjects().some((p) => p.key === 'cleanup-test')).toBe(false);
  });

  it('rewrites a compound object key that embeds an id, not just its value (fix round WARNING 3)', async () => {
    await applyAllFixtures();
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'total_price');
    expect(prop).toBeTruthy();
    const backup = await buildBackup(projectId);
    const cartUpdateRow = backup.events.find((e) => e.name === 'cart_update') as Record<string, unknown>;
    cartUpdateRow.bloomreach_meta_json = { [`${prop!.id}:extra`]: prop!.id };

    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'compoundkey', name: 'Compound Key Co' });
    const { project: restored } = await applyRestore(backup, preview.payload_hash, {
      name: 'Compound key test',
      key: 'compound-key-test',
      client_id: client.id,
    });

    const restoredCartUpdate = EventDAL.listEvents(restored.id).find((e) => e.name === 'cart_update');
    const restoredProp = PropertyDAL.listProperties(restored.id, { scope: 'event' }).find((p) => p.name === 'total_price');
    expect(restoredProp).toBeTruthy();
    const restoredEventRow = EventDAL.getEventById(restored.id, restoredCartUpdate!.id);
    const meta = restoredEventRow!.bloomreach_meta_json as Record<string, unknown>;
    expect(Object.keys(meta)).toEqual([`${restoredProp!.id}:extra`]);
    expect(meta[`${restoredProp!.id}:extra`]).toBe(restoredProp!.id);
    // The old id survives nowhere in the restored key or value.
    expect(Object.keys(meta).some((k) => k.includes(prop!.id))).toBe(false);
  });

  it('returns warnings on apply, and a comments row restores with a warning instead of crashing when the table does not exist yet', async () => {
    await applyAllFixtures();
    const backup = await buildBackup(projectId);
    // `comments` (T-4-02) does not exist on this schema; a hand-crafted backup carrying rows for
    // it anyway must warn and skip them, not throw `INSERT INTO comments () VALUES ()`.
    (backup as unknown as Record<string, unknown>).comments = [
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', entity_type: 'event', entity_id: 'x', body: 'hello' },
    ];

    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'commentsguard', name: 'Comments Guard Co' });
    const result = await applyRestore(backup, preview.payload_hash, {
      name: 'Comments guard test',
      key: 'comments-guard-test',
      client_id: client.id,
    });

    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.some((w) => w.includes('comments') && w.includes('does not exist'))).toBe(true);
    expect(result.counts.comments).toBe(0);
    // Everything else still restored normally.
    expect(EventDAL.listEvents(result.project.id).length).toBeGreaterThan(0);
  });

  // Fix round (qa-tester FAIL 2026-09-28 17:03): before 0021 was fixed to generate dashed UUIDs,
  // its backfilled property_definitions ids were dashless 32-hex strings that the id-remap regex
  // never matched, so restoring a backup carrying one left it unrewritten and colliding with the
  // still-live source row's own primary key (UNIQUE constraint failed, 500). Reproduced directly
  // against the DB (bypassing the DAL, which only ever generates dashed ids) so this test still
  // catches a regression in the widened regex even after every current code path only produces
  // dashed ids.
  it('restores a backup carrying a dashless (32-hex, no dashes) property_definitions id into a new project with a fresh id and no collision', async () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });
    const db = getDb();
    const generalRow = db
      .prepare('SELECT id FROM property_definitions WHERE project_id = ? AND property_id = ?')
      .get(projectId, property.id) as { id: string };
    const dashlessId = generalRow.id.replace(/-/g, '');
    expect(dashlessId).toMatch(/^[0-9a-f]{32}$/);

    // Simulate a project that went through the pre-fix 0021 backfill: the live row's own id is
    // dashless (not just the backup's copy of it), so a failed remap during restore would collide
    // with this exact still-live primary key, reproducing the qa-tester's 500 precisely.
    db.prepare('UPDATE property_definitions SET id = ? WHERE id = ?').run(dashlessId, generalRow.id);

    const backup = await buildBackup(projectId);
    expect(
      (backup.property_definitions as Record<string, unknown>[]).some((d) => d.id === dashlessId)
    ).toBe(true);

    const preview = previewRestore(backup);
    const client = ClientDAL.createClient({ key: 'dashlessid', name: 'Dashless Id Co' });
    const { project: restored } = await applyRestore(backup, preview.payload_hash, {
      name: 'Dashless id test',
      key: 'dashless-id-test',
      client_id: client.id,
    });

    const restoredDefs = db
      .prepare('SELECT id, property_id FROM property_definitions WHERE project_id = ?')
      .all(restored.id) as { id: string; property_id: string }[];
    expect(restoredDefs).toHaveLength(1);
    // A genuinely fresh (dashed) id, distinct from the dashless one the backup carried.
    expect(restoredDefs[0].id).not.toBe(dashlessId);
    expect(restoredDefs[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // The restored property's own id was remapped too, and the restored definition points at the
    // restored property (both new ids, no old dashless or dashed id crossing over).
    const restoredProperty = PropertyDAL.listProperties(restored.id, { scope: 'event' }).find(
      (p) => p.name === 'action'
    );
    expect(restoredProperty).toBeTruthy();
    expect(restoredDefs[0].property_id).toBe(restoredProperty!.id);

    // The source project's own row is untouched -- still live, still dashless, still there (proof
    // there was no collision: two rows with related-but-distinct ids in two different projects).
    const sourceRowStillThere = db.prepare('SELECT id FROM property_definitions WHERE id = ?').get(dashlessId) as
      | { id: string }
      | undefined;
    expect(sourceRowStillThere?.id).toBe(dashlessId);
  });
});
