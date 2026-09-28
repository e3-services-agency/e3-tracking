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
 *    that event whose *whole* condition set equals `{ property_id: <resolved discriminator>,
 *    operator: 'equals', values: [condition.value] }` — an exact match on `conditions_key` (fix
 *    round WARNING 3), not "any variant whose conditions happen to include this one". A template
 *    condition names exactly one discriminator; a variant with an additional second discriminator
 *    is a *different*, more specific variant and must never be silently picked over (or instead of)
 *    the one-discriminator variant the template actually named. No exact match -> unresolved, naming
 *    every same-event variant that partially matched (same discriminator, different value, or a
 *    superset of conditions) so the note is actionable. `variant_property` additionally resolves
 *    `property_name` on that variant's event, as `event_property` does. This is how the template
 *    names a variant without storing a variant id (which cannot exist yet at the
 *    template-authoring stage, since variants are per-project) — the plan's `condition` field is
 *    exactly a variant's own discriminator condition, so matching on it is name-independent and
 *    survives the client renaming the property later.
 *
 * A requirement whose target cannot be resolved this way (event/property/variant not found, or a
 * `variant`/`variant_property` condition matching no existing variant) is still created — with all
 * target ids null, `status: 'gap'` (`REQUIREMENT_STATUSES`; fix round ERROR 1 — was the literal
 * `'ignored'`, a value outside the enum), and `note` explaining what was missing — rather than
 * dropped, so nothing from the template is silently lost; a human resolves it later in the
 * requirements editor.
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { ConflictError, NotFoundError, TemplateInUseError, UseCaseCodeTakenError, ValidationError } from '../errors';
import { USE_CASE_TYPES, REQUIREMENT_LEVELS, REQUIREMENT_TARGET_KINDS, type UseCaseType } from '../../domain/enums';
import { createUseCase, type UseCaseRow } from './use-case.dal';
import { insertResolvedRequirement, insertUnresolvedRequirement } from './requirement.dal';
import { buildConditionsKey, normalizeConditions, type VariantCondition } from '../../domain/variants';

export interface DefaultRequirementTemplate {
  target_kind: string;
  event_name?: string;
  property_name?: string;
  condition?: { property_name: string; value: string };
  level: string;
  /** T-3-06 (D-47): copied verbatim onto the resolved/unresolved requirement's own `note`. */
  note?: string;
}

/** T-3-06 (D-57): the library format's five facets, all optional lists; `null`/absent tag arrays are stored as `[]`. */
export interface UseCaseTemplateTags {
  channels: string[];
  goals: string[];
  tiers: string[];
  kpis: string[];
  industries: string[];
}

export interface UseCaseTemplateFlags {
  new: boolean;
  popular: boolean;
}

export interface UseCaseTemplateRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  default_requirements_json: DefaultRequirementTemplate[];
  narrative_template: string | null;
  tags_json: UseCaseTemplateTags;
  flags_json: UseCaseTemplateFlags;
  created_at: string;
  updated_at: string;
}

type UseCaseTemplateDbRow = Omit<UseCaseTemplateRow, 'default_requirements_json' | 'tags_json' | 'flags_json'>;

const EMPTY_TAGS: UseCaseTemplateTags = { channels: [], goals: [], tiers: [], kpis: [], industries: [] };
const EMPTY_FLAGS: UseCaseTemplateFlags = { new: false, popular: false };

function mapRow(row: UseCaseTemplateDbRow): UseCaseTemplateRow {
  const raw = row as unknown as Record<string, unknown>;
  return {
    ...row,
    default_requirements_json: parseJsonColumn(raw.default_requirements_json, []),
    tags_json: parseJsonColumn(raw.tags_json, EMPTY_TAGS),
    flags_json: parseJsonColumn(raw.flags_json, EMPTY_FLAGS),
  };
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
  tags_json?: Partial<UseCaseTemplateTags> | null;
  flags_json?: Partial<UseCaseTemplateFlags> | null;
}

function normalizeTags(tags: Partial<UseCaseTemplateTags> | null | undefined): UseCaseTemplateTags {
  return {
    channels: tags?.channels ?? [],
    goals: tags?.goals ?? [],
    tiers: tags?.tiers ?? [],
    kpis: tags?.kpis ?? [],
    industries: tags?.industries ?? [],
  };
}

function normalizeFlags(flags: Partial<UseCaseTemplateFlags> | null | undefined): UseCaseTemplateFlags {
  return { new: flags?.new === true, popular: flags?.popular === true };
}

/**
 * Global (no `project_id`) library table (D-06, D-47). Used directly by tests and by
 * `useCaseLibraryImport.service.ts`'s apply step (T-3-06); not routed as a standalone create (the
 * only route-level write path is the import apply, which upserts by `code`).
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
      id, code, name, type, description, default_requirements_json, narrative_template, tags_json, flags_json, created_at, updated_at
    ) VALUES (@id, @code, @name, @type, @description, @default_requirements_json, @narrative_template, @tags_json, @flags_json, @created_at, @updated_at)`
  ).run({
    id,
    code,
    name,
    type: input.type,
    description: input.description?.trim() || null,
    default_requirements_json: toJsonColumn(input.default_requirements_json ?? []),
    narrative_template: input.narrative_template?.trim() || null,
    tags_json: toJsonColumn(normalizeTags(input.tags_json)),
    flags_json: toJsonColumn(normalizeFlags(input.flags_json)),
    created_at: now,
    updated_at: now,
  });
  return getUseCaseTemplateOrThrow(id);
}

/** T-3-06 (D-47): used by the library import's apply step to update an existing template matched by `code`. */
export function updateUseCaseTemplate(id: string, input: Partial<UseCaseTemplateInput>): UseCaseTemplateRow {
  getUseCaseTemplateOrThrow(id);
  if (input.type !== undefined && !USE_CASE_TYPES.includes(input.type as UseCaseType)) {
    throw new ValidationError(`type must be one of ${USE_CASE_TYPES.join(', ')}.`, 'type');
  }
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError('Use case template name is required.', 'name');
    patch.name = name;
  }
  if (input.type !== undefined) patch.type = input.type;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.default_requirements_json !== undefined) {
    patch.default_requirements_json = toJsonColumn(input.default_requirements_json);
  }
  if (input.narrative_template !== undefined) patch.narrative_template = input.narrative_template?.trim() || null;
  if (input.tags_json !== undefined) patch.tags_json = toJsonColumn(normalizeTags(input.tags_json));
  if (input.flags_json !== undefined) patch.flags_json = toJsonColumn(normalizeFlags(input.flags_json));

  const setClause = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(', ');
  getDb()
    .prepare(`UPDATE use_case_templates SET ${setClause} WHERE id = @id`)
    .run({ ...patch, id });
  return getUseCaseTemplateOrThrow(id);
}

/**
 * T-3-06 (D-47): refuses with `TemplateInUseError` (409 `TEMPLATE_IN_USE`) while any `UseCase`
 * still references this template (`use_cases.template_id`, no `ON DELETE` clause on that FK -- a
 * raw constraint error is never allowed to reach the caller for something this checkable).
 *
 * Fix round ERROR 1 (reviewer, 2026-09-27 23:26): the guard used to filter `deleted_at IS NULL`,
 * so soft-deleting the one referencing use case made the guard pass while the FK itself still
 * pointed at this row (soft delete never touches `template_id`), and the `DELETE` below then hit a
 * raw `SQLITE_CONSTRAINT_FOREIGNKEY` (500) instead of the intended 409. A soft-deleted use case
 * still belongs to the template (its `template_id` is still set), so it still counts here,
 * regardless of `deleted_at` -- the guard and the FK it is protecting must agree on what "still
 * references it" means.
 */
export function deleteUseCaseTemplate(id: string): void {
  getUseCaseTemplateOrThrow(id);
  const inUse = getDb().prepare('SELECT 1 FROM use_cases WHERE template_id = ? LIMIT 1').get(id);
  if (inUse) {
    throw new TemplateInUseError(
      'This template is used by one or more use cases (including deleted ones) in a project; it cannot be deleted while instantiated.'
    );
  }
  getDb().prepare('DELETE FROM use_case_templates WHERE id = ?').run(id);
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
  const note = entry.note?.trim() || null;
  const unresolved = (reason: string) =>
    insertUnresolvedRequirement(useCaseId, sortOrder, {
      target_kind: entry.target_kind,
      level,
      note: note ? `${reason} ${note}` : reason,
    });

  // D-57/T-3-10: `catalog_attribute` and `consent` are valid library target kinds (the parser
  // accepts them so a file using either validates cleanly) but this resolver does not yet know how
  // to match them against a project's catalog fields / consent categories -- that lands in T-3-10.
  // Until then every entry of either kind instantiates as a clearly-labelled gap instead of being
  // silently dropped or mis-reported as an "unknown target_kind".
  if (entry.target_kind === 'catalog_attribute' || entry.target_kind === 'consent') {
    unresolved(
      `Template used target_kind "${entry.target_kind}", not yet resolved by this project (library resolution for this kind lands in a later task).`
    );
    return;
  }

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
      note,
    });
    return;
  }

  if (!entry.event_name) return unresolved('Template requirement is missing event_name.');
  const event = findEventByName(projectId, entry.event_name);
  if (!event) return unresolved(`No event named "${entry.event_name}" in this project.`);

  if (entry.target_kind === 'event') {
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: 'event',
      event_id: event.id,
      level,
      note,
    });
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
      note,
    });
    return;
  }

  // variant | variant_property
  if (!entry.condition) return unresolved('Template requirement is missing a condition to select a variant.');
  const discriminator = findPropertyByName(projectId, entry.condition.property_name, 'event');
  if (!discriminator) {
    return unresolved(`No property named "${entry.condition.property_name}" to match the variant condition.`);
  }
  // Fix round WARNING 3: match the variant whose whole condition set equals the template's single
  // condition, via the same `normalizeConditions`/`buildConditionsKey` `variant.dal.ts` uses to
  // build `conditions_key` — not "any variant whose conditions include this one" (that over-matched
  // a two-discriminator variant for a template naming only one of them, ambiguously, whichever row
  // happened to be inserted first).
  const desiredKey = buildConditionsKey(
    normalizeConditions([{ property_id: discriminator.id, operator: 'equals', values: [entry.condition.value] }])
  );
  const variantRows = getDb()
    .prepare('SELECT id, name, conditions_json, conditions_key FROM variants WHERE event_id = ?')
    .all(event.id) as { id: string; name: string; conditions_json: string | null; conditions_key: string }[];
  const match = variantRows.find((row) => row.conditions_key === desiredKey);
  if (!match) {
    const partialMatches = variantRows.filter((row) => {
      const conditions = parseJsonColumn(row.conditions_json, [] as VariantCondition[]);
      return conditions.some((c) => c.property_id === discriminator.id);
    });
    // LOW D (second fix round): this used to print the raw `conditions_key` JSON, including
    // property_id uuids — nothing a human matching a template by hand could act on. List the
    // candidate variants by name instead, same as everywhere else in the UI.
    const suffix =
      partialMatches.length > 0
        ? ` Candidates on the same property: ${partialMatches.map((row) => row.name).join(', ')}.`
        : '';
    return unresolved(
      `No variant of "${entry.event_name}" has exactly the condition ${entry.condition.property_name}=${entry.condition.value} (and no other condition).${suffix}`
    );
  }

  if (entry.target_kind === 'variant') {
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: 'variant',
      variant_id: match.id,
      level,
      note,
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
    note,
  });
}

/**
 * Creates a `UseCase` in `projectId` from `templateId`: copies `name`, `type`, `description`, and
 * resolves each `default_requirements_json` entry to a `Requirement` (see module doc). Runs in one
 * transaction so a half-created use case never survives a mid-way failure.
 *
 * `opts.code` (T-3-06, D-47; fix round WARNING 2, 2026-09-27 23:26): when omitted, defaults to the
 * template's own `code` and, if that is already taken in this project (`ConflictError` from
 * `createUseCase`'s `UNIQUE (project_id, code)`), retries `<code>-2`, `<code>-3`, ... until one is
 * free -- this is the only path the plan's "-2/-3 suffix on conflict" wording covers. An *explicit*
 * `opts.code` is never suffixed: a caller who asked for a specific code and gets a different one
 * back has not had that code honoured, so a collision on an explicit code throws
 * `UseCaseCodeTakenError` (409 `USE_CASE_CODE_TAKEN`) instead.
 */
export function instantiateUseCaseTemplate(
  projectId: string,
  templateId: string,
  opts?: { code?: string }
): UseCaseRow {
  const template = getUseCaseTemplateOrThrow(templateId);
  const db = getDb();
  const explicitCode = opts?.code?.trim() || null;
  const desiredBase = explicitCode || template.code;

  let useCase!: UseCaseRow;
  const run = db.transaction(() => {
    if (explicitCode) {
      try {
        useCase = createUseCase(projectId, {
          template_id: template.id,
          code: explicitCode,
          name: template.name,
          type: template.type,
          description: template.description,
        });
      } catch (err) {
        if (err instanceof ConflictError) {
          throw new UseCaseCodeTakenError(`A use case with code "${explicitCode}" already exists in this project.`);
        }
        throw err;
      }
    } else {
      let attempt = 1;
      for (;;) {
        const code = attempt === 1 ? desiredBase : `${desiredBase}-${attempt}`;
        try {
          useCase = createUseCase(projectId, {
            template_id: template.id,
            code,
            name: template.name,
            type: template.type,
            description: template.description,
          });
          break;
        } catch (err) {
          if (err instanceof ConflictError && attempt < 50) {
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
    }
    template.default_requirements_json.forEach((entry, index) => {
      resolveOne(projectId, useCase.id, index, entry);
    });
  });
  run();

  return useCase;
}

/** `target_kind` -> the prerequisites card's four groups (D-57: events, customer properties, catalog, consents). */
function groupForTargetKind(kind: string): 'events' | 'customer_properties' | 'catalog' | 'consents' {
  if (kind === 'customer_property') return 'customer_properties';
  if (kind === 'catalog_attribute') return 'catalog';
  if (kind === 'consent') return 'consents';
  return 'events';
}

/**
 * Read-only version of `resolveOne`'s matching logic (no writes): would this one
 * `default_requirements_json` entry resolve against `projectId`'s current definitions right now?
 * `catalog_attribute`/`consent` are always unresolved here (T-3-10 adds their resolution); kept as
 * a single boolean, not the detailed "candidates" notes `resolveOne` builds for a human, since this
 * feeds only the prerequisites card's all/none/mixed roll-up.
 */
function dryResolves(projectId: string, entry: DefaultRequirementTemplate): boolean {
  if (entry.target_kind === 'catalog_attribute' || entry.target_kind === 'consent') return false;
  if (!(REQUIREMENT_TARGET_KINDS as readonly string[]).includes(entry.target_kind)) return false;

  if (entry.target_kind === 'customer_property') {
    return !!entry.property_name && !!findPropertyByName(projectId, entry.property_name, 'customer');
  }

  if (!entry.event_name) return false;
  const event = findEventByName(projectId, entry.event_name);
  if (!event) return false;
  if (entry.target_kind === 'event') return true;

  if (entry.target_kind === 'event_property') {
    if (!entry.property_name) return false;
    const property = findPropertyByName(projectId, entry.property_name, 'event');
    return !!property && propertyLinkedToEvent(event.id, property.id);
  }

  // variant | variant_property
  if (!entry.condition) return false;
  const discriminator = findPropertyByName(projectId, entry.condition.property_name, 'event');
  if (!discriminator) return false;
  const desiredKey = buildConditionsKey(
    normalizeConditions([{ property_id: discriminator.id, operator: 'equals', values: [entry.condition.value] }])
  );
  const matched = (
    getDb().prepare('SELECT conditions_key FROM variants WHERE event_id = ?').all(event.id) as {
      conditions_key: string;
    }[]
  ).some((row) => row.conditions_key === desiredKey);
  if (!matched) return false;
  if (entry.target_kind === 'variant') return true;

  // variant_property
  if (!entry.property_name) return false;
  const property = findPropertyByName(projectId, entry.property_name, 'event');
  return !!property && propertyLinkedToEvent(event.id, property.id);
}

export interface TemplateResolvePreviewGroup {
  group: 'events' | 'customer_properties' | 'catalog' | 'consents';
  total: number;
  resolved: number;
  /**
   * `all`: every entry in this group resolves (at least one entry). `none`: zero do, *or the
   * group has no entries at all* (`total: 0`) -- an empty group is not "all resolved", it has
   * nothing to resolve, so it renders neutral rather than green (fix round WARNING 3, 2026-09-27
   * 23:26: this used to be `all` for an empty group, painting "0 / 0 resolved" green). `mixed`:
   * some do, some don't.
   */
  status: 'all' | 'none' | 'mixed';
}

export interface TemplateResolvePreviewResult {
  groups: TemplateResolvePreviewGroup[];
  unresolved_count: number;
  total_count: number;
}

/**
 * `POST /use-cases/from-template/:id/preview` (D-55, D-57): dry-runs resolution of every
 * `default_requirements_json` entry against `projectId`'s current definitions without creating
 * anything, grouped for the templates page's prerequisites card. T-3-10 extends this same route
 * with a mapping step for unresolved standard-event targets; this version uses only the resolver
 * that exists today (exact event/property/variant-condition name matching).
 */
export function previewInstantiateUseCaseTemplate(projectId: string, templateId: string): TemplateResolvePreviewResult {
  const template = getUseCaseTemplateOrThrow(templateId);
  const counts: Record<TemplateResolvePreviewGroup['group'], { total: number; resolved: number }> = {
    events: { total: 0, resolved: 0 },
    customer_properties: { total: 0, resolved: 0 },
    catalog: { total: 0, resolved: 0 },
    consents: { total: 0, resolved: 0 },
  };
  let unresolvedCount = 0;
  for (const entry of template.default_requirements_json) {
    const group = groupForTargetKind(entry.target_kind);
    const resolved = dryResolves(projectId, entry);
    counts[group].total += 1;
    if (resolved) counts[group].resolved += 1;
    else unresolvedCount += 1;
  }
  const groups = (Object.keys(counts) as TemplateResolvePreviewGroup['group'][]).map((group) => {
    const { total, resolved } = counts[group];
    const status: TemplateResolvePreviewGroup['status'] =
      total === 0 ? 'none' : resolved === total ? 'all' : resolved === 0 ? 'none' : 'mixed';
    return { group, total, resolved, status };
  });
  return { groups, unresolved_count: unresolvedCount, total_count: template.default_requirements_json.length };
}
