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
import {
  parseExpirationSettings,
  type ExpirationBlock,
  type ExpirationSettingsEvent,
  type ExpirationSettingsModel,
} from '../../domain/import/expirationSettings';
import { payloadHash } from '../../domain/diff/hash';
import type { DiffItem } from '../../domain/diff/types';
import { KNOWN_SYSTEM_EVENT_TYPES } from '../../domain/bloomreach';
import { PayloadChangedError } from '../errors';
import { findEventByName } from './bloomreachImportHelpers';

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

  for (const ev of model.events) planExpirationEvent(ev);
  planProjectDefault(model.other);

  return { items, warnings, steps };

  function planExpirationEvent(ev: ExpirationSettingsEvent): void {
    const id = `event_expiration:${ev.type}`;
    const desired = normalizeBlock(ev.expiration, warnings, `events[type=${ev.type}].expiration`);
    const existingEvent = findEventByName(projectId, ev.type);
    const eventType = KNOWN_SYSTEM_EVENT_TYPES.includes(ev.type) ? 'system' : 'custom';

    if (!existingEvent) {
      items.push({
        id,
        op: 'create',
        entity_type: 'event',
        entity_key: ev.type,
        changes: [],
        default_selected: true,
        note: `Create ${eventType} event "${ev.type}" with expiration ${describeExpiration(desired)}.`,
      });
      steps.push({
        id,
        run: () => {
          if (!findEventByName(projectId, ev.type)) {
            EventDAL.createEvent(projectId, { name: ev.type, event_type: eventType, expiration_json: desired });
          } else {
            const row = findEventByName(projectId, ev.type);
            if (row && !expirationEqual(row.expiration_json, desired)) {
              EventDAL.updateEvent(projectId, row.id, { expiration_json: desired });
            }
          }
        },
      });
      return;
    }

    if (expirationEqual(existingEvent.expiration_json, desired)) return;
    items.push({
      id,
      op: 'update',
      entity_type: 'event',
      entity_key: ev.type,
      changes: [{ field: 'expiration_json', before: existingEvent.expiration_json, after: desired }],
      default_selected: true,
      note: `Set expiration on "${ev.type}" to ${describeExpiration(desired)}.`,
    });
    steps.push({
      id,
      run: () => {
        const row = findEventByName(projectId, ev.type);
        if (row && !expirationEqual(row.expiration_json, desired)) {
          EventDAL.updateEvent(projectId, row.id, { expiration_json: desired });
        }
      },
    });
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
