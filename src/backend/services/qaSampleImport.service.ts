/**
 * QA sample archive import (T-5-30, D-04, D-22, D-28). A zip from the QA sampler extension holds
 * `manifest.json`, `customer-events-export.json` (array form) and `data-manager-events.json` (the
 * raw `project/schemas` wrapper). Preview shows one combined summary plus the Data Manager diff;
 * apply creates ONE QA run (`source: 'extension'`, manifest stored on the run), imports the
 * observations into it, applies the selected Data Manager items through the same planner as the
 * file import, then runs the comparison. The payload hash covers the three parsed documents, so a
 * different archive on apply is a 409 `PAYLOAD_CHANGED`.
 */
import JSZip from 'jszip';
import { getDb } from '../db';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { runComparison, type ComparisonSummary } from './comparison.service';
import { createEventResolver } from './eventResolution';
import {
  buildItemsAndSummary,
  NoObservationsSelectedError,
  type CustomerEventsTypeSummary,
} from './customerEventsExportImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { parseCustomerEventsExport } from '../../domain/import/customerEventsExport';
import { qaSampleFacts, type QaSampleFacts } from '../../domain/import/qaSampleManifest';
import { parseDataManagerEvents } from '../../domain/import/dataManagerEvents';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem } from '../../domain/diff/types';
import { BadRequestError, PayloadChangedError } from '../errors';

const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const FILES = ['manifest.json', 'customer-events-export.json', 'data-manager-events.json'] as const;

export interface QaSampleDocs {
  manifest: unknown;
  customer_events: unknown;
  data_manager_events: unknown;
}

/** Reads the three known entries from the zip (by base name, so a wrapping folder is fine); nothing else is ever read. */
export async function readQaSampleArchive(buffer: Buffer): Promise<QaSampleDocs> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BadRequestError('The file is not a readable zip archive.', 'file');
  }
  const out: Record<string, unknown> = {};
  for (const name of FILES) {
    const entry = Object.values(zip.files).find((f) => !f.dir && f.name.split('/').pop() === name);
    if (!entry) throw new BadRequestError(`The archive has no ${name}.`, 'file');
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof size === 'number' && size > MAX_ENTRY_BYTES) throw new BadRequestError(`${name} is too large.`, 'file');
    const text = await entry.async('string');
    try {
      out[name] = JSON.parse(text);
    } catch {
      throw new BadRequestError(`${name} is not valid JSON.`, 'file');
    }
  }
  return {
    manifest: out['manifest.json'],
    customer_events: out['customer-events-export.json'],
    data_manager_events: out['data-manager-events.json'],
  };
}

export interface QaSamplePreviewResult {
  facts: QaSampleFacts;
  run_name: string;
  customers: number;
  events: number;
  event_types: number;
  type_summary: CustomerEventsTypeSummary[];
  duplicate_count: number;
  observation_items: DiffItem[];
  data_manager: { events: number; properties: number; items: DiffItem[]; warnings: string[] };
  warnings: string[];
  payload_hash: string;
}

function runName(facts: QaSampleFacts): string {
  return `QA sample ${facts.generated_at ?? new Date().toISOString()}`;
}

export function previewQaSample(projectId: string, docs: QaSampleDocs): QaSamplePreviewResult {
  const facts = qaSampleFacts(docs.manifest);
  const model = parseCustomerEventsExport(docs.customer_events);
  const { items, type_summary, duplicate_count } = buildItemsAndSummary(projectId, model);
  const dmModel = parseDataManagerEvents(docs.data_manager_events);
  const dm = previewDataManagerEvents(projectId, docs.data_manager_events);
  const customers = model.customer_count || (model.events.length > 0 ? 1 : 0);
  return {
    facts,
    run_name: runName(facts),
    customers,
    events: model.events.length,
    event_types: type_summary.length,
    type_summary,
    duplicate_count,
    observation_items: items,
    data_manager: {
      events: dmModel.events.length,
      properties: dmModel.events.reduce((n, e) => n + e.properties.length, 0),
      items: dm.items,
      warnings: dm.warnings,
    },
    warnings: [...facts.warnings, ...model.warnings],
    payload_hash: payloadHash(docs),
  };
}

export interface QaSampleApplyResult {
  run: QaRunDAL.QaRunRow;
  inserted: number;
  skipped: number;
  data_manager: { applied: string[]; skipped: string[]; warnings: string[]; batch_id: string };
  comparison: ComparisonSummary;
}

export function applyQaSample(
  projectId: string,
  docs: QaSampleDocs,
  expectedHash: string,
  selectedDmItemIds: string[],
  actor: string | null
): QaSampleApplyResult {
  if (payloadHash(docs) !== expectedHash) {
    throw new PayloadChangedError('The archive changed since preview; re-run preview before applying.');
  }
  const facts = qaSampleFacts(docs.manifest);
  const model = parseCustomerEventsExport(docs.customer_events);
  if (model.events.length === 0) throw new NoObservationsSelectedError('The archive has no events to import.', 'file');

  // Data Manager first (own transaction and change_log batch; same planner and diff as the file import).
  const dm = applyDataManagerEvents(
    projectId,
    docs.data_manager_events,
    payloadHash(docs.data_manager_events),
    selectedDmItemIds
  );

  let run!: QaRunDAL.QaRunRow;
  let inserted = 0;
  let skipped = 0;
  getDb().transaction(() => {
    run = QaRunDAL.createQaRun(projectId, {
      kind: 'export_paste',
      actor,
      source: 'extension',
      notes: runName(facts),
      manifest_json: docs.manifest,
      source_meta_json: { note: 'QA sample archive', events_listed: model.events.length },
    });
    const resolve = createEventResolver(projectId);
    model.events.forEach((evt) => {
      const { event_id, variant_id } = resolve(evt.type, evt.properties);
      const row = ObservationDAL.createObservation(projectId, run.id, {
        source: 'export',
        event_type: evt.type,
        event_id,
        variant_id,
        timestamp: evt.timestamp,
        properties: evt.properties,
      });
      if (row) inserted += 1;
      else skipped += 1;
    });
  })();

  const comparison = runComparison(projectId);
  return { run, inserted, skipped, data_manager: dm, comparison };
}
