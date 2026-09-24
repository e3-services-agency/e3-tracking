/**
 * UseCaseTemplate Data Access Layer (plan "Target data model" section UseCaseTemplate, D-06). This
 * table is global (no `project_id`); library content (E3's ~90 standard use cases) is loaded later
 * (D-06, CONTEXT.md 6 "Open items") — empty in phase 1 except for whatever a test inserts.
 *
 * `instantiateUseCaseTemplate` (T-1-07 acceptance: "`POST /use-cases/from-template/:id` implemented
 * against an empty table (tested with a unit-test template)") copies the template's name/type/
 * description onto a new `UseCase` in the given project and resolves each entry of
 * `default_requirements_json` to a real `Requirement`:
 *
 *   `{ target_kind, event_name?, property_name?, condition?: { property_name, value }, level }`
 *   (plan "Target data model" UseCaseTemplate section, verbatim shape)
 *
 * Resolution by kind:
 *  - `customer_property`: `property_name` -> a `scope: 'customer'` property in the project.
 *  - `event`: `event_name` -> an event in the project.
 *  - `event_property`: `event_name` + `property_name` -> the event and an event-scope property
 *    already linked to it.
 *  - `variant`/`variant_property`: `event_name` + `condition` -> the event, then the variant of
 *    that event whose `conditions_json` has a condition on the named discriminator property
 *    matching `condition.value` (an `equals` condition on that exact value, or an `in` condition
 *    that includes it). `variant_property` additionally resolves `property_name` on that variant's
 *    event, as `event_property` does. This is how the template names a variant without storing a
 *    variant id (which cannot exist yet at the template-authoring stage, since variants are
 *    per-project) — the plan's `condition` field is exactly a variant's own discriminator
 *    condition, so matching on it is name-independent and survives the client renaming the
 *    property later.
 *
 * A requirement whose target cannot be resolved this way (event/property/variant not found, or a
 * `variant`/`variant_property` condition matching no existing variant) is still created — with all
 * target ids null, `status: 'ignored'`, and `note` explaining what was missing — rather than
 * dropped, so nothing from the template is silently lost; a human resolves it later in the
 * requirements editor (T-1-07 acceptance: "unresolvable requirements are created with a note and
 * status ignored").
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { NotFoundError, ValidationError } from '../errors';
import { USE_CASE_TYPES, REQUIREMENT_LEVELS, REQUIREMENT_TARGET_KINDS, type UseCaseType } from '../../domain/enums';
import { createUseCase, type UseCaseRow } from './use-case.dal';
import { insertResolvedRequirement, insertUnresolvedRequirement } from './requirement.dal';
import type { VariantCondition } from '../../domain/variants';

export interface DefaultRequirementTemplate {
  target_kind: string;
  event_name?: string;
  property_name?: string;
  condition?: { property_name: string; value: string };
  level: string;
}

export interface UseCaseTemplateRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  default_requirements_json: DefaultRequirementTemplate[];
  narrative_template: string | null;
  created_at: string;
  updated_at: string;
}

type UseCaseTemplateDbRow = Omit<UseCaseTemplateRow, 'default_requirements_json'>;

function mapRow(row: UseCaseTemplateDbRow): UseCaseTemplateRow {
  const raw = row as unknown as Record<string, unknown>;
  return { ...row, default_requirements_json: parseJsonColumn(raw.default_requirements_json, []) };
}

export function listUseCaseTemplates(): UseCaseTemplateRow[] {
  return (
    getDb().prepare('SELECT * FROM use_case_templates ORDER BY code').all() as UseCaseTemplateDbRow[]
  ).map(mapRow);
}

export function getUseCaseTemplateById(id: string): UseCaseTemplateRow | null {
  const row = getDb().prepare('SELECT * FROM use_case_templates WHERE id = ?').get(id) as
    | UseCaseTemplateDbRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function getUseCaseTemplateOrThrow(id: string): UseCaseTemplateRow {
  const row = getUseCaseTemplateById(id);
  if (!row) throw new NotFoundError('Use case template not found.', 'use_case_template');
  return row;
}

export interface UseCaseTemplateInput {
  code: string;
  name: string;
  type: string;
  description?: string | null;
  default_requirements_json?: DefaultRequirementTemplate[];
  narrative_template?: string | null;
}

/**
 * Not routed yet (phase 1 ships a read-only, empty `GET /api/use-case-templates`; the plan's
 * library import format is phase 3). Exists so `instantiateUseCaseTemplate` has a real row to work
 * against in tests without reaching into the schema directly from every test file.
 */
export function createUseCaseTemplate(input: UseCaseTemplateInput): UseCaseTemplateRow {
  const code = input.code?.trim();
  if (!code) throw new ValidationError('Use case template code is required.', 'code');
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Use case template name is required.', 'name');
  if (!USE_CASE_TYPES.includes(input.type as UseCaseType)) {
    throw new ValidationError(`type must be one of ${USE_CASE_TYPES.join(', ')}.`, 'type');
  }

  const db = getDb();
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO use_case_templates (
      id, code, name, type, description, default_requirements_json, narrative_template, created_at, updated_at
    ) VALUES (@id, @code, @name, @type, @description, @default_requirements_json, @narrative_template, @created_at, @updated_at)`
  ).run({
    id,
    code,
    name,
    type: input.type,
    description: input.description?.trim() || null,
    default_requirements_json: toJsonColumn(input.default_requirements_json ?? []),
    narrative_template: input.narrative_template?.trim() || null,
    created_at: now,
    updated_at: now,
  });
  return getUseCaseTemplateOrThrow(id);
}

interface EventLookup {
  id: string;
}

function findEventByName(projectId: string, name: string): EventLookup | null {
  return (
    (getDb()
      .prepare('SELECT id FROM events WHERE project_id = ? AND name = ? AND deleted_at IS NULL')
      .get(projectId, name) as EventLookup | undefined) ?? null
  );
}

function findPropertyByName(projectId: string, name: string, scope: 'event' | 'customer'): { id: string } | null {
  return (
    (getDb()
      .prepare('SELECT id FROM properties WHERE project_id = ? AND scope = ? AND name = ? AND deleted_at IS NULL')
      .get(projectId, scope, name) as { id: string } | undefined) ?? null
  );
}

function propertyLinkedToEvent(eventId: string, propertyId: string): boolean {
  return !!getDb()
    .prepare('SELECT 1 FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId);
}

function resolveOne(
  projectId: string,
  useCaseId: string,
  sortOrder: number,
  entry: DefaultRequirementTemplate
): void {
  const level = REQUIREMENT_LEVELS.includes(entry.level as (typeof REQUIREMENT_LEVELS)[number])
    ? entry.level
    : 'O';
  const unresolved = (reason: string) =>
    insertUnresolvedRequirement(useCaseId, sortOrder, { target_kind: entry.target_kind, level, note: reason });

  if (!(REQUIREMENT_TARGET_KINDS as readonly string[]).includes(entry.target_kind)) {
    unresolved(`Template used an unknown target_kind "${entry.target_kind}".`);
    return;
  }

  if (entry.target_kind === 'customer_property') {
    if (!entry.property_name) return unresolved('Template requirement is missing property_name.');
    const property = findPropertyByName(projectId, entry.property_name, 'customer');
    if (!property) return unresolved(`No customer property named "${entry.property_name}" in this project.`);
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: 'customer_property',
      property_id: property.id,
      level,
    });
    return;
  }

  if (!entry.event_name) return unresolved('Template requirement is missing event_name.');
  const event = findEventByName(projectId, entry.event_name);
  if (!event) return unresolved(`No event named "${entry.event_name}" in this project.`);

  if (entry.target_kind === 'event') {
    insertResolvedRequirement(projectId, useCaseId, sortOrder, { target_kind: 'event', event_id: event.id, level });
    return;
  }

  if (entry.target_kind === 'event_property') {
    if (!entry.property_name) return unresolved('Template requirement is missing property_name.');
    const property = findPropertyByName(projectId, entry.property_name, 'event');
    if (!property) return unresolved(`No event property named "${entry.property_name}" in this project.`);
    if (!propertyLinkedToEvent(event.id, property.id)) {
      return unresolved(`Property "${entry.property_name}" is not linked to event "${entry.event_name}".`);
    }
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: 'event_property',
      event_id: event.id,
      property_id: property.id,
      level,
    });
    return;
  }

  // variant | variant_property
  if (!entry.condition) return unresolved('Template requirement is missing a condition to select a variant.');
  const discriminator = findPropertyByName(projectId, entry.condition.property_name, 'event');
  if (!discriminator) {
    return unresolved(`No property named "${entry.condition.property_name}" to match the variant condition.`);
  }
  const variantRows = getDb()
    .prepare('SELECT id, conditions_json FROM variants WHERE event_id = ?')
    .all(event.id) as { id: string; conditions_json: string | null }[];
  const match = variantRows.find((row) => {
    const conditions = parseJsonColumn(row.conditions_json, [] as VariantCondition[]);
    return conditions.some(
      (c) => c.property_id === discriminator.id && c.values.includes(entry.condition!.value)
    );
  });
  if (!match) {
    return unresolved(
      `No variant of "${entry.event_name}" matches ${entry.condition.property_name}=${entry.condition.value}.`
    );
  }

  if (entry.target_kind === 'variant') {
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: 'variant',
      variant_id: match.id,
      level,
    });
    return;
  }

  // variant_property
  if (!entry.property_name) return unresolved('Template requirement is missing property_name.');
  const property = findPropertyByName(projectId, entry.property_name, 'event');
  if (!property) return unresolved(`No event property named "${entry.property_name}" in this project.`);
  if (!propertyLinkedToEvent(event.id, property.id)) {
    return unresolved(`Property "${entry.property_name}" is not linked to event "${entry.event_name}".`);
  }
  insertResolvedRequirement(projectId, useCaseId, sortOrder, {
    target_kind: 'variant_property',
    variant_id: match.id,
    property_id: property.id,
    level,
  });
}

/**
 * Creates a `UseCase` in `projectId` from `templateId`: copies `name`, `type`, `description`, and
 * resolves each `default_requirements_json` entry to a `Requirement` (see module doc). Runs in one
 * transaction so a half-created use case never survives a mid-way failure.
 */
export function instantiateUseCaseTemplate(projectId: string, templateId: string): UseCaseRow {
  const template = getUseCaseTemplateOrThrow(templateId);
  const db = getDb();

  let useCase!: UseCaseRow;
  const run = db.transaction(() => {
    useCase = createUseCase(projectId, {
      template_id: template.id,
      name: template.name,
      type: template.type,
      description: template.description,
    });
    template.default_requirements_json.forEach((entry, index) => {
      resolveOne(projectId, useCase.id, index, entry);
    });
  });
  run();

  return useCase;
}
