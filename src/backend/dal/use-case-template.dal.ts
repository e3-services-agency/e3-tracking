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
 *
 * T-3-10 (D-55) rewrites the event-scoped resolution order: a template entry now names a
 * `standard_event` (the Bloomreach catalog key) instead of only `event_name`. Resolution tries, in
 * order:
 *  (1) the project's own `StandardEventMapping` for that `standard_event` -- gives the client event
 *      directly, and (for `variant`/`variant_property`) the mapped variant when the mapping has one;
 *      `property_name`/`field_name` (a *standard* field name) is then translated through the
 *      mapping's `field_map_json` to the client's actual (possibly renamed) property.
 *  (2) failing that (no mapping row, or the mapping has no variant for a `variant`/`variant_property`
 *      entry), exact name match: `event_name ?? standard_event` against the project's events, then
 *      -- for a variant kind -- the legacy `condition` match (below) on that event, and -- for a
 *      property -- an exact property name match on that event.
 *  (3) still nothing -> unresolved, with a reason a human (or the templates page's mapping dialog,
 *      `POST .../from-template/:id/preview`) can act on.
 * `event_name` is optional once `standard_event` is given (a template may still supply both, or
 * only `event_name` for a custom event outside the Bloomreach catalog, e.g. the sample library's
 * `wishlist_add`).
 *
 * D-57 adds two more target kinds, resolved independently of the above: `catalog_attribute`
 * (`field_name` against the project's main catalog's fields by name) and `consent` (`property_name`
 * against a consent category's `standard_key`, falling back to its `name`).
 */
import { getDb } from '../db';
import { newId, nowIso, parseJsonColumn, toJsonColumn } from '../db/util';
import { ConflictError, NotFoundError, TemplateInUseError, UseCaseCodeTakenError, ValidationError } from '../errors';
import { USE_CASE_TYPES, REQUIREMENT_LEVELS, REQUIREMENT_TARGET_KINDS, type UseCaseType } from '../../domain/enums';
import { createUseCase, type UseCaseRow } from './use-case.dal';
import {
  insertResolvedRequirement,
  insertUnresolvedRequirement,
  type RequirementInput,
} from './requirement.dal';
import { buildConditionsKey, normalizeConditions, type VariantCondition } from '../../domain/variants';
import { listEvents } from './event.dal';
import { getEventWithProperties } from './event.dal';
import { listVariantsByProject } from './variant.dal';
import {
  getStandardEventMappingByKey,
  upsertStandardEventMapping,
  type StandardEventMappingRow,
} from './standard-event-mapping.dal';
import { findMainCatalogFieldByName } from './catalog.dal';
import { findConsentCategoryByStandardKeyOrName } from './consent-category.dal';

export interface DefaultRequirementTemplate {
  target_kind: string;
  /** T-3-10 (D-55): Bloomreach standard event catalog key (e.g. `add_to_cart`); resolved first
   * through the project's own standard event mapping. */
  standard_event?: string;
  /** Optional once `standard_event` is set (D-55); required alone for a custom event. */
  event_name?: string;
  property_name?: string;
  /** T-3-10 (D-57): main catalog field name for `target_kind: 'catalog_attribute'`. */
  field_name?: string;
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
 * T-3-06 (D-47), amended T-3-10 (2026-09-28): refuses with `TemplateInUseError` (409
 * `TEMPLATE_IN_USE`) while any *live* (non-deleted) `UseCase` still references this template.
 *
 * The amendment changes what "still references it" means: the original guard (fix round ERROR 1,
 * 2026-09-27 23:26) counted soft-deleted use cases too, since soft delete never touched
 * `template_id` and the FK would otherwise raise a raw 500 on delete. T-3-10 instead nulls
 * `template_id` on every soft-deleted use case referencing this template, in the same transaction
 * as the delete itself (a restore already produces a null `template_id`, so this is the same,
 * already-legitimate state) -- so only *live* references block the delete, and the FK never fires.
 * The 409 body carries `count` and `project_names` (via `errors.ts`'s `TemplateInUseError`) so the
 * caller can say why without a second request.
 */
export function deleteUseCaseTemplate(id: string): void {
  getUseCaseTemplateOrThrow(id);
  const db = getDb();
  const run = db.transaction(() => {
    const liveRefs = db
      .prepare(
        `SELECT p.name as project_name FROM use_cases uc
         JOIN projects p ON p.id = uc.project_id
         WHERE uc.template_id = ? AND uc.deleted_at IS NULL`
      )
      .all(id) as { project_name: string }[];
    if (liveRefs.length > 0) {
      const names = liveRefs.map((r) => r.project_name);
      throw new TemplateInUseError(
        `This template is used by ${liveRefs.length} use case${liveRefs.length === 1 ? '' : 's'} (${names.join(', ')}); it cannot be deleted while instantiated.`,
        liveRefs.length,
        names
      );
    }
    db.prepare('UPDATE use_cases SET template_id = NULL WHERE template_id = ?').run(id);
    db.prepare('DELETE FROM use_case_templates WHERE id = ?').run(id);
  });
  run();
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

/**
 * `resolveEntry`'s result: either a fully-resolved target (ready for `insertResolvedRequirement`),
 * or a reason it could not be. A real discriminated union on `resolved` -- fix round INFO 7
 * (reviewer, 2026-09-28 03:15): the truthiness form (`if (outcome.resolved)`) does not narrow under
 * this project's non-`strict` `tsconfig.json` (confirmed by a standalone repro), but an explicit
 * `=== true`/`=== false` comparison does narrow correctly even without `strict` (same repro), so
 * every read below uses that form instead of the single-interface-plus-`!` workaround the first
 * round used.
 */
type ResolvedTarget = Pick<
  RequirementInput,
  'property_id' | 'event_id' | 'variant_id' | 'catalog_field_id' | 'consent_category_id'
>;
type ResolveOutcome = { resolved: true; target: ResolvedTarget } | { resolved: false; reason: string };

function resolvedOutcome(target: ResolvedTarget): ResolveOutcome {
  return { resolved: true, target };
}

function unresolvedOutcome(reason: string): ResolveOutcome {
  return { resolved: false, reason };
}

/**
 * T-3-10 (D-55, D-57): resolves one `default_requirements_json` entry against `projectId`'s current
 * definitions -- the single engine both the writer (`resolveOne`, via `insertResolvedRequirement`/
 * `insertUnresolvedRequirement`) and the read-only preview (`previewInstantiateUseCaseTemplate`,
 * `POST .../from-template/:id/preview`) use, so the two can never disagree about what would resolve.
 * See the module doc for the full resolution order.
 */
function resolveEntry(projectId: string, entry: DefaultRequirementTemplate): ResolveOutcome {
  if (!(REQUIREMENT_TARGET_KINDS as readonly string[]).includes(entry.target_kind)) {
    return unresolvedOutcome(`Template used an unknown target_kind "${entry.target_kind}".`);
  }

  if (entry.target_kind === 'catalog_attribute') {
    if (!entry.field_name) return unresolvedOutcome('Template requirement is missing field_name.');
    const field = findMainCatalogFieldByName(projectId, entry.field_name);
    if (!field) {
      return unresolvedOutcome(
        `No field named "${entry.field_name}" on this project's main catalog (or the project has no main catalog).`
      );
    }
    return resolvedOutcome({ catalog_field_id: field.id });
  }

  if (entry.target_kind === 'consent') {
    if (!entry.property_name) return unresolvedOutcome('Template requirement is missing property_name.');
    const consent = findConsentCategoryByStandardKeyOrName(projectId, entry.property_name);
    if (!consent) {
      return unresolvedOutcome(`No consent category matching "${entry.property_name}" (standard key or name) in this project.`);
    }
    return resolvedOutcome({ consent_category_id: consent.id });
  }

  if (entry.target_kind === 'customer_property') {
    if (!entry.property_name) return unresolvedOutcome('Template requirement is missing property_name.');
    const property = findPropertyByName(projectId, entry.property_name, 'customer');
    if (!property) return unresolvedOutcome(`No customer property named "${entry.property_name}" in this project.`);
    return resolvedOutcome({ property_id: property.id });
  }

  // Event-scoped kinds: event, event_property, variant, variant_property.
  const needsVariant = entry.target_kind === 'variant' || entry.target_kind === 'variant_property';
  const needsProperty = entry.target_kind === 'event_property' || entry.target_kind === 'variant_property';
  const displayName = entry.event_name ?? entry.standard_event ?? '';

  let eventId: string | null = null;
  let variantId: string | null = null;
  let mapping: StandardEventMappingRow | null = null;

  // D-55 resolution order, step 1: the project's own standard event mapping for this standard_event.
  if (entry.standard_event) {
    mapping = getStandardEventMappingByKey(projectId, entry.standard_event.trim());
    if (mapping) {
      eventId = mapping.event_id;
      if (needsVariant && mapping.variant_id) variantId = mapping.variant_id;
    }
  }

  // Step 2: exact name match (event_name, else standard_event) against the project's events.
  if (!eventId) {
    const name = entry.event_name || entry.standard_event;
    if (!name) return unresolvedOutcome('Template requirement is missing event_name.');
    const event = findEventByName(projectId, name);
    if (!event) return unresolvedOutcome(`No event named "${name}" in this project.`);
    eventId = event.id;
  }

  if (needsVariant && !variantId) {
    // Legacy fallback: match the variant whose whole condition set equals the template's single
    // `condition`, via the same `normalizeConditions`/`buildConditionsKey` `variant.dal.ts` uses to
    // build `conditions_key` (fix round WARNING 3) -- not "any variant whose conditions include
    // this one" (that over-matched a two-discriminator variant for a template naming only one).
    if (!entry.condition) {
      return unresolvedOutcome(
        `No standard event mapping resolves a variant for "${displayName}", and no condition was given to match one directly.`
      );
    }
    const discriminator = findPropertyByName(projectId, entry.condition.property_name, 'event');
    if (!discriminator) {
      return unresolvedOutcome(`No property named "${entry.condition.property_name}" to match the variant condition.`);
    }
    const desiredKey = buildConditionsKey(
      normalizeConditions([{ property_id: discriminator.id, operator: 'equals', values: [entry.condition.value] }])
    );
    const variantRows = getDb()
      .prepare('SELECT id, name, conditions_json, conditions_key FROM variants WHERE event_id = ?')
      .all(eventId) as { id: string; name: string; conditions_json: string | null; conditions_key: string }[];
    const match = variantRows.find((row) => row.conditions_key === desiredKey);
    if (!match) {
      const partialMatches = variantRows.filter((row) => {
        const conditions = parseJsonColumn(row.conditions_json, [] as VariantCondition[]);
        return conditions.some((c) => c.property_id === discriminator.id);
      });
      // LOW D (second fix round, T-3-06): candidate variants by name, never the raw conditions_key.
      const suffix =
        partialMatches.length > 0
          ? ` Candidates on the same property: ${partialMatches.map((row) => row.name).join(', ')}.`
          : '';
      return unresolvedOutcome(
        `No variant of "${displayName}" has exactly the condition ${entry.condition.property_name}=${entry.condition.value} (and no other condition).${suffix}`
      );
    }
    variantId = match.id;
  }

  let propertyId: string | null = null;
  if (needsProperty) {
    if (!entry.property_name) return unresolvedOutcome('Template requirement is missing property_name.');
    // D-55 field_map translation: a standard field name resolved through the mapping's own
    // `field_map_json` takes priority (this is what lets a client rename `total_price` to `price`
    // on `purchase_item` and still have the template's standard property name resolve correctly).
    // Fix round ERROR 1 (reviewer, 2026-09-28 03:15): a field_map hit is only actually resolved
    // when that property is *still* linked to the event -- detaching a property never clears the
    // mapping's own `field_map_json` (a pre-existing gap in `detachPropertyFromEvent`/
    // `standard-event-mapping.dal.ts`), so a stale field_map entry used to be accepted here without
    // re-checking the link, and `insertResolvedRequirement`'s own `assertPropertyLinkedToEvent`
    // then rejected it with a raw 400 that rolled back the *whole* instantiate transaction instead
    // of this one row becoming a gap -- preview and the writer disagreed exactly the way this
    // function's own doc says they never should. A stale hit now falls through to the exact-name
    // lookup below (still on the correct event) instead of resolving.
    const mapped = mapping?.field_map_json?.[entry.property_name];
    if (mapped && propertyLinkedToEvent(eventId, mapped)) {
      propertyId = mapped;
    } else {
      const property = findPropertyByName(projectId, entry.property_name, 'event');
      if (property && propertyLinkedToEvent(eventId, property.id)) propertyId = property.id;
    }
    if (!propertyId) {
      const staleNote =
        mapped && !propertyLinkedToEvent(eventId, mapped)
          ? ` The mapped property is no longer linked to event "${displayName}" (field_map is stale).`
          : '';
      return unresolvedOutcome(
        `No property named "${entry.property_name}" is mapped (field_map) or linked to event "${displayName}".${staleNote}`
      );
    }
  }

  if (entry.target_kind === 'event') return resolvedOutcome({ event_id: eventId });
  if (entry.target_kind === 'event_property') return resolvedOutcome({ event_id: eventId, property_id: propertyId });
  if (entry.target_kind === 'variant') return resolvedOutcome({ variant_id: variantId });
  // variant_property
  return resolvedOutcome({ variant_id: variantId, property_id: propertyId });
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
  const outcome = resolveEntry(projectId, entry);
  if (outcome.resolved === true) {
    insertResolvedRequirement(projectId, useCaseId, sortOrder, {
      target_kind: entry.target_kind,
      level,
      note,
      ...outcome.target,
    });
    return;
  }
  const reason = outcome.reason;
  // T-3-02 merge (agent-setup wired `recordChange` into `insertUnresolvedRequirement`, adding a
  // leading `projectId` parameter): pass it through like every other call site in this file.
  insertUnresolvedRequirement(projectId, useCaseId, sortOrder, {
    target_kind: entry.target_kind,
    level,
    note: note ? `${reason} ${note}` : reason,
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
/** Same normalisation `use-case.dal.ts`'s private `normalizeCode` applies before storing (trim + upper-case), so the 409 message below echoes the code that was actually taken, not whatever casing the caller sent. */
function normalizeCodeForMessage(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * T-3-10 (D-55): one row of the instantiate route's `mappings` body -- the mapping-step dialog's
 * answer for one unresolved template entry (identified by its `index` in
 * `default_requirements_json`). Applied as a `StandardEventMapping` upsert *before* the
 * requirements are resolved, so the entry (and any other entry sharing the same `standard_event`)
 * picks it up through the normal resolution order's step 1. Silently ignored for an index whose
 * entry carries no `standard_event` (nothing to map) -- this mechanism only ever creates/updates
 * standard event mappings.
 */
export interface TemplateMappingInput {
  index: number;
  event_id: string;
  variant_id?: string | null;
  property_id?: string | null;
}

function applyTemplateMappings(
  projectId: string,
  template: UseCaseTemplateRow,
  mappings: TemplateMappingInput[]
): void {
  for (const m of mappings) {
    const entry = template.default_requirements_json[m.index];
    if (!entry || !entry.standard_event) continue;
    const standardEvent = entry.standard_event.trim();
    const existing = getStandardEventMappingByKey(projectId, standardEvent);
    // Fix round LOW 5 (reviewer, 2026-09-28 03:15): only carry the existing mapping's variant and
    // field_map forward when the dialog row picked the *same* event that mapping already targets.
    // A different event's variant ids and field_map property ids belong to that other event, not
    // this one -- carrying them forward either 400s out of `upsertStandardEventMapping` (a variant
    // of the wrong event) or silently mixes two events' properties into one field_map. Picking a
    // new event always starts a fresh mapping for it instead.
    const carryForward = existing !== null && existing.event_id === m.event_id;
    // Pre-QA fix (WARNING 1 defense in depth, reviewer 2026-09-28 03:45): the root cause is fixed
    // in detachPropertyFromEvent/deleteProperty (they now clear a property out of every
    // field_map_json entry that named it, so a fresh stale entry can no longer be created), but
    // carrying an *already*-stale entry forward verbatim (e.g. from data written before this fix,
    // or by any other future write path) still 400ed the whole apply out of
    // `upsertStandardEventMapping`'s own `validateFieldMap`, for a field this apply never touches.
    // Filter every carried-forward entry through the same `propertyLinkedToEvent` check the
    // resolver itself uses, dropping (nulling) anything that no longer holds up.
    const fieldMap: Record<string, string | null> = carryForward
      ? Object.fromEntries(
          Object.entries(existing!.field_map_json).map(([field, mappedPropertyId]) => [
            field,
            mappedPropertyId && propertyLinkedToEvent(m.event_id, mappedPropertyId) ? mappedPropertyId : null,
          ])
        )
      : {};
    if (entry.property_name) fieldMap[entry.property_name] = m.property_id ?? null;
    upsertStandardEventMapping(projectId, standardEvent, {
      event_id: m.event_id,
      variant_id: m.variant_id ?? (carryForward ? existing!.variant_id : null),
      field_map_json: fieldMap,
    });
  }
}

export function instantiateUseCaseTemplate(
  projectId: string,
  templateId: string,
  opts?: { code?: string; mappings?: TemplateMappingInput[] }
): UseCaseRow {
  const template = getUseCaseTemplateOrThrow(templateId);
  const db = getDb();
  const explicitCode = opts?.code?.trim() || null;
  const desiredBase = explicitCode || template.code;

  let useCase!: UseCaseRow;
  const run = db.transaction(() => {
    // D-55: apply the mapping-step answers first, so standard event mapping resolution (step 1 of
    // `resolveEntry`) picks them up for every entry below, not just the ones the caller named.
    if (opts?.mappings?.length) applyTemplateMappings(projectId, template, opts.mappings);

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
          throw new UseCaseCodeTakenError(
            `A use case with code "${normalizeCodeForMessage(explicitCode)}" already exists in this project.`
          );
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

/** T-3-10 (D-55): one project event with its variants and event properties, for the mapping-step dialog's pickers. */
export interface TemplateEventCandidate {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
  properties: { id: string; name: string }[];
}

export interface TemplateResolvedPreviewItem {
  index: number;
  target_kind: string;
}

export interface TemplateUnresolvedPreviewItem {
  index: number;
  target_kind: string;
  standard_event?: string;
  property_name?: string;
  /** Non-empty only for the four event-scoped kinds (event/event_property/variant/variant_property); the mapping step has nothing to offer a `customer_property`/`catalog_attribute`/`consent` gap. */
  candidates: TemplateEventCandidate[];
}

export interface TemplateResolvePreviewResult {
  /** D-55: every entry that already resolves against `projectId`'s current definitions. */
  resolved: TemplateResolvedPreviewItem[];
  /** D-55: every entry that does not, with candidates for the mapping-step dialog's pickers. */
  unresolved: TemplateUnresolvedPreviewItem[];
  /** T-3-06 prerequisites card (kept additive alongside `resolved`/`unresolved` above). */
  groups: TemplateResolvePreviewGroup[];
  unresolved_count: number;
  total_count: number;
}

const EVENT_SCOPED_CANDIDATE_KINDS = new Set(['event', 'event_property', 'variant', 'variant_property']);

/** Every project event with its variants and event properties (D-55 mapping-step candidates), built at most once per preview call. */
function buildEventCandidates(projectId: string): TemplateEventCandidate[] {
  const variantsByEvent = new Map<string, { id: string; name: string }[]>();
  for (const v of listVariantsByProject(projectId)) {
    const arr = variantsByEvent.get(v.event_id) ?? [];
    arr.push({ id: v.id, name: v.name });
    variantsByEvent.set(v.event_id, arr);
  }
  return listEvents(projectId).map((e) => ({
    id: e.id,
    name: e.name,
    variants: variantsByEvent.get(e.id) ?? [],
    properties: getEventWithProperties(projectId, e.id).properties.map((p) => ({
      id: p.property_id,
      name: p.property.name,
    })),
  }));
}

/**
 * `POST /use-cases/from-template/:id/preview` (D-55, D-57): dry-runs `resolveEntry` for every
 * `default_requirements_json` entry against `projectId`'s current definitions without creating
 * anything. Returns both the D-55 mapping-step shape (`resolved`/`unresolved`, the latter with
 * candidates for the dialog's pickers) and the T-3-06 prerequisites-card shape (`groups`), kept
 * side by side so neither consumer's response shape had to change.
 */
export function previewInstantiateUseCaseTemplate(projectId: string, templateId: string): TemplateResolvePreviewResult {
  const template = getUseCaseTemplateOrThrow(templateId);
  const counts: Record<TemplateResolvePreviewGroup['group'], { total: number; resolved: number }> = {
    events: { total: 0, resolved: 0 },
    customer_properties: { total: 0, resolved: 0 },
    catalog: { total: 0, resolved: 0 },
    consents: { total: 0, resolved: 0 },
  };
  const resolvedItems: TemplateResolvedPreviewItem[] = [];
  const unresolvedItems: TemplateUnresolvedPreviewItem[] = [];
  let candidatesCache: TemplateEventCandidate[] | null = null;
  const getCandidates = (): TemplateEventCandidate[] => (candidatesCache ??= buildEventCandidates(projectId));

  template.default_requirements_json.forEach((entry, index) => {
    const group = groupForTargetKind(entry.target_kind);
    const outcome = resolveEntry(projectId, entry);
    counts[group].total += 1;
    if (outcome.resolved === true) {
      counts[group].resolved += 1;
      resolvedItems.push({ index, target_kind: entry.target_kind });
    } else {
      unresolvedItems.push({
        index,
        target_kind: entry.target_kind,
        standard_event: entry.standard_event,
        property_name: entry.property_name,
        candidates: EVENT_SCOPED_CANDIDATE_KINDS.has(entry.target_kind) ? getCandidates() : [],
      });
    }
  });

  const groups = (Object.keys(counts) as TemplateResolvePreviewGroup['group'][]).map((group) => {
    const { total, resolved } = counts[group];
    const status: TemplateResolvePreviewGroup['status'] =
      total === 0 ? 'none' : resolved === total ? 'all' : resolved === 0 ? 'none' : 'mixed';
    return { group, total, resolved, status };
  });
  return {
    resolved: resolvedItems,
    unresolved: unresolvedItems,
    groups,
    unresolved_count: unresolvedItems.length,
    total_count: template.default_requirements_json.length,
  };
}
