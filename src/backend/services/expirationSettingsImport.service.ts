/**
 * Expiration settings import/export service (T-1-08, PLAN "Import / export contracts" >
 * Expiration settings, D-04, D-22). Same stateless preview-then-apply shape as
 * `dataMappingImport.service.ts` (see that file's top comment for the general pattern); the plan
 * here is much flatter — one step per event (create-or-update its `expiration_json`) plus one step
 * for `Project.default_expiration_json`.
 */
import { getDb } from '../db';
import * as EventDAL from '../dal/event.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as VariantDAL from '../dal/variant.dal';
import {
  parseExpirationSettings,
  type ExpirationBlock,
  type ExpirationSettingsEvent,
  type ExpirationSettingsModel,
} from '../../domain/import/expirationSettings';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem } from '../../domain/diff/types';
import { KNOWN_SYSTEM_EVENT_TYPES } from '../../domain/bloomreach';
import { generateVariantName, type VariantCondition } from '../../domain/variants';
import { ConflictError, PayloadChangedError } from '../errors';
import { findEventByName, findPropertyByName, findMatchingVariant } from './bloomreachImportHelpers';

interface PlanStep {
  id: string;
  run: () => void;
}

interface PlanResult {
  items: DiffItem[];
  warnings: string[];
  steps: PlanStep[];
}

export interface ExpirationSettingsPreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

export interface ExpirationSettingsApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

function describeExpiration(block: ExpirationBlock): string {
  return block.enabled && block.count !== null && block.units !== null ? `${block.count} ${block.units}` : 'disabled';
}

/**
 * A block with `enabled: true` but no duration cannot really be "enabled" (Bloomreach never sends
 * that shape); treated as disabled with no duration and a warning, so the write always satisfies
 * `validateExpirationJson`.
 */
function normalizeBlock(block: ExpirationBlock, warnings: string[], label: string): ExpirationBlock {
  if (block.enabled && (block.count === null || block.units === null)) {
    warnings.push(`${label} is enabled with no duration; treated as disabled.`);
    return { enabled: false, count: null, units: null };
  }
  return block;
}

function expirationEqual(a: unknown, b: ExpirationBlock): boolean {
  if (!a || typeof a !== 'object') return false;
  const v = a as ExpirationBlock;
  return v.enabled === b.enabled && v.count === b.count && v.units === b.units;
}

function buildPlan(projectId: string, model: ExpirationSettingsModel): PlanResult {
  const items: DiffItem[] = [];
  const warnings = [...model.warnings];
  const steps: PlanStep[] = [];
  const plannedIds = new Set<string>();

  function addItem(item: DiffItem, run: () => void): void {
    if (plannedIds.has(item.id)) return;
    plannedIds.add(item.id);
    items.push(item);
    steps.push({ id: item.id, run });
  }

  for (const ev of model.events) planExpirationEvent(ev);
  planProjectDefault(model.other);

  return { items, warnings, steps };

  function planExpirationEvent(ev: ExpirationSettingsEvent): void {
    const desired = normalizeBlock(
      ev.expiration,
      warnings,
      ev.filter.length > 0 ? `events[type=${ev.type}].filter.expiration` : `events[type=${ev.type}].expiration`
    );
    // fix round ERROR 3 (PLAN "Expiration settings": non-empty filter -> Variant with
    // Variant.expiration_json): an entry with a filter targets the matching Variant, never the
    // whole Event, and each entry gets its own id (no more two filter entries of the same event
    // type colliding on one `event_expiration:<type>` id).
    if (ev.filter.length > 0) {
      planVariantExpiration(ev, desired);
      return;
    }
    planWholeEventExpiration(ev, desired);
  }

  function planWholeEventExpiration(ev: ExpirationSettingsEvent, desired: ExpirationBlock): void {
    const id = `event_expiration:${ev.type}`;
    if (plannedIds.has(id)) return;
    const existingEvent = findEventByName(projectId, ev.type);
    const eventType = KNOWN_SYSTEM_EVENT_TYPES.includes(ev.type) ? 'system' : 'custom';

    if (!existingEvent) {
      addItem(
        {
          id,
          op: 'create',
          entity_type: 'event',
          entity_key: ev.type,
          changes: [],
          default_selected: true,
          note: `Create ${eventType} event "${ev.type}" with expiration ${describeExpiration(desired)}.`,
        },
        () => {
          if (!findEventByName(projectId, ev.type)) {
            EventDAL.createEvent(projectId, { name: ev.type, event_type: eventType, expiration_json: desired });
          } else {
            const row = findEventByName(projectId, ev.type);
            if (row && !expirationEqual(row.expiration_json, desired)) {
              EventDAL.updateEvent(projectId, row.id, { expiration_json: desired });
            }
          }
        }
      );
      return;
    }

    if (expirationEqual(existingEvent.expiration_json, desired)) return;
    addItem(
      {
        id,
        op: 'update',
        entity_type: 'event',
        entity_key: ev.type,
        changes: [{ field: 'expiration_json', before: existingEvent.expiration_json, after: desired }],
        default_selected: true,
        note: `Set expiration on "${ev.type}" to ${describeExpiration(desired)}.`,
      },
      () => {
        const row = findEventByName(projectId, ev.type);
        if (row && !expirationEqual(row.expiration_json, desired)) {
          EventDAL.updateEvent(projectId, row.id, { expiration_json: desired });
        }
      }
    );
  }

  /**
   * fix round ERROR 3: resolves the filter to the Variant it names (each condition's property must
   * already be linked to the event as a `discriminator` — an expiration import never itself
   * promotes a role or creates a property, unlike the data-mapping import; PLAN scopes this format
   * to Event/Variant.expiration_json only). No matching discriminator link -> a warning and skip
   * (never falls back to writing the whole Event).
   */
  function planVariantExpiration(ev: ExpirationSettingsEvent, desired: ExpirationBlock): void {
    const existingEvent = findEventByName(projectId, ev.type);
    if (!existingEvent) {
      warnings.push(`events[type=${ev.type}].filter targets event "${ev.type}", which does not exist yet; skipped.`);
      return;
    }
    const { properties: linked } = EventDAL.getEventWithProperties(projectId, existingEvent.id);
    const conditions: VariantCondition[] = [];
    const identityNames: Record<string, string> = {};
    for (const cond of ev.filter) {
      const prop = findPropertyByName(projectId, 'event', cond.property);
      const link = prop ? linked.find((p) => p.property_id === prop.id) : undefined;
      if (!prop || !link || link.role !== 'discriminator') {
        warnings.push(
          `events[type=${ev.type}].filter references property "${cond.property}", which is not linked to "${ev.type}" as a discriminator; skipped.`
        );
        return;
      }
      conditions.push({ property_id: prop.id, operator: cond.operator, values: cond.values });
      identityNames[prop.id] = prop.name;
    }

    const displayName = generateVariantName(ev.type, conditions, identityNames);
    const id = `variant_expiration:${displayName}`;
    if (plannedIds.has(id)) return;
    const existingVariant = findMatchingVariant(projectId, existingEvent.id, ev.filter);
    const existingVariantRow = existingVariant ? VariantDAL.getVariantByIdInProject(projectId, existingVariant.id) : null;

    if (!existingVariant) {
      addItem(
        {
          id,
          op: 'create',
          entity_type: 'variant',
          entity_key: displayName,
          changes: [],
          default_selected: true,
          note: `Create variant "${displayName}" with expiration ${describeExpiration(desired)}.`,
        },
        () => {
          const event = findEventByName(projectId, ev.type);
          if (!event) return;
          const already = findMatchingVariant(projectId, event.id, ev.filter);
          if (already) {
            const row = VariantDAL.getVariantByIdInProject(projectId, already.id);
            if (row && !expirationEqual(row.expiration_json, desired)) {
              VariantDAL.updateVariant(projectId, event.id, already.id, { expiration_json: desired });
            }
            return;
          }
          try {
            VariantDAL.createVariant(projectId, event.id, { conditions, expiration_json: desired });
          } catch (err) {
            if (err instanceof ConflictError) return;
            throw err;
          }
        }
      );
      return;
    }

    if (expirationEqual(existingVariantRow?.expiration_json ?? null, desired)) return;
    addItem(
      {
        id,
        op: 'update',
        entity_type: 'variant',
        entity_key: displayName,
        changes: [{ field: 'expiration_json', before: existingVariantRow?.expiration_json ?? null, after: desired }],
        default_selected: true,
        note: `Set expiration on variant "${displayName}" to ${describeExpiration(desired)}.`,
      },
      () => {
        const event = findEventByName(projectId, ev.type);
        if (!event) return;
        const variant = findMatchingVariant(projectId, event.id, ev.filter);
        if (!variant) return;
        const row = VariantDAL.getVariantByIdInProject(projectId, variant.id);
        if (row && !expirationEqual(row.expiration_json, desired)) {
          VariantDAL.updateVariant(projectId, event.id, variant.id, { expiration_json: desired });
        }
      }
    );
  }

  function planProjectDefault(other: ExpirationBlock): void {
    const desired = normalizeBlock(other, warnings, 'other');
    const project = ProjectDAL.getProjectOrThrow(projectId);
    if (expirationEqual(project.default_expiration_json, desired)) return;
    const id = 'project:default_expiration';
    items.push({
      id,
      op: 'update',
      entity_type: 'project',
      entity_key: 'default_expiration_json',
      changes: [{ field: 'default_expiration_json', before: project.default_expiration_json, after: desired }],
      default_selected: true,
      note: `Set project default expiration to ${describeExpiration(desired)}.`,
    });
    steps.push({
      id,
      run: () => {
        const proj = ProjectDAL.getProjectOrThrow(projectId);
        if (!expirationEqual(proj.default_expiration_json, desired)) {
          ProjectDAL.updateProject(projectId, { default_expiration_json: desired });
        }
      },
    });
  }
}

export function previewExpirationSettings(projectId: string, rawJson: unknown): ExpirationSettingsPreviewResult {
  const model = parseExpirationSettings(rawJson);
  const { items, warnings } = buildPlan(projectId, model);
  return { items, warnings, payload_hash: payloadHash(rawJson) };
}

export function applyExpirationSettings(
  projectId: string,
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[]
): ExpirationSettingsApplySummary {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseExpirationSettings(rawJson);
  const selected = new Set(selectedItemIds);
  const applied: string[] = [];
  const skipped: string[] = [];

  const db = getDb();
  const run = db.transaction(() => {
    const { items, steps } = buildPlan(projectId, model);
    for (const item of items) {
      if (selected.has(item.id)) applied.push(item.id);
      else skipped.push(item.id);
    }
    for (const step of steps) {
      if (selected.has(step.id)) step.run();
    }
  });
  run();

  const finalPlan = buildPlan(projectId, model);
  return { applied, skipped, warnings: finalPlan.warnings };
}
