import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import { createClient } from '../dal/client.dal';
import { createProject } from '../dal/project.dal';
import { createEvent, attachPropertyToEvent } from '../dal/event.dal';
import { createProperty } from '../dal/property.dal';
import { createDefinition } from '../dal/property-definition.dal';
import { runWithActor } from '../context/actor';
import { uploadHistoricalSource, previewHistoricalValidation, applyHistoricalValidation, getHistoricalValidation } from './historicalValidation.service';
import { buildBackup } from './backup.service';
import { previewRestore, applyRestore } from './backupRestore.service';
import { publicReport, publicReportList } from './qaReports.service';
import { isCommentTargetVisible, visibleCommentTargetKeys } from '../dal/comment.dal';
import { captureQaReport } from '../dal/qa-report.dal';
import type { HistoricalManifest } from '../../domain/historicalFiles';
let project: string, foreign: string, event: string, property: string, definition: string, directory: string;
beforeEach(() => {
  vi.stubEnv('E3_DB_PATH', ':memory:'); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-historical-test-')); vi.stubEnv('E3_FILES_PATH', directory); closeDb();
  const client = createClient({ key: 'history', name: 'History' }); project = createProject({ client_id: client.id, key: 'history', name: 'History' }).id;
  foreign = createProject({ client_id: client.id, key: 'foreign', name: 'Foreign' }).id;
  event = createEvent(project, { name: 'purchase', status: 'planned' }).id;
  property = createProperty(project, { name: 'payment_status', scope: 'event', data_type: 'string' }).id;
  definition = createDefinition(project, property, { name: 'historical', allowed_values_json: [{ value: 'processing', description: 'Draft expectation' }] }).id;
  attachPropertyToEvent(project, event, { property_id: property, definition_id: definition });
});
afterEach(() => { closeDb(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });
async function fixture() {
  const source = await runWithActor({ actor: 'verified@example.com', source: 'test' }, () => uploadHistoricalSource(project, Buffer.from('payment_status,unmapped\nprocessing,private@example.com\nunknown,private@example.com\n'), 'purchases.csv', { source_ref: 'https://drive.google.com/file/d/reviewed-file/view' }));
  const manifest: HistoricalManifest = { version: 1, parse_policy: 'csv-lexical-v1', files: [{ source_id: source.id, event_id: event, mappings: [{ column: 'payment_status', property_id: property, definition_id: definition }], source_only_columns: ['unmapped'], trailing_empty_columns: [] }], joins: [] };
  return { source, manifest };
}
it('creates one immutable numbered report, respects native enum .value and leaves runtime authority untouched', async () => {
  const { manifest } = await fixture(), before = getDb().prepare('SELECT COUNT(*) n FROM findings').get();
  const preview = await previewHistoricalValidation(project, manifest);
  expect(getDb().prepare('SELECT COUNT(*) n FROM qa_reports').get()).toEqual({ n: 0 });
  const report = await runWithActor({ actor: 'verified@example.com', source: 'mcp' }, () => applyHistoricalValidation(project, manifest, preview.payload_hash));
  expect(report.report_url).toBe('/api/projects/' + project + '/historical-files/reports/' + report.report_id + '/view'); expect(report.detail_url).toBe(report.report_url); expect(report.tracking_url).toBe('/tracking-plan/p/history/findings#qa-report-' + report.report_id);
  expect(report.actor).toBe('verified@example.com'); expect(report.report_sequence).toBe(1); expect(report.totals.failed).toBe(1);
  expect((await applyHistoricalValidation(project, manifest, preview.payload_hash)).report_id).toBe(report.report_id);
  expect(getDb().prepare('SELECT COUNT(*) n FROM qa_reports').get()).toEqual({ n: 1 });
  expect(getDb().prepare('SELECT COUNT(*) n FROM observations').get()).toEqual({ n: 0 });
  expect(getDb().prepare('SELECT COUNT(*) n FROM findings').get()).toEqual(before);
  expect(getDb().prepare('SELECT status FROM events WHERE id=?').get(event)).toEqual({ status: 'planned' });
  expect(JSON.stringify(report)).not.toContain('private@example.com'); expect(report.original_event_time).toBeNull();
  expect(() => getDb().prepare('UPDATE historical_validation_reports SET actor=?').run('forged')).toThrow('immutable');
  expect(() => getDb().prepare('UPDATE historical_file_sources SET filename=?').run('other.csv')).toThrow('immutable');
  expect(publicReportList(project)).toHaveLength(0); expect(() => publicReport(project, report.report_id)).toThrow();
  expect(isCommentTargetVisible(project, 'qa_report', report.report_id)).toBe(false); expect(visibleCommentTargetKeys(project).has('qa_report:' + report.report_id)).toBe(false);
});
it('rejects changed revisions, manifests, foreign sources/links and stale raw bytes', async () => {
  const { source, manifest } = await fixture(), preview = await previewHistoricalValidation(project, manifest);
  await expect(applyHistoricalValidation(project, { ...manifest, joins: [{ kind: 'one_to_many', left_source_id: source.id, right_source_id: source.id, left_column: 'unmapped', right_column: 'unmapped' }] }, preview.payload_hash)).rejects.toThrow();
  await expect(previewHistoricalValidation(foreign, manifest)).rejects.toThrow();
  const foreignEvent = createEvent(foreign, { name: 'purchase' });
  await expect(previewHistoricalValidation(project, { ...manifest, files: [{ ...manifest.files[0], event_id: foreignEvent.id }] })).rejects.toThrow();
  getDb().prepare('UPDATE property_definitions SET updated_at=? WHERE id=?').run('changed-revision', definition);
  await expect(applyHistoricalValidation(project, manifest, preview.payload_hash)).rejects.toThrow('changed');
  const sourcePath = getDb().prepare('SELECT file_path FROM historical_file_sources WHERE id=?').get(source.id) as { file_path: string };
  fs.appendFileSync(path.join(directory, sourcePath.file_path), 'tampered');
  await expect(previewHistoricalValidation(project, manifest)).rejects.toThrow('changed');
});
it('rejects invalid UTF8 and all URL credentials, queries and fragments without fetching', async () => {
  await expect(uploadHistoricalSource(project, Buffer.from([0xff]), 'a.csv', { source_ref: 'file-id' })).rejects.toThrow('UTF-8');
  for (const ref of ['https://example.com/file?sig=token', 'https://example.com/file#token', 'https://user:pass@example.com/file', 'http://example.com/file']) await expect(uploadHistoricalSource(project, Buffer.from('a\n1'), 'a.csv', { source_ref: ref })).rejects.toThrow();
});
it('preserves immutable JSON/hashes and actual source bytes through native backup/restore', async () => {
  const { manifest } = await fixture(), preview = await previewHistoricalValidation(project, manifest), report = await applyHistoricalValidation(project, manifest, preview.payload_hash);
  const original = getDb().prepare('SELECT * FROM historical_validation_reports WHERE report_id=?').get(report.report_id) as Record<string, string>;
  const backup = await buildBackup(project); expect(backup.historical_file_sources).toHaveLength(1); expect(backup.historical_validation_reports).toHaveLength(1);
  const p = previewRestore(backup), restored = await applyRestore(backup, p.payload_hash, { client_id: createClient({ key: 'copy', name: 'Copy' }).id, key: 'copy', name: 'Copy' });
  expect(restored.warnings).toEqual([]);
  const copy = getDb().prepare('SELECT * FROM historical_validation_reports WHERE project_id=?').get(restored.project.id) as Record<string, string>;
  for (const field of ['manifest_json', 'snapshot_json', 'result_json', 'identity_hash', 'definition_hash', 'engine_hash']) expect(copy[field]).toBe(original[field]);
  expect(copy.report_id).not.toBe(original.report_id); expect(copy.restored_from_id).toBe(original.id);
  const read = await getHistoricalValidation(restored.project.id, copy.report_id); expect(read.source_availability.every(s => s.available)).toBe(true); expect(read.sources).toEqual(report.sources);
  expect(read.source_availability[0].source_id).toBe(report.sources[0].id); expect(read.source_availability[0].current_source_id).not.toBe(report.sources[0].id);
  expect(read.files[0].event_id).toBeUndefined(); expect(read.files[0].original_event_id).toBe(event);
  const stored = getDb().prepare('SELECT file_path FROM historical_file_sources WHERE project_id=?').get(restored.project.id) as { file_path: string };
  fs.unlinkSync(path.join(directory, stored.file_path));
  const missing = await getHistoricalValidation(restored.project.id, copy.report_id); expect(missing.source_availability[0].available).toBe(false); expect(missing.totals).toEqual(report.totals);
});
it('enforces a same-project companion/report foreign key even for crafted restored rows', async () => {
  const { manifest } = await fixture(), preview = await previewHistoricalValidation(project, manifest), report = await applyHistoricalValidation(project, manifest, preview.payload_hash);
  const other = captureQaReport(foreign, { type: 'historical_file_validation' }, {}, []);
  expect(() => getDb().prepare('INSERT INTO historical_validation_reports SELECT ?,project_id,?,identity_hash || ?,preview_hash,definition_hash,engine_hash,source_ids_json,manifest_json,snapshot_json,result_json,created_at,actor,oauth_grant_id,restored_from_id FROM historical_validation_reports WHERE report_id=?').run('crafted-cross-project', other.id, '-other', report.report_id)).toThrow('FOREIGN KEY');
});
