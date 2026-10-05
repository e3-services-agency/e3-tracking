/**
 * D-62 (M2): the project default source is applied to events created through the editor/API, never
 * to events created by the import planners.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as SourceDAL from '../dal/source.dal';
import * as EventDAL from '../dal/event.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8'));
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

describe('default source and imports', () => {
  it('a data-mapping import creates events with no source even when the project has a default source', () => {
    const source = SourceDAL.createSource(projectId, { name: 'Shop', system: 'shopify', method: 'web_sdk_gtm_datalayer' });
    ProjectDAL.updateProject(projectId, { default_source_id: source.id });
    const preview = previewDataMapping(projectId, fixture);
    applyDataMapping(projectId, fixture, preview.payload_hash, preview.items.map((i) => i.id));
    const events = EventDAL.listEvents(projectId);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(EventDAL.listEventSourceIds(projectId, e.id)).toEqual([]);
    // the editor/API path still applies it
    const created = EventDAL.createEvent(projectId, { name: 'brand_new_event' }, { applyDefaultSource: true });
    expect(EventDAL.listEventSourceIds(projectId, created.id)).toEqual([source.id]);
  });
});
