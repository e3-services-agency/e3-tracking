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
import { BadRequestError, ConflictError, PayloadChangedError, ValidationError } from '../errors';

const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const FILES = ['manifest.json', 'customer-events-export.json', 'data-manager-events.json'] as const;


export class ArchiveTooLargeError extends BadRequestError {
  readonly code = 'ARCHIVE_TOO_LARGE';
  constructor(message: string) {
    super(message, 'file');
    this.name = 'ArchiveTooLargeError';
  }
}

interface StreamHelper {
  on(ev: 'data', fn: (c: Uint8Array) => void): StreamHelper;
  on(ev: 'error', fn: (e: Error) => void): StreamHelper;
  on(ev: 'end', fn: () => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
}

/** Streams one entry, counting real inflated bytes (the declared size is never trusted) and aborting past the caps. */
function readEntryText(entry: JSZip.JSZipObject, name: string, usedTotal: number): Promise<{ text: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    // `internalStream` is public in JSZip but missing from its typings.
    const helper = (entry as unknown as { internalStream(t: 'uint8array'): StreamHelper }).internalStream('uint8array');
    helper
      .on('data', (chunk: Uint8Array) => {
        if (failed) return;
        bytes += chunk.length;
        if (bytes > MAX_ENTRY_BYTES || usedTotal + bytes > MAX_TOTAL_BYTES) {
          failed = true;
          helper.pause();
          reject(new ArchiveTooLargeError(`${name} is too large (limit ${MAX_ENTRY_BYTES / 1024 / 1024} MB per file, ${MAX_TOTAL_BYTES / 1024 / 1024} MB in total).`));
          return;
        }
        chunks.push(Buffer.from(chunk));
      })
      .on('error', (e: Error) => {
        if (!failed) {
          failed = true;
          reject(new BadRequestError(`${name} could not be read: ${e.message}`, 'file'));
        }
      })
      .on('end', () => {
        if (!failed) resolve({ text: Buffer.concat(chunks).toString('utf8'), bytes });
      })
      .resume();
  });
}

/** 409: a run of this project already carries a manifest with the same `generated_at` and tool build. `details` is the existing run id. */
export class DuplicateQaSampleError extends ConflictError {
  readonly code = 'DUPLICATE_QA_SAMPLE';
  constructor(public readonly existingRunId: string) {
    super('This QA sample was already imported (same generated_at and tool build).', existingRunId);
    this.name = 'DuplicateQaSampleError';
  }
}

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
  let total = 0;
  for (const name of FILES) {
    const entry = Object.values(zip.files).find((f) => !f.dir && f.name.split('/').pop() === name);
    if (!entry) throw new BadRequestError(`The archive has no ${name}.`, 'file');
    const { text, bytes } = await readEntryText(entry, name, total);
    total += bytes;
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
  actor: string | null,
  force = false
): QaSampleApplyResult {
  if (payloadHash(docs) !== expectedHash) {
    throw new PayloadChangedError('The archive changed since preview; re-run preview before applying.');
  }
  const known = new Set(previewDataManagerEvents(projectId, docs.data_manager_events).items.map((i) => i.id));
  const unknown = selectedDmItemIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ValidationError(`selected_item_ids contains unknown item ids: ${unknown.slice(0, 5).join(', ')}.`, 'selected_item_ids');
  }
  const facts = qaSampleFacts(docs.manifest);
  if (!force && facts.generated_at) {
    const dup = QaRunDAL.listQaRuns(projectId).find((r) => {
      if (r.manifest_json == null) return false;
      const f = qaSampleFacts(r.manifest_json);
      return f.generated_at === facts.generated_at && f.build === facts.build;
    });
    if (dup) throw new DuplicateQaSampleError(dup.id);
  }
  const model = parseCustomerEventsExport(docs.customer_events);
  if (model.events.length === 0) throw new NoObservationsSelectedError('The archive has no events to import.', 'file');

  // One outer transaction: Data Manager changes (their own transaction becomes a savepoint, change_log
  // rows included), the run and the observations commit together or not at all. Comparison runs after commit.
  let dm!: ReturnType<typeof applyDataManagerEvents>;
  let run!: QaRunDAL.QaRunRow;
  let inserted = 0;
  let skipped = 0;
  getDb().transaction(() => {
    dm = applyDataManagerEvents(projectId, docs.data_manager_events, payloadHash(docs.data_manager_events), selectedDmItemIds);
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
