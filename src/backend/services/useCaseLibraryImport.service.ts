/**
 * Use case library import/export service (T-3-06, D-47, D-22). Same stateless preview-then-apply
 * shape as the Bloomreach import planners (see `dataMappingImport.service.ts`'s top comment for the
 * general pattern), but merges by `code` against the *global* `use_case_templates` table (no
 * `project_id`, D-06) instead of a project's live definitions, and the apply step is never wrapped
 * in `runWithActor`/`recordChange` -- template edits are library maintenance, not a project change
 * (D-44's "the global template library" is explicitly excluded from `change_log`).
 *
 * Every template in the parsed file becomes exactly one `DiffItem`, keyed by `code`:
 *  - `create` when no template with that code exists yet.
 *  - `update` when one exists and at least one field differs (`changes` lists each field).
 *  - `unchanged` when one exists and every field is equal (still returned, `default_selected:
 *    false` so the preview table shows it deselected -- PLAN "unchanged shown deselected").
 * `apply` re-parses the resent raw JSON, 409s `PAYLOAD_CHANGED` on a hash mismatch (D-22), and
 * creates/updates only the selected items in one transaction.
 */
import { getDb } from '../db';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import { parseUseCaseLibrary, type LibraryTemplate } from '../../domain/import/useCaseLibrary';
import { payloadHash } from '../../domain/diff/hash';
import { diffValue } from '../../domain/diff/primitives';
import type { DiffItem, DiffItemChange } from '../../domain/diff/types';
import { PayloadChangedError } from '../errors';
import { USE_CASE_LIBRARY_FORMAT, USE_CASE_LIBRARY_VERSION } from '../../domain/enums';

export interface UseCaseLibraryPreviewResult {
  items: DiffItem[];
  warnings: string[];
  payload_hash: string;
}

export interface UseCaseLibraryApplySummary {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

/** The subset of a template's fields this planner diffs/writes, independent of `code` (the diff key) and `id`/timestamps. */
function comparableFields(t: LibraryTemplate): Record<string, unknown> {
  return {
    name: t.name,
    type: t.type,
    description: t.description,
    narrative_template: t.narrative_template,
    default_requirements_json: t.default_requirements,
    tags_json: t.tags,
    flags_json: t.flags,
  };
}

function comparableFieldsFromRow(row: UseCaseTemplateDAL.UseCaseTemplateRow): Record<string, unknown> {
  return {
    name: row.name,
    type: row.type,
    description: row.description,
    narrative_template: row.narrative_template,
    default_requirements_json: row.default_requirements_json,
    tags_json: row.tags_json,
    flags_json: row.flags_json,
  };
}

interface PlanStep {
  id: string;
  run: () => void;
}

interface PlanResult {
  items: DiffItem[];
  warnings: string[];
  steps: PlanStep[];
}

function buildPlan(templates: LibraryTemplate[]): PlanResult {
  const items: DiffItem[] = [];
  const steps: PlanStep[] = [];
  const existingByCode = new Map(UseCaseTemplateDAL.listUseCaseTemplates().map((row) => [row.code, row]));

  for (const template of templates) {
    const id = `use_case_template:${template.code}`;
    const existing = existingByCode.get(template.code);

    if (!existing) {
      items.push({
        id,
        op: 'create',
        entity_type: 'use_case_template',
        entity_key: template.code,
        changes: [],
        default_selected: true,
        note: `Create template "${template.code}" (${template.name}).`,
      });
      steps.push({
        id,
        run: () => {
          if (UseCaseTemplateDAL.listUseCaseTemplates().some((row) => row.code === template.code)) return;
          UseCaseTemplateDAL.createUseCaseTemplate({
            code: template.code,
            name: template.name,
            type: template.type,
            description: template.description,
            default_requirements_json: template.default_requirements,
            narrative_template: template.narrative_template,
            tags_json: template.tags,
            flags_json: template.flags,
          });
        },
      });
      continue;
    }

    const beforeFields = comparableFieldsFromRow(existing);
    const afterFields = comparableFields(template);
    const changes: DiffItemChange[] = [];
    for (const field of Object.keys(afterFields)) {
      const change = diffValue('use_case_template', template.code, field, beforeFields[field], afterFields[field]);
      if (change) changes.push({ field, before: change.before, after: change.after });
    }

    items.push({
      id,
      op: changes.length > 0 ? 'update' : 'unchanged',
      entity_type: 'use_case_template',
      entity_key: template.code,
      changes,
      default_selected: changes.length > 0,
      note:
        changes.length > 0
          ? `Update template "${template.code}" (${changes.length} field${changes.length === 1 ? '' : 's'} changed).`
          : `Template "${template.code}" is unchanged.`,
    });
    if (changes.length === 0) continue;

    steps.push({
      id,
      run: () => {
        const current = UseCaseTemplateDAL.listUseCaseTemplates().find((row) => row.code === template.code);
        if (!current) return;
        UseCaseTemplateDAL.updateUseCaseTemplate(current.id, {
          name: template.name,
          type: template.type,
          description: template.description,
          default_requirements_json: template.default_requirements,
          narrative_template: template.narrative_template,
          tags_json: template.tags,
          flags_json: template.flags,
        });
      },
    });
  }

  return { items, warnings: [], steps };
}

export function previewUseCaseLibrary(rawJson: unknown): UseCaseLibraryPreviewResult {
  const model = parseUseCaseLibrary(rawJson);
  const { items } = buildPlan(model.templates);
  return { items, warnings: model.warnings, payload_hash: payloadHash(rawJson) };
}

export function applyUseCaseLibrary(
  rawJson: unknown,
  expectedHash: string,
  selectedItemIds: string[]
): UseCaseLibraryApplySummary {
  if (payloadHash(rawJson) !== expectedHash) {
    throw new PayloadChangedError('The payload changed since preview; re-run preview before applying.');
  }
  const model = parseUseCaseLibrary(rawJson);
  const selected = new Set(selectedItemIds);
  const applied: string[] = [];
  const skipped: string[] = [];

  const db = getDb();
  const run = db.transaction(() => {
    const { steps } = buildPlan(model.templates);
    for (const step of steps) {
      if (selected.has(step.id)) {
        step.run();
        applied.push(step.id);
      } else {
        skipped.push(step.id);
      }
    }
  });
  run();

  return { applied, skipped, warnings: model.warnings };
}

/** `GET /api/use-case-templates/export.json`: the whole global library as the same envelope shape a paste import accepts (round-trip, T-3-06 acceptance). */
export function exportUseCaseLibrary(): { format: string; version: number; templates: unknown[] } {
  const rows = UseCaseTemplateDAL.listUseCaseTemplates();
  return {
    format: USE_CASE_LIBRARY_FORMAT,
    version: USE_CASE_LIBRARY_VERSION,
    templates: rows.map((row) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      description: row.description,
      narrative_template: row.narrative_template,
      tags: row.tags_json,
      flags: row.flags_json,
      default_requirements: row.default_requirements_json,
    })),
  };
}
