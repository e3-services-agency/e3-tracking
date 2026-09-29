/**
 * Statement-count and correctness coverage for T-3-03's pre-QA fix round (reviewer 23:22,
 * supervisor decision 23:24, WARNING 1/2, LOW 3): every CSV row builder and `listCsvEntityCounts`
 * must run a small, fixed number of SQL statements regardless of project size (one project-wide
 * query per table, never one per row/link); `rules.csv` must exclude a rule whose event was
 * soft-deleted; `observations.csv` carries `timestamp_iso` next to `timestamp`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { previewExpirationSettings, applyExpirationSettings } from './expirationSettingsImport.service';
import { CSV_ENTITIES } from '../../domain/csv';
import * as CommentDAL from '../dal/comment.dal';
import { buildCsvRows, listCsvEntityCounts } from './csvExport.service';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const expirationFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/expiration-settings.json'), 'utf-8')
);

let projectId: string;

beforeAll(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const mappingPreview = previewDataMapping(projectId, dataMappingFixture);
  applyDataMapping(
    projectId,
    dataMappingFixture,
    mappingPreview.payload_hash,
    mappingPreview.items.map((i) => i.id)
  );
  const expirationPreview = previewExpirationSettings(projectId, expirationFixture);
  applyExpirationSettings(
    projectId,
    expirationFixture,
    expirationPreview.payload_hash,
    expirationPreview.items.map((i) => i.id)
  );
});

afterAll(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('comments.csv header (T-4-10)', () => {
  it('declares internal_only right after via_share and every row carries it', () => {
    const headers = CSV_ENTITIES.comments.headers as readonly string[];
    expect(headers.indexOf('internal_only')).toBe(headers.indexOf('via_share') + 1);
    const eventId = EventDAL.listEvents(projectId)[0].id;
    CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'x',
      internal_only: true,
    });
    const rows = buildCsvRows(projectId, 'comments');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].internal_only).toBeTruthy();
  });
});

describe('statement counts (D-46 pre-QA fix, WARNING 1)', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(getDb(), 'prepare');
  });

  it('events builder runs well under 50 statements', () => {
    spy.mockClear();
    buildCsvRows(projectId, 'events');
    expect(spy.mock.calls.length).toBeLessThan(50);
  });

  it('event_properties builder runs well under 50 statements (was 2291 on the Data Manager fixture)', () => {
    spy.mockClear();
    buildCsvRows(projectId, 'event_properties');
    expect(spy.mock.calls.length).toBeLessThan(50);
  });

  it('listCsvEntityCounts runs well under 50 statements (was 3145, building every file to count)', () => {
    spy.mockClear();
    listCsvEntityCounts(projectId);
    expect(spy.mock.calls.length).toBeLessThan(50);
  });
});

describe('rules.csv excludes rules of a soft-deleted event (D-46 pre-QA fix, WARNING 2)', () => {
  it('a rule survives deleteEvent in the DAL but is filtered out of the CSV rows', () => {
    const event = EventDAL.createEvent(projectId, { name: 'csv_pre_qa_rule_event', class: 'custom' });
    RuleDAL.createRule(projectId, event.id, {
      kind: 'bound',
      name: 'always_true',
      expression_json: { kind: 'bound', subject: { ref: 'constant', value: 1 }, check: 'non_empty' },
    });

    EventDAL.deleteEvent(projectId, event.id);

    // Pre-existing gap (documented, not fixed here): the orphaned rule row still exists in the DAL.
    const orphaned = RuleDAL.listRulesByProject(projectId).filter((r) => r.event_id === event.id);
    expect(orphaned.length).toBe(1);

    const rows = buildCsvRows(projectId, 'rules');
    expect(rows.some((r) => r.event_id === event.id)).toBe(false);
  });
});

describe('observations.csv timestamp_iso (D-46 pre-QA fix, LOW 3)', () => {
  it('renders an ISO string next to the raw epoch-seconds timestamp', () => {
    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
    const epochSeconds = 1700000000;
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'manual',
      event_type: 'csv_pre_qa_timestamp_test',
      timestamp: epochSeconds,
      properties: {},
    });

    const rows = buildCsvRows(projectId, 'observations');
    const row = rows.find((r) => r.event_type === 'csv_pre_qa_timestamp_test');
    expect(row).toBeTruthy();
    expect(row!.timestamp).toBe(epochSeconds);
    expect(row!.timestamp_iso).toBe(new Date(epochSeconds * 1000).toISOString());
  });
});
