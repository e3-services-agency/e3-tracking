/**
 * Data Manager customers import/export service (T-2-02, PLAN "Import / export contracts: Data
 * Manager" > "Data Manager customers", D-28, D-35, D-37). Same stateless preview-then-apply
 * contract as `dataMappingImport.service.ts`/`expirationSettingsImport.service.ts` (see those
 * files' top comments for the general pattern); the plan here is flat — one step per property
 * (create-or-update) plus one project-level "snapshot" step that is always applied.
 *
 * The snapshot step (D-35): stores the verbatim payload on `Project.data_manager_customers_json`
 * (plus `applied_at`) and the per-format defaults on `Project.data_manager_meta_json.customers` —
 * this is the comparison-4 (T-2-04) evidence store, independent of what the user selects among the
 * create/update items. It also refreshes every *already-existing* property's
 * `bloomreach_meta_json` unconditionally (not gated by that property's own item being selected),
 * because comparison 4 needs the Data Manager truth (`dm_type`/`source`) even when the user chose
 * not to propagate a field change into the definition. It runs last (after the property steps, so
 * newly-created properties already exist) but is not itself deselectable — `apply` always executes
 * it regardless of `selected_item_ids`.
 */
import { getDb } from '../db';
import * as PropertyDAL from '../dal/property.dal';
import * as ProjectDAL from '../dal/project.dal';
import {
  parseDataManagerCustomers,
  type DataManagerCustomerProperty,
  type DataManagerCustomersModel,
} from '../../domain/import/dataManagerCustomers';
import { toAppType } from '../../domain/bloomreach/dataManagerTypes';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem, DiffItemChange } from '../../domain/diff/types';
import { STANDARD_CUSTOMER_PROPERTIES } from '../../domain/bloomreach';
import { PayloadChangedError } from '../errors';
import { findPropertyByName } from './bloomreachImportHelpers';

const EMPTY_SENTINEL = '(empty)';
const SNAPSHOT_STEP_ID = 'project:data_manager_customers_snapshot';

interface PlanStep {
  id: string;
  run: () => void;
}

interface PlanResult {
  items: DiffItem[];
  warnings: string[];
  steps: PlanStep[];
}

export interface DataManagerCustomersPreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

export interface DataManagerCustomersApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

/**
 * `null`/the literal `"(empty)"` sentinel both mean "no value" (D-28); everything else is kept
 * verbatim. An empty string is also treated as "no value" here (matching `property.dal.ts`'s own
 * `description?.trim() || null` normalization on write) so the diff comparison against the stored
 * `Property.description` (which can never itself be `""`) does not propose a spurious update on
 * every re-preview.
 */
function normalizeDescription(raw: string | null): string | null {
  if (raw === null || raw === EMPTY_SENTINEL || raw === '') return null;
  return raw;
}

function normalizeExampleValues(raw: string | null): { value: string }[] {
  if (raw === null || raw === EMPTY_SENTINEL || raw === '') return [];
  return [{ value: raw }];
}

function sameFormats(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

interface CustomerPropertyMeta {
  source: string;
  used: boolean;
  deleting: boolean;
  locked_for_contact_migration: boolean;
  dm_index: number;
  raw: { description: string | null; example_values: string | null; type?: string };
}

function buildMeta(prop: DataManagerCustomerProperty, typeWarning: boolean): CustomerPropertyMeta {
  return {
    source: prop.source,
    used: prop.used,
    deleting: prop.deleting,
    locked_for_contact_migration: prop.locked_for_contact_migration,
    dm_index: prop.dm_index,
    raw: {
      description: prop.description,
      example_values: prop.example_values,
      ...(typeWarning ? { type: prop.type } : {}),
    },
  };
}

function buildPlan(projectId: string, model: DataManagerCustomersModel, rawJson: unknown): PlanResult {
  const items: DiffItem[] = [];
  const warnings = [...model.warnings];
  const steps: PlanStep[] = [];

  for (const prop of model.properties) {
    const id = `property:customer:${prop.property}`;
    const appType = toAppType(prop.type);
    if (appType.warning) warnings.push(`Property "${prop.property}": ${appType.warning}`);
    const meta = buildMeta(prop, appType.warning !== null);
    const category = prop.group;
    const pii = prop.private;
    const description = normalizeDescription(prop.description);
    const exampleValues = normalizeExampleValues(prop.example_values);
    const existing = findPropertyByName(projectId, 'customer', prop.property);
    const knownStd = STANDARD_CUSTOMER_PROPERTIES.includes(prop.property);

    if (!existing) {
      const typeLabel = appType.data_formats.length
        ? `${appType.data_type}/${appType.data_formats.join(',')}`
        : appType.data_type;
      items.push({
        id,
        op: 'create',
        entity_type: 'property',
        entity_key: prop.property,
        changes: [],
        default_selected: true,
        note: `Create customer property "${prop.property}" (${typeLabel}).`,
      });
      steps.push({
        id,
        run: () => {
          if (findPropertyByName(projectId, 'customer', prop.property)) return;
          PropertyDAL.createProperty(projectId, {
            scope: 'customer',
            name: prop.property,
            data_type: appType.data_type,
            data_formats_json: appType.data_formats,
            category,
            pii,
            description,
            example_values_json: exampleValues,
            property_type: 'custom',
            bloomreach_customer_property: knownStd ? prop.property : null,
            bloomreach_meta_json: meta,
          });
        },
      });
      continue;
    }

    const changes: DiffItemChange[] = [];
    const currentFormats = Array.isArray(existing.data_formats_json)
      ? (existing.data_formats_json as string[])
      : [];
    const typeDiffers = existing.data_type !== appType.data_type || !sameFormats(currentFormats, appType.data_formats);
    if (typeDiffers) {
      if (prop.source === 'user') {
        changes.push({
          field: 'data_type',
          before: currentFormats.length ? `${existing.data_type}/${currentFormats.join(',')}` : existing.data_type,
          after: appType.data_formats.length ? `${appType.data_type}/${appType.data_formats.join(',')}` : appType.data_type,
        });
      } else {
        warnings.push(
          `Property "${prop.property}": Data Manager type differs (source "data"); not proposed (comparison 4 evidence).`
        );
      }
    }
    if ((existing.category ?? null) !== category) {
      changes.push({ field: 'category', before: existing.category, after: category });
    }
    if (existing.pii !== pii) {
      changes.push({ field: 'pii', before: existing.pii, after: pii });
    }
    if ((existing.description ?? null) !== description) {
      changes.push({ field: 'description', before: existing.description, after: description });
    }
    const proposeStdKey = knownStd && !existing.bloomreach_customer_property;
    if (proposeStdKey) {
      changes.push({ field: 'bloomreach_customer_property', before: null, after: prop.property });
    }

    if (changes.length === 0) continue;

    items.push({
      id,
      op: 'update',
      entity_type: 'property',
      entity_key: prop.property,
      changes,
      default_selected: true,
      note: `Update customer property "${prop.property}".`,
    });
    steps.push({
      id,
      run: () => {
        const row = findPropertyByName(projectId, 'customer', prop.property);
        if (!row) return;
        const patch: Partial<PropertyDAL.PropertyInput> = {};
        if (changes.some((c) => c.field === 'data_type')) {
          patch.data_type = appType.data_type;
          patch.data_formats_json = appType.data_formats;
        }
        if (changes.some((c) => c.field === 'category')) patch.category = category;
        if (changes.some((c) => c.field === 'pii')) patch.pii = pii;
        if (changes.some((c) => c.field === 'description')) patch.description = description;
        if (changes.some((c) => c.field === 'bloomreach_customer_property')) {
          patch.bloomreach_customer_property = prop.property;
        }
        if (Object.keys(patch).length > 0) {
          PropertyDAL.updateProperty(projectId, row.id, patch);
        }
      },
    });
  }

  // ---- Snapshot step: always present, always applied regardless of selection (see module comment). ----
  const project = ProjectDAL.getProjectOrThrow(projectId);
  const desiredCustomersMeta = {
    are_all_used: model.are_all_used,
    default_private: model.default_private,
    group_order: model.group_order,
  };
  const existingProjectMeta = (project.data_manager_meta_json ?? null) as {
    customers?: unknown;
    events?: unknown;
  } | null;
  items.push({
    id: SNAPSHOT_STEP_ID,
    op: project.data_manager_customers_json ? 'update' : 'create',
    entity_type: 'project',
    entity_key: 'data_manager_customers_json',
    changes: [{ field: 'data_manager_customers_json', before: null, after: '(snapshot; always applied)' }],
    default_selected: true,
    note: 'Store the Data Manager customers snapshot (always applied; not deselectable).',
  });
  steps.push({
    id: SNAPSHOT_STEP_ID,
    run: () => {
      ProjectDAL.updateProject(projectId, {
        data_manager_meta_json: { ...(existingProjectMeta ?? {}), customers: desiredCustomersMeta },
        data_manager_customers_json: { payload: rawJson, applied_at: new Date().toISOString() },
      });
      // Refresh every already-existing property's bloomreach_meta_json (comparison-4 evidence),
      // regardless of whether its own create/update item was selected.
      for (const prop of model.properties) {
        const row = findPropertyByName(projectId, 'customer', prop.property);
        if (!row) continue; // its create step was not selected/applied
        const appType = toAppType(prop.type);
        const meta = buildMeta(prop, appType.warning !== null);
        PropertyDAL.updateProperty(projectId, row.id, { bloomreach_meta_json: meta });
      }
    },
  });

  return { items, warnings, steps };
}

export function previewDataManagerCustomers(projectId: string, rawJson: unknown): DataManagerCustomersPreviewResult {
  const model = parseDataManagerCustomers(rawJson);
  const { items, warnings } = buildPlan(projectId, model, rawJson);
  return { items, warnings, payload_hash: payloadHash(rawJson) };
}

export function applyDataManagerCustomers(
  projectId: string,
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[]
): DataManagerCustomersApplySummary {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseDataManagerCustomers(rawJson);
  const selected = new Set(selectedItemIds);
  const applied: string[] = [];
  const skipped: string[] = [];

  const db = getDb();
  const run = db.transaction(() => {
    const { items, steps } = buildPlan(projectId, model, rawJson);
    for (const item of items) {
      // The snapshot item is always selected (D-35): it is not deselectable, so `apply` runs it
      // unconditionally instead of trusting the caller's `selected_item_ids`.
      if (item.id === SNAPSHOT_STEP_ID || selected.has(item.id)) applied.push(item.id);
      else skipped.push(item.id);
    }
    for (const step of steps) {
      if (step.id === SNAPSHOT_STEP_ID || selected.has(step.id)) step.run();
    }
  });
  run();

  const finalPlan = buildPlan(projectId, model, rawJson);
  return { applied, skipped, warnings: finalPlan.warnings };
}
