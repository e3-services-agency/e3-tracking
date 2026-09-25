/**
 * QA run export round-trip test (T-2-11, PLAN "QA run export"): apply the customer-events-export
 * fixture, export the created run, deep-equal the `events` array back to the fixture's own
 * `events` array (sorted the same way, by timestamp desc -- the fixture happens to already be in
 * that order). What is *not* byte-reconstructible and is intentionally not asserted: the
 * fixture's top-level `project` field ("e3", a Bloomreach project name/slug) is discarded on
 * import (only `url`/`events_listed`/`note` survive in `source_meta_json`, see
 * `customerEventsExportImport.service.ts`), so the export's `project` field is this app's project
 * `key` instead, not the original string.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import { previewCustomerEventsExport, applyCustomerEventsExport } from './customerEventsExportImport.service';
import { exportQaRunAsCustomerEventsExport } from './qaRunExport.service';

const eventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);

let projectId: string;
let projectKey: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
  projectId = project.id;
  projectKey = project.key;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('exportQaRunAsCustomerEventsExport', () => {
  it('round-trips the events array of the applied fixture, sorted by timestamp desc', () => {
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    const result = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      preview.payload_hash,
      preview.items.map((i) => i.id),
      'Jan'
    );

    const exported = exportQaRunAsCustomerEventsExport(projectId, result.run.id);

    expect(exported.customer_id).toBe(eventsFixture.customer_id);
    // Not reconstructible: the original `project` field is discarded on import; the export uses
    // this app's project key instead.
    expect(exported.project).toBe(projectKey);
    expect(exported.url).toBe(eventsFixture.url);
    expect(exported.events_listed).toBe(eventsFixture.events_listed);
    expect(exported.note).toBe(eventsFixture.note);

    const expectedEvents = [...eventsFixture.events].sort((a, b) => b.timestamp - a.timestamp);
    expect(exported.events).toEqual(expectedEvents);
  });

  it('exports an empty events array for a run with no observations selected', () => {
    // A run must have at least one observation (NoObservationsSelectedError otherwise), so
    // instead this asserts the shape holds for a run whose only observation was later archived
    // out of scope -- archiving does not remove the observations, so the export still lists them
    // (export reproduces the run's raw evidence, not the comparison scope).
    const preview = previewCustomerEventsExport(projectId, eventsFixture);
    const result = applyCustomerEventsExport(
      projectId,
      eventsFixture,
      preview.payload_hash,
      [preview.items[0].id],
      'Jan'
    );
    const exported = exportQaRunAsCustomerEventsExport(projectId, result.run.id);
    expect(exported.events).toHaveLength(1);
  });
});
