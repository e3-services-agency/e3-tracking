/**
 * Customer events export import/export service (T-1-09, PLAN "Import / export contracts" >
 * "Customer events export", D-04, D-22). Unlike the data-mapping/expiration-settings imports
 * (T-1-08), this format never proposes definition writes: "the diff for this format is an import
 * preview" (counts, resolution, unknown types, duplicates), and `apply` creates one `QaRun` plus
 * the selected `Observation` rows, then runs comparison 3 (`comparison.service.ts`) for the whole
 * project. Follows the same preview-then-apply/hash contract as T-1-08 (`payload_hash`,
 * `selected_item_ids`, 409 `PAYLOAD_CHANGED` on a stale hash) so the Import page's pattern is
 * reused, but the "diff items" here are proposed Observations, not entity writes.
 */
import { getDb } from '../db';
import { listVariants } from '../dal/variant.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { runComparison, type ComparisonSummary } from './comparison.service';
import { createEventResolver } from './eventResolution';
import {
  parseCustomerEventsExport,
  type CustomerEventsExportEvent,
  type CustomerEventsExportModel,
} from '../../domain/import/customerEventsExport';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem } from '../../domain/diff/types';
import { KNOWN_SYSTEM_EVENT_TYPES } from '../../domain/bloomreach';
import { BadRequestError, PayloadChangedError } from '../errors';

/**
 * `apply` with an empty (or entirely-deselected) `selected_item_ids` would otherwise still create
 * an empty `QaRun` and run comparison for nothing (fix round LOW 7). The UI already disables the
 * Apply button in this case (`Import.tsx`); the API enforces the same rule.
 */
export class NoObservationsSelectedError extends BadRequestError {
  readonly code = 'NO_OBSERVATIONS_SELECTED';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'NoObservationsSelectedError';
  }
}

export interface CustomerEventsTypeSummary {
  type: string;
  count: number;
  resolved: boolean;
  /** True when the type has no Event definition but is a known Bloomreach system event type (D-25 Q5): still unresolved, but not flagged as "unexpected" in the preview UI. */
  known_system: boolean;
  variants: string[];
}

export interface CustomerEventsPreviewResult {
  items: DiffItem[];
  type_summary: CustomerEventsTypeSummary[];
  duplicate_count: number;
  warnings: string[];
  payload_hash: string;
  run_header: { kind: 'export_paste'; customer_id: string | null; source_meta: unknown };
}

function itemId(index: number, evt: CustomerEventsExportEvent): string {
  return `observation:${index}:${evt.type}:${evt.timestamp}`;
}

/** Every existing observation's raw_hash across the whole project (any run), for the "duplicates already present in another run" preview signal. */
function existingHashesForProject(projectId: string): Set<string> {
  const rows = getDb()
    .prepare('SELECT raw_hash FROM observations WHERE project_id = ?')
    .all(projectId) as { raw_hash: string }[];
  return new Set(rows.map((r) => r.raw_hash));
}

function buildItemsAndSummary(
  projectId: string,
  model: CustomerEventsExportModel
): { items: DiffItem[]; type_summary: CustomerEventsTypeSummary[]; duplicate_count: number } {
  const existingHashes = existingHashesForProject(projectId);
  const items: DiffItem[] = [];
  const byType = new Map<string, CustomerEventsTypeSummary>();
  let duplicateCount = 0;
  // T-2-04 (D-21 "Batched resolution"): one resolver built once for every event in the file, instead
  // of a fresh `listEvents`/`getEventWithProperties`/`listVariants` scan per event (same fix as
  // `comparison.service.ts`'s `buildEngineObservations`).
  const resolve = createEventResolver(projectId);

  model.events.forEach((evt, index) => {
    const { event_id, variant_id } = resolve(evt.type, evt.properties);
    const resolved = event_id !== null;
    const knownSystem = !resolved && KNOWN_SYSTEM_EVENT_TYPES.includes(evt.type);
    const hash = ObservationDAL.computeRawHash(evt.type, evt.timestamp, evt.properties);
    const isDuplicate = existingHashes.has(hash);
    if (isDuplicate) duplicateCount += 1;

    const variantName = variant_id ? listVariants(projectId, event_id as string).find((v) => v.id === variant_id)?.name ?? null : null;

    const summary = byType.get(evt.type) ?? { type: evt.type, count: 0, resolved, known_system: knownSystem, variants: [] };
    summary.count += 1;
    if (variantName && !summary.variants.includes(variantName)) summary.variants.push(variantName);
    byType.set(evt.type, summary);

    items.push({
      id: itemId(index, evt),
      op: isDuplicate ? 'unchanged' : 'create',
      entity_type: 'observation',
      entity_key: `${evt.type}@${evt.timestamp}`,
      changes: [],
      default_selected: !isDuplicate,
      note: isDuplicate
        ? `Already present elsewhere in this project (duplicate raw payload).`
        : resolved
          ? variantName
            ? `Resolves to event "${evt.type}" (variant "${variantName}").`
            : `Resolves to event "${evt.type}".`
          : knownSystem
            ? `"${evt.type}" is a known Bloomreach system event type with no Event definition; stored unresolved.`
            : `"${evt.type}" has no matching Event definition; stored unresolved (unexpected_event).`,
    });
  });

  return { items, type_summary: Array.from(byType.values()), duplicate_count: duplicateCount };
}

export function previewCustomerEventsExport(projectId: string, rawJson: unknown): CustomerEventsPreviewResult {
  const model = parseCustomerEventsExport(rawJson);
  const { items, type_summary, duplicate_count } = buildItemsAndSummary(projectId, model);
  return {
    items,
    type_summary,
    duplicate_count,
    warnings: model.warnings,
    payload_hash: payloadHash(rawJson),
    run_header: {
      kind: 'export_paste',
      customer_id: model.customer_id,
      source_meta: { url: model.url, events_listed: model.events_listed, note: model.note },
    },
  };
}

export interface CustomerEventsApplyResult {
  run: QaRunDAL.QaRunRow;
  inserted: number;
  skipped: number;
  comparison: ComparisonSummary;
}

export function applyCustomerEventsExport(
  projectId: string,
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[],
  actor: string | null
): CustomerEventsApplyResult {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseCustomerEventsExport(rawJson);
  const selected = new Set(selectedItemIds);
  if (selected.size === 0) {
    throw new NoObservationsSelectedError('Select at least one observation to apply.', 'selected_item_ids');
  }

  const db = getDb();
  let run!: QaRunDAL.QaRunRow;
  let inserted = 0;
  let skipped = 0;

  const write = db.transaction(() => {
    run = QaRunDAL.createQaRun(projectId, {
      kind: 'export_paste',
      actor,
      customer_id: model.customer_id,
      source_meta_json: { url: model.url, events_listed: model.events_listed, note: model.note },
    });

    const resolve = createEventResolver(projectId);
    model.events.forEach((evt, index) => {
      if (!selected.has(itemId(index, evt))) {
        skipped += 1;
        return;
      }
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
  });
  write();

  const comparison = runComparison(projectId);
  return { run, inserted, skipped, comparison };
}
