/**
 * `buildTrackingDocument` snapshot test (T-2-08, D-34): the fixture project with the data-mapping
 * and expiration-settings fixtures (T-1-08), both Data Manager files (T-2-02/T-2-03) and the
 * customer events export (T-1-09) applied, retyped exactly like `comparison.service.test.ts`'s
 * `retypeForTypeMismatches` (the "phase 1 test definition" every other T-2-0x fixture test shares),
 * then a comparison recompute so `findings_summary`/certification reflect real findings. UUIDs and
 * `generated_at` are normalized (sorted-key traversal, sequential `id-N` placeholders) before the
 * snapshot so the test is stable across runs despite random ids/timestamps.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import { previewDataMapping, applyDataMapping } from './dataMappingImport.service';
import { previewExpirationSettings, applyExpirationSettings } from './expirationSettingsImport.service';
import { previewDataManagerCustomers, applyDataManagerCustomers } from './dataManagerCustomersImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { previewCustomerEventsExport, applyCustomerEventsExport } from './customerEventsExportImport.service';
import { runComparison } from './comparison.service';
import { buildTrackingDocument } from './document.service';

const samplesDir = path.resolve(__dirname, '../../../.claude/team/samples');
const dataMappingFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-mapping.json'), 'utf-8'));
const expirationFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'expiration-settings.json'), 'utf-8'));
const dataManagerCustomersFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-customers.json'), 'utf-8'));
const dataManagerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'data-manager-events.json'), 'utf-8'));
const customerEventsFixture = JSON.parse(fs.readFileSync(path.join(samplesDir, 'customer-events-export.json'), 'utf-8'));

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

/** Same "phase 1 test definition" retyping every T-2-0x fixture test shares (`comparison.service.test.ts`'s `retypeForTypeMismatches`). */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalize(value: unknown, idMap: Map<string, string>, counter: { n: number }): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v, idMap, counter));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key], idMap, counter);
    }
    return out;
  }
  if (typeof value === 'string' && UUID_RE.test(value)) {
    let placeholder = idMap.get(value);
    if (!placeholder) {
      placeholder = `id-${counter.n++}`;
      idMap.set(value, placeholder);
    }
    return placeholder;
  }
  return value;
}

describe('buildTrackingDocument on the fixture project', () => {
  it('matches the recorded snapshot (ids and generated_at normalized)', () => {
    applyAllFixtures();
    const doc = buildTrackingDocument(projectId);
    const { generated_at, ...rest } = doc;
    void generated_at;
    const normalized = normalize(rest, new Map(), { n: 1 });
    expect(normalized).toMatchSnapshot();
  });

  it('carries every custom event before any sdk/platform event, and a findings summary with at least one open finding (the retyped fixture still has real type mismatches on unmapped properties)', () => {
    applyAllFixtures();
    const doc = buildTrackingDocument(projectId);
    const classes = doc.events.map((e) => e.class);
    const firstNonCustom = classes.indexOf('custom') === -1 ? -1 : classes.lastIndexOf('custom');
    expect(classes.slice(0, firstNonCustom + 1).every((c) => c === 'custom')).toBe(true);
    expect(doc.findings_summary.open.error + doc.findings_summary.open.warning + doc.findings_summary.open.info).toBeGreaterThan(0);
  });
});
