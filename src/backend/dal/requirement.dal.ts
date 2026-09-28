/**
 * Requirement Data Access Layer (plan "Target data model" section Requirement; T-1-07 acceptance:
 * "`PUT /use-cases/:id/requirements` replaces the ordered list; each row has `target_kind` and the
 * matching picker ... invalid target combinations return 400 `REQUIREMENT_TARGET_INVALID`").
 *
 * A requirement's `target_kind` determines which of `property_id`/`event_id`/`variant_id` must be
 * set and which must be null (`validateTarget` below); every non-null id must additionally belong
 * to this project (and, for the two `..._property` kinds, the property must actually be linked to
 * the target's event) or the write is rejected with `RequirementTargetInvalidError`.
 *
 * `replaceRequirements` mirrors `event.dal.ts`'s `replaceEventProperties`: the whole ordered list
 * is replaced in one `db.transaction` (delete then re-insert), so a partial write can never leave
 * a use case with a stale ordering.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError } from '../db/util';
import {
  NotFoundError,
  RequirementDuplicateTargetError,
  RequirementTargetInvalidError,
  ValidationError,
} from '../errors';
import { REQUIREMENT_TARGET_KINDS, REQUIREMENT_LEVELS, REQUIREMENT_STATUSES } from '../../domain/enums';
import { getUseCaseOrThrow } from './use-case.dal';
import * as ChangeLogDAL from './change-log.dal';

/**
 * A short, human-readable label for a requirement's target, for the `change_log` row (T-3-02).
 * Deliberately a plain SQL lookup rather than `requirements-matrix.service.ts`'s
 * `buildTargetLabelResolver` — that module imports this one (for `listRequirementsByProject`), so
 * importing it back here would be circular; a raw id/`(removed)` fallback is fine for a history
 * entry, which always carries the full `diff_json` alongside the label anyway.
 */
function labelForTarget(
  targetKind: string,
  propertyId: string | null,
  eventId: string | null,
  variantId: string | null,
  catalogFieldId: string | null,
  consentCategoryId: string | null
): string {
  const db = getDb();
  const name = (table: string, id: string | null): string => {
    if (!id) return '(removed)';
    const row = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id) as { name: string } | undefined;
    return row?.name ?? id;
  };
  switch (targetKind) {
    case 'customer_property':
      return name('properties', propertyId);
    case 'event':
      return name('events', eventId);
    case 'variant':
      return name('variants', variantId);
    case 'event_property':
      return `${name('events', eventId)}.${name('properties', propertyId)}`;
    case 'variant_property':
      return `${name('variants', variantId)}.${name('properties', propertyId)}`;
    // T-3-10 (D-57): the two new target kinds merged from agent-setup's T-3-02 pass -- without
    // these cases every catalog_attribute/consent row was labelled by the literal target_kind.
    case 'catalog_attribute':
      return name('catalog_fields', catalogFieldId);
    case 'consent':
      return name('consent_categories', consentCategoryId);
    default:
      return targetKind;
  }
}

export interface RequirementRow {
  id: string;
  use_case_id: string;
  sort_order: number;
  target_kind: string;
  property_id: string | null;
  event_id: string | null;
  variant_id: string | null;
  /** T-3-10 (D-57): `target_kind = 'catalog_attribute'`'s target -- a field of the project's main catalog. */
  catalog_field_id: string | null;
  /** T-3-10 (D-57): `target_kind = 'consent'`'s target. */
  consent_category_id: string | null;
  level: string;
  status: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequirementInput {
  target_kind: string;
  property_id?: string | null;
  event_id?: string | null;
  variant_id?: string | null;
  catalog_field_id?: string | null;
  consent_category_id?: string | null;
  level: string;
  status?: string | null;
  note?: string | null;
  sort_order?: number;
}

export function listRequirements(projectId: string, useCaseId: string): RequirementRow[] {
  getUseCaseOrThrow(projectId, useCaseId);
  return getDb()
    .prepare('SELECT * FROM requirements WHERE use_case_id = ? ORDER BY sort_order, created_at')
    .all(useCaseId) as RequirementRow[];
}

/**
 * Finds a requirement anywhere in the project without knowing its `use_case_id` up front (T-4-02,
 * `comments.service.ts`: a comment only stores `entity_id`). Returns the owning `use_case_id`
 * alongside the row so the caller can label an orphaned-comment's context without a second query.
 */
export function getRequirementInProject(
  projectId: string,
  id: string
): (RequirementRow & { use_case_code: string | null; use_case_name: string }) | null {
  const row = getDb()
    .prepare(
      `SELECT r.*, uc.code as use_case_code, uc.name as use_case_name
       FROM requirements r
       JOIN use_cases uc ON uc.id = r.use_case_id
       WHERE r.id = ? AND uc.project_id = ?`
    )
    .get(id, projectId) as
    | (RequirementRow & { use_case_code: string | null; use_case_name: string })
    | undefined;
  return row ?? null;
}

/** Every requirement in the project that targets this event directly, or via a variant of it (used by the requirements matrix and the docs export). */
export function listRequirementsByEvent(projectId: string, eventId: string): RequirementRow[] {
  return getDb()
    .prepare(
      `SELECT r.* FROM requirements r
       JOIN use_cases uc ON uc.id = r.use_case_id
       LEFT JOIN variants v ON v.id = r.variant_id
       WHERE uc.project_id = ? AND uc.deleted_at IS NULL AND (r.event_id = ? OR v.event_id = ?)`
    )
    .all(projectId, eventId, eventId) as RequirementRow[];
}

/** Every requirement of every non-deleted use case in the project (used by the requirements matrix and docs export). */
export function listRequirementsByProject(projectId: string): RequirementRow[] {
  return getDb()
    .prepare(
      `SELECT r.* FROM requirements r
       JOIN use_cases uc ON uc.id = r.use_case_id
       WHERE uc.project_id = ? AND uc.deleted_at IS NULL
       ORDER BY r.use_case_id, r.sort_order, r.created_at`
    )
    .all(projectId) as RequirementRow[];
}

function assertPropertyInProject(projectId: string, propertyId: string, scope?: 'event' | 'customer'): void {
  const row = scope
    ? getDb()
        .prepare('SELECT id FROM properties WHERE id = ? AND project_id = ? AND scope = ? AND deleted_at IS NULL')
        .get(propertyId, projectId, scope)
    : getDb()
        .prepare('SELECT id FROM properties WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
        .get(propertyId, projectId);
  if (!row) {
    throw new RequirementTargetInvalidError(
      scope
        ? `property_id does not belong to this project as a "${scope}" property.`
        : 'property_id does not belong to this project.',
      'property_id'
    );
  }
}

function assertEventInProject(projectId: string, eventId: string): string {
  const row = getDb()
    .prepare('SELECT id FROM events WHERE id = ? AND project_id = ? AND deleted_at IS NULL')
    .get(eventId, projectId) as { id: string } | undefined;
  if (!row) throw new RequirementTargetInvalidError('event_id does not belong to this project.', 'event_id');
  return row.id;
}

/** Returns the variant's `event_id`. */
function assertVariantInProject(projectId: string, variantId: string): string {
  const row = getDb()
    .prepare('SELECT event_id FROM variants WHERE id = ? AND project_id = ?')
    .get(variantId, projectId) as { event_id: string } | undefined;
  if (!row) throw new RequirementTargetInvalidError('variant_id does not belong to this project.', 'variant_id');
  return row.event_id;
}

function assertPropertyLinkedToEvent(eventId: string, propertyId: string): void {
  const row = getDb()
    .prepare('SELECT 1 FROM event_properties WHERE event_id = ? AND property_id = ?')
    .get(eventId, propertyId);
  if (!row) {
    throw new RequirementTargetInvalidError(
      'property_id is not linked to the target event.',
      'property_id'
    );
  }
}

/** T-3-10 (D-57): `catalog_field_id` must belong to a catalog of this project. */
function assertCatalogFieldInProject(projectId: string, catalogFieldId: string): void {
  const row = getDb()
    .prepare(
      `SELECT cf.id FROM catalog_fields cf
       JOIN catalogs c ON c.id = cf.catalog_id
       WHERE cf.id = ? AND c.project_id = ? AND c.deleted_at IS NULL`
    )
    .get(catalogFieldId, projectId);
  if (!row) {
    throw new RequirementTargetInvalidError('catalog_field_id does not belong to this project.', 'catalog_field_id');
  }
}

/** T-3-10 (D-57): `consent_category_id` must belong to this project. */
function assertConsentCategoryInProject(projectId: string, consentCategoryId: string): void {
  const row = getDb()
    .prepare('SELECT id FROM consent_categories WHERE id = ? AND project_id = ?')
    .get(consentCategoryId, projectId);
  if (!row) {
    throw new RequirementTargetInvalidError(
      'consent_category_id does not belong to this project.',
      'consent_category_id'
    );
  }
}

type TargetIdKey = 'property_id' | 'event_id' | 'variant_id' | 'catalog_field_id' | 'consent_category_id';

/**
 * Which target id columns each `target_kind` requires vs. forbids (the two `..._property` kinds
 * additionally need the linked-to-event check, handled separately below). `catalog_attribute` and
 * `consent` (T-3-10, D-57) each forbid every other kind's column, and vice versa.
 */
export const TARGET_SHAPES: Record<string, { required: TargetIdKey[]; forbidden: TargetIdKey[] }> = {
  customer_property: {
    required: ['property_id'],
    forbidden: ['event_id', 'variant_id', 'catalog_field_id', 'consent_category_id'],
  },
  event: {
    required: ['event_id'],
    forbidden: ['property_id', 'variant_id', 'catalog_field_id', 'consent_category_id'],
  },
  variant: {
    required: ['variant_id'],
    forbidden: ['property_id', 'event_id', 'catalog_field_id', 'consent_category_id'],
  },
  event_property: { required: ['event_id', 'property_id'], forbidden: ['variant_id', 'catalog_field_id', 'consent_category_id'] },
  variant_property: { required: ['variant_id', 'property_id'], forbidden: ['event_id', 'catalog_field_id', 'consent_category_id'] },
  catalog_attribute: {
    required: ['catalog_field_id'],
    forbidden: ['property_id', 'event_id', 'variant_id', 'consent_category_id'],
  },
  consent: {
    required: ['consent_category_id'],
    forbidden: ['property_id', 'event_id', 'variant_id', 'catalog_field_id'],
  },
};

/**
 * Validates `target_kind` and that exactly the ids that kind requires are set (others must be
 * null/undefined), that every set id belongs to this project, and — for the two `..._property`
 * kinds — that the property is actually linked to the target's event. Throws
 * `RequirementTargetInvalidError` (400 `REQUIREMENT_TARGET_INVALID`) on any mismatch.
 *
 * Exception (T-1-07 fix round ERROR 2): a row whose `status` is `gap` may leave its *required* ids
 * null — this is exactly the shape `markRequirementsGap*` below produces when the row's target
 * (event/variant/property) has been deleted or detached out from under it, and the use case must
 * stay saveable afterwards without the human first hunting down every affected row. Forbidden ids
 * are still rejected even on a `gap` row (that shape is never produced by this module), and any id
 * that *is* present — gap or not — is still checked for project membership / event linkage.
 */
function validateTarget(
  projectId: string,
  input: Pick<
    RequirementInput,
    'target_kind' | 'property_id' | 'event_id' | 'variant_id' | 'catalog_field_id' | 'consent_category_id' | 'status'
  >
): {
  property_id: string | null;
  event_id: string | null;
  variant_id: string | null;
  catalog_field_id: string | null;
  consent_category_id: string | null;
} {
  const { target_kind } = input;
  if (!(REQUIREMENT_TARGET_KINDS as readonly string[]).includes(target_kind)) {
    throw new ValidationError(
      `target_kind must be one of ${REQUIREMENT_TARGET_KINDS.join(', ')}.`,
      'target_kind'
    );
  }
  const shape = TARGET_SHAPES[target_kind];
  // LOW C (second fix round): the picker sends "" for "no selection" rather than omitting the key
  // or sending null; before this normalisation an empty string slipped past `!ids[key]` (both the
  // forbidden and required checks below, and the isGap-required-missing check further down) and
  // reached the INSERT as a literal '' id, which SQLite happily stored but the FK constraint on a
  // *present but wrong* value then rejected with a raw 500 rather than a 400. Treat "" exactly like
  // an absent id everywhere in this function.
  const ids = {
    property_id: input.property_id || null,
    event_id: input.event_id || null,
    variant_id: input.variant_id || null,
    catalog_field_id: input.catalog_field_id || null,
    consent_category_id: input.consent_category_id || null,
  };
  const isGap = input.status === 'gap';

  for (const key of shape.forbidden) {
    if (ids[key]) {
      throw new RequirementTargetInvalidError(
        `target_kind "${target_kind}" must not set ${key}.`,
        'target_kind'
      );
    }
  }
  for (const key of shape.required) {
    if (!ids[key] && !isGap) {
      throw new RequirementTargetInvalidError(
        `target_kind "${target_kind}" requires ${shape.required.join(' and ')}.`,
        'target_kind'
      );
    }
  }

  let eventIdForLink: string | null = ids.event_id;
  if (ids.variant_id) {
    eventIdForLink = assertVariantInProject(projectId, ids.variant_id);
  } else if (ids.event_id) {
    assertEventInProject(projectId, ids.event_id);
  }
  if (ids.property_id) {
    const scope = target_kind === 'customer_property' ? 'customer' : 'event';
    assertPropertyInProject(projectId, ids.property_id, scope);
    if ((target_kind === 'event_property' || target_kind === 'variant_property') && eventIdForLink) {
      assertPropertyLinkedToEvent(eventIdForLink, ids.property_id);
    }
  }
  if (ids.catalog_field_id) assertCatalogFieldInProject(projectId, ids.catalog_field_id);
  if (ids.consent_category_id) assertConsentCategoryInProject(projectId, ids.consent_category_id);

  return ids;
}

function validateLevel(level: string): void {
  if (!(REQUIREMENT_LEVELS as readonly string[]).includes(level)) {
    throw new ValidationError(`level must be one of ${REQUIREMENT_LEVELS.join(', ')}.`, 'level');
  }
}

function validateStatus(status: string | null | undefined): void {
  if (status === null || status === undefined) return;
  if (!(REQUIREMENT_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError(`status must be one of ${REQUIREMENT_STATUSES.join(', ')} or null.`, 'status');
  }
}

/**
 * Replaces the use case's whole ordered requirement list in one transaction. `sort_order` becomes
 * each row's index in `inputs`, overriding any `sort_order` the caller sent (the array order is the
 * source of truth, matching the "move up/down" UI contract).
 *
 * T-4-02 (D-49): a requirement whose `target_kind` and target ids are unchanged from the previous
 * save keeps its physical `id` (an `UPDATE` of `sort_order`/`level`/`status`/`note`, not a
 * delete-then-reinsert) -- previously every row got a fresh id on every save, silently orphaning
 * any comment attached to it (`comments.entity_id` is not a foreign key precisely so a comment can
 * outlive a target's real removal, but it must not outlive a no-op reorder). Only a target that is
 * genuinely new gets a new id; only a target genuinely dropped from the list is deleted.
 */
export function replaceRequirements(
  projectId: string,
  useCaseId: string,
  inputs: RequirementInput[]
): RequirementRow[] {
  getUseCaseOrThrow(projectId, useCaseId);
  const db = getDb();
  const now = nowIso();
  // The "before" snapshot for the change_log diff below and for the id-matching pass, read before
  // the transaction below deletes/updates/inserts.
  const oldRows = listRequirements(projectId, useCaseId);

  const validated = inputs.map((input) => {
    validateLevel(input.level);
    validateStatus(input.status);
    const target = validateTarget(projectId, input);
    return { ...target, level: input.level, status: input.status ?? null, note: input.note?.trim() || null };
  });

  // Reviewer fix round LOW 6, revised in the second fix round (ERROR A): reject the same target
  // twice in one list instead of silently accepting both and letting the matrix cell show whichever
  // insert happened to run last. The original exemption only skipped a *fully*-null gap row, but
  // `markRequirementsGap*` only nulls the column(s) it actually knows are gone — an `event_property`
  // detach nulls just `property_id`, leaving `event_id` set — so two gap rows on the same event (two
  // properties detached) still collided on `event_property:<event>::`. Any row whose `status` is
  // `gap` and which is missing at least one id its `target_kind` requires (the exact shape
  // `validateTarget` above lets through) is exempt from the duplicate check entirely: it no longer
  // names a real target, so there is nothing to collide on, and a use case can legitimately end up
  // with any number of such rows.
  const seenTargets = new Set<string>();
  inputs.forEach((input, index) => {
    const t = validated[index];
    const shape = TARGET_SHAPES[input.target_kind];
    const isGapWithMissingRequiredId =
      input.status === 'gap' && shape.required.some((key) => !t[key]);
    if (isGapWithMissingRequiredId) return;
    const key = `${input.target_kind}:${t.property_id ?? ''}:${t.event_id ?? ''}:${t.variant_id ?? ''}:${t.catalog_field_id ?? ''}:${t.consent_category_id ?? ''}`;
    if (seenTargets.has(key)) {
      throw new RequirementDuplicateTargetError(
        'This target already appears elsewhere in the requirement list.',
        'target_kind'
      );
    }
    seenTargets.add(key);
  });

  // T-3-02: matches an old row to a new one by its target (target_kind + ids) so a genuine no-op
  // save (or a pure reorder) writes nothing beyond the `sort_order` diff, and an actual field edit
  // shows a real before/after on the same `entity_id` as the row's previous incarnation. A `gap`
  // row missing one of its required ids (`isAmbiguous` below, same shape `validateTarget` and the
  // duplicate-target check above already treat as "no real target to collide on") cannot be matched
  // by a unique key -- any number of them may share the same (now-partial) key -- so they are
  // matched by content instead (`ambiguousOldByKey` below, fix round WARNING 1, reviewer FAIL
  // 2026-09-28 18:18; refined by a pre-QA fix): among the still-unclaimed old rows sharing that
  // exact key, one with an equal (level, note) is preferred, falling back to first-come-first-served
  // (`oldRows`' own order) only when no content match exists. D-49 keeps a requirement's id "for
  // unchanged targets so comments do not orphan"; a gap row's target_kind and (partial) ids are just
  // as unchanged by a reorder as a resolved row's, so its id -- and any comment on it -- must
  // survive one too, and a reversed reorder of two such rows must not swap their ids between them.
  const targetKey = (t: {
    target_kind: string;
    property_id: string | null;
    event_id: string | null;
    variant_id: string | null;
    catalog_field_id: string | null;
    consent_category_id: string | null;
  }): string =>
    `${t.target_kind}:${t.property_id ?? ''}:${t.event_id ?? ''}:${t.variant_id ?? ''}:${t.catalog_field_id ?? ''}:${t.consent_category_id ?? ''}`;
  const isAmbiguous = (t: {
    target_kind: string;
    status: string | null;
    property_id: string | null;
    event_id: string | null;
    variant_id: string | null;
    catalog_field_id: string | null;
    consent_category_id: string | null;
  }): boolean => {
    const shape = TARGET_SHAPES[t.target_kind];
    return t.status === 'gap' && shape.required.some((key) => !t[key]);
  };

  const oldByKey = new Map<string, (typeof oldRows)[number]>();
  // Fix round WARNING 1: a FIFO queue per key of the still-unclaimed *ambiguous* old rows sharing
  // it (there can be more than one -- e.g. two `event_property` rows on the same event that each
  // lost a different `property_id` both key to `event_property:<event>::`), consumed in `oldRows`
  // order as ambiguous new rows are matched against it below.
  const ambiguousOldByKey = new Map<string, (typeof oldRows)[number][]>();
  for (const row of oldRows) {
    if (isAmbiguous(row)) {
      const key = targetKey(row);
      const queue = ambiguousOldByKey.get(key);
      if (queue) queue.push(row);
      else ambiguousOldByKey.set(key, [row]);
      continue;
    }
    oldByKey.set(targetKey(row), row);
  }
  const matchedOldIds = new Set<string>();

  // T-4-02: decide up front, per new row, whether it matches a still-unclaimed old row by target
  // (kept id, `UPDATE`) or is genuinely new (fresh id, `INSERT`) -- a target can appear at most
  // once per list (the duplicate check above), so each old row is claimed by at most one new row.
  const matches: ((typeof oldRows)[number] | undefined)[] = validated.map((row, index) => {
    const target_kind = inputs[index].target_kind;
    const targetShape = {
      target_kind,
      status: row.status,
      property_id: row.property_id,
      event_id: row.event_id,
      variant_id: row.variant_id,
      catalog_field_id: row.catalog_field_id,
      consent_category_id: row.consent_category_id,
    };
    const key = targetKey(targetShape);
    if (isAmbiguous(targetShape)) {
      const queue = ambiguousOldByKey.get(key);
      // Pre-QA fix: prefer an unclaimed queue entry whose (level, note) equals this new row's
      // before falling back to plain FIFO -- two same-key gap rows (e.g. two `event_property` rows
      // on the same event that each lost a different property) usually differ in level/note even
      // though their ids no longer distinguish them by target; matching on that content keeps each
      // row (and any comment on it) with the id it actually belongs to on a reversed reorder,
      // rather than swapping the two rows' ids between each other.
      let old = queue?.find((candidate) => candidate.level === row.level && candidate.note === row.note);
      if (!old) old = queue?.shift();
      else queue!.splice(queue!.indexOf(old), 1);
      if (old) matchedOldIds.add(old.id);
      return old;
    }
    const old = oldByKey.get(key);
    if (old && !matchedOldIds.has(old.id)) {
      matchedOldIds.add(old.id);
      return old;
    }
    return undefined;
  });

  const replace = db.transaction(() => {
    // Genuinely dropped targets: delete first, so a dropped row's id can never collide with a
    // fresh insert further down (ids are UUIDs so this can't actually happen, but deleting first
    // also means a comment on a truly-removed requirement sees the delete's change_log row -- used
    // to label an orphaned comment -- committed before anything else in this transaction).
    const del = db.prepare('DELETE FROM requirements WHERE id = ?');
    for (const old of oldRows) {
      if (matchedOldIds.has(old.id)) continue;
      del.run(old.id);
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'requirement',
        entityId: old.id,
        entityLabel: labelForTarget(
          old.target_kind,
          old.property_id,
          old.event_id,
          old.variant_id,
          old.catalog_field_id,
          old.consent_category_id
        ),
        parentEntityId: useCaseId,
        action: 'delete',
        before: {
          target_kind: old.target_kind,
          property_id: old.property_id,
          event_id: old.event_id,
          variant_id: old.variant_id,
          catalog_field_id: old.catalog_field_id,
          consent_category_id: old.consent_category_id,
          level: old.level,
          status: old.status,
          note: old.note,
          sort_order: old.sort_order,
        },
        after: null,
      });
    }

    const update = db.prepare(
      `UPDATE requirements SET sort_order = ?, level = ?, status = ?, note = ?, updated_at = ? WHERE id = ?`
    );
    const insert = db.prepare(
      `INSERT INTO requirements (
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
        catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    validated.forEach((row, index) => {
      const target_kind = inputs[index].target_kind;
      const matchedOld = matches[index];
      const label = labelForTarget(
        target_kind,
        row.property_id,
        row.event_id,
        row.variant_id,
        row.catalog_field_id,
        row.consent_category_id
      );

      if (matchedOld) {
        try {
          update.run(index, row.level, row.status, row.note, now, matchedOld.id);
        } catch (err) {
          mapWriteError(err, 'This requirement conflicts with an existing one.', `Failed to save requirements: ${(err as Error).message}`);
        }
        ChangeLogDAL.recordChange({
          projectId,
          entityType: 'requirement',
          entityId: matchedOld.id,
          entityLabel: label,
          parentEntityId: useCaseId,
          action: 'update',
          before: {
            level: matchedOld.level,
            status: matchedOld.status,
            note: matchedOld.note,
            sort_order: matchedOld.sort_order,
          },
          after: { level: row.level, status: row.status, note: row.note, sort_order: index },
        });
      } else {
        const newId_ = newId();
        try {
          insert.run(
            newId_,
            useCaseId,
            index,
            target_kind,
            row.property_id,
            row.event_id,
            row.variant_id,
            row.catalog_field_id,
            row.consent_category_id,
            row.level,
            row.status,
            row.note,
            now,
            now
          );
        } catch (err) {
          mapWriteError(err, 'This requirement conflicts with an existing one.', `Failed to save requirements: ${(err as Error).message}`);
        }
        ChangeLogDAL.recordChange({
          projectId,
          entityType: 'requirement',
          entityId: newId_,
          entityLabel: label,
          parentEntityId: useCaseId,
          action: 'create',
          before: null,
          after: {
            target_kind,
            property_id: row.property_id,
            event_id: row.event_id,
            variant_id: row.variant_id,
            catalog_field_id: row.catalog_field_id,
            consent_category_id: row.consent_category_id,
            level: row.level,
            status: row.status,
            note: row.note,
            sort_order: index,
          },
        });
      }
    });
  });
  replace();

  return listRequirements(projectId, useCaseId);
}

/**
 * Internal helper for `use-case-template.dal.ts`'s instantiate path: inserts a single requirement
 * row bypassing `validateTarget`, used only for rows the template resolver could not resolve to a
 * real target (all target ids null, `status: 'gap'` — the plan's word for "data the client does not
 * have", one of `REQUIREMENT_STATUSES`; fix round ERROR 1, this used to be the literal `'ignored'`,
 * a value outside the enum that `replaceRequirements`' own `validateStatus` then rejected, so a use
 * case instantiated from a template with any unresolvable entry could never have its requirement
 * list saved again). `note` explains what was missing. A normal PUT (`replaceRequirements`) never
 * produces such a row on its own, but `validateTarget` now accepts one back (gap + null ids) so a
 * human can save the list unchanged and fix the row up later in the requirements editor.
 */
export function insertUnresolvedRequirement(
  projectId: string,
  useCaseId: string,
  sortOrder: number,
  input: { target_kind: string; level: string; note: string }
): void {
  const now = nowIso();
  const id = newId();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO requirements (
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
        catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'gap', ?, ?, ?)`
    )
      .run(id, useCaseId, sortOrder, input.target_kind, input.level, input.note, now, now);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'requirement',
      entityId: id,
      entityLabel: labelForTarget(input.target_kind, null, null, null, null, null),
      parentEntityId: useCaseId,
      action: 'create',
      before: null,
      after: {
        target_kind: input.target_kind,
        property_id: null,
        event_id: null,
        variant_id: null,
        catalog_field_id: null,
        consent_category_id: null,
        level: input.level,
        status: 'gap',
        note: input.note,
        sort_order: sortOrder,
      },
    });
  });
  run();
}

/**
 * Inserts a single already-resolved requirement row (used by the from-template instantiate path
 * for rows the resolver *could* match). Goes through the same `validateTarget` as `replaceRequirements`.
 */
export function insertResolvedRequirement(
  projectId: string,
  useCaseId: string,
  sortOrder: number,
  input: RequirementInput
): void {
  validateLevel(input.level);
  validateStatus(input.status);
  const target = validateTarget(projectId, input);
  const now = nowIso();
  const id = newId();
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO requirements (
          id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
          catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .run(
          id,
          useCaseId,
          sortOrder,
          input.target_kind,
          target.property_id,
          target.event_id,
          target.variant_id,
          target.catalog_field_id,
          target.consent_category_id,
          input.level,
          input.status ?? null,
          input.note?.trim() || null,
          now,
          now
        );
    } catch (err) {
      mapWriteError(err, 'This requirement conflicts with an existing one.', `Failed to create requirement: ${(err as Error).message}`);
    }
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'requirement',
      entityId: id,
      entityLabel: labelForTarget(
        input.target_kind,
        target.property_id,
        target.event_id,
        target.variant_id,
        target.catalog_field_id,
        target.consent_category_id
      ),
      parentEntityId: useCaseId,
      action: 'create',
      before: null,
      after: {
        target_kind: input.target_kind,
        property_id: target.property_id,
        event_id: target.event_id,
        variant_id: target.variant_id,
        catalog_field_id: target.catalog_field_id,
        consent_category_id: target.consent_category_id,
        level: input.level,
        status: input.status ?? null,
        note: input.note?.trim() || null,
        sort_order: sortOrder,
      },
    });
  });
  run();
}

export function getRequirementOrThrow(useCaseId: string, id: string): RequirementRow {
  const row = getDb()
    .prepare('SELECT * FROM requirements WHERE id = ? AND use_case_id = ?')
    .get(id, useCaseId) as RequirementRow | undefined;
  if (!row) throw new NotFoundError('Requirement not found.', 'requirement');
  return row;
}

/**
 * T-1-07 fix round ERROR 2: deleting/detaching a requirement's target used to leave a "ghost" row
 * — a dangling id the UI rendered as a blank picker or a raw uuid, and that `replaceRequirements`
 * then refused to save back unchanged (`event_id does not belong to this project.`), freezing the
 * whole use case until a human found and fixed every affected row by hand. The four call sites below
 * (event soft-delete, variant hard-delete, property soft-delete, event-property detach) instead null
 * the dangling column(s), force `status = 'gap'`, and append a "target removed: <name>" note in the
 * same transaction as the delete/detach itself — deletion stays possible (no `REQUIREMENT_IN_USE`
 * block), the use case stays saveable (`validateTarget` accepts a `gap` row with null ids), and the
 * matrix/docs export render "(removed)" via `buildTargetLabelResolver` instead of a raw uuid.
 *
 * `note` is appended, not overwritten (`CASE WHEN ... ELSE note || ' | ' || ?`), so an existing note
 * survives; this and the three wrappers below run synchronously against whatever transaction the
 * caller is already inside (they take no `db.transaction` of their own).
 *
 * T-3-02 pre-QA fix round (reviewer WARNING 2): the affected rows are read *before* the UPDATE so
 * a real `requirement/update` change_log row (parent = the row's own use case) can be written per
 * row, `before` the pre-gap fields and `after` the post-gap ones -- previously this whole write path
 * (called from `deleteEvent`/`deleteVariant`/`deleteProperty`/`detachPropertyFromEvent`) left no
 * trace at all, so a use case's History never showed why one of its requirements became a `gap`.
 */
function markRequirementsGap(
  projectId: string,
  nullColumns: TargetIdKey[],
  whereSql: string,
  whereParams: unknown[],
  targetName: string
): void {
  const db = getDb();
  const affected = db
    .prepare(`SELECT * FROM requirements WHERE ${whereSql}`)
    .all(...whereParams) as RequirementRow[];
  if (affected.length === 0) return;

  const now = nowIso();
  const note = `target removed: ${targetName}`;
  const setClause = nullColumns.map((c) => `${c} = NULL`).join(', ');
  db.prepare(
    `UPDATE requirements SET ${setClause}, status = 'gap',
       note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE note || ' | ' || ? END,
       updated_at = ?
     WHERE ${whereSql}`
  ).run(note, note, now, ...whereParams);

  for (const before of affected) {
    const after: Record<string, unknown> = {
      property_id: nullColumns.includes('property_id') ? null : before.property_id,
      event_id: nullColumns.includes('event_id') ? null : before.event_id,
      variant_id: nullColumns.includes('variant_id') ? null : before.variant_id,
      catalog_field_id: nullColumns.includes('catalog_field_id') ? null : before.catalog_field_id,
      consent_category_id: nullColumns.includes('consent_category_id') ? null : before.consent_category_id,
      status: 'gap',
      note: before.note ? `${before.note} | ${note}` : note,
    };
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'requirement',
      entityId: before.id,
      entityLabel: labelForTarget(
        before.target_kind,
        before.property_id,
        before.event_id,
        before.variant_id,
        before.catalog_field_id,
        before.consent_category_id
      ),
      parentEntityId: before.use_case_id,
      action: 'update',
      before: {
        property_id: before.property_id,
        event_id: before.event_id,
        variant_id: before.variant_id,
        catalog_field_id: before.catalog_field_id,
        consent_category_id: before.consent_category_id,
        status: before.status,
        note: before.note,
      },
      after,
    });
  }
}

/**
 * Called by `event.dal.ts` `deleteEvent` before the event's variants are deleted: nulls `event_id`
 * on `target_kind = 'event'|'event_property'` rows referencing this event directly. Rows referencing
 * one of the event's variants are a separate call to `markRequirementsGapForVariantRemoval` per
 * variant (the caller does this once per variant, before deleting the variants themselves).
 */
export function markRequirementsGapForEventRemoval(projectId: string, eventId: string, eventName: string): void {
  markRequirementsGap(projectId, ['event_id'], 'event_id = ?', [eventId], eventName);
}

/**
 * Called by `variant.dal.ts` `deleteVariant` and `event.dal.ts` `deleteEvent` (once per variant)
 * before the `DELETE FROM variants` itself: nulls `variant_id` on `target_kind =
 * 'variant'|'variant_property'` rows referencing this variant.
 */
export function markRequirementsGapForVariantRemoval(projectId: string, variantId: string, variantName: string): void {
  markRequirementsGap(projectId, ['variant_id'], 'variant_id = ?', [variantId], variantName);
}

/**
 * Called by `property.dal.ts` `deleteProperty` (which already refuses to delete a property still
 * attached to any event, so only `customer_property` rows and any pre-detached `event_property`/
 * `variant_property` leftovers can still reference it): nulls `property_id` on every row referencing
 * this property, regardless of `target_kind`.
 */
export function markRequirementsGapForPropertyRemoval(projectId: string, propertyId: string, propertyName: string): void {
  markRequirementsGap(projectId, ['property_id'], 'property_id = ?', [propertyId], propertyName);
}

/**
 * Called by `event.dal.ts` `detachPropertyFromEvent`: the property itself is not deleted (it may
 * still be linked to other events), so only the rows scoped to *this* (event, property) pair lose
 * their target — `event_property` rows for this exact event, and `variant_property` rows whose
 * `variant_id` belongs to this event and whose `property_id` is the one being detached.
 */
export function markRequirementsGapForDetach(
  projectId: string,
  eventId: string,
  propertyId: string,
  propertyName: string
): void {
  markRequirementsGap(
    projectId,
    ['property_id'],
    `property_id = ? AND (
       (target_kind = 'event_property' AND event_id = ?)
       OR (target_kind = 'variant_property' AND variant_id IN (SELECT id FROM variants WHERE event_id = ?))
     )`,
    [propertyId, eventId, eventId],
    propertyName
  );
}

/**
 * T-3-10 (D-57): called by `catalog.dal.ts` `deleteCatalogField` before the field itself is
 * deleted: nulls `catalog_field_id` on `target_kind = 'catalog_attribute'` rows referencing it.
 */
export function markRequirementsGapForCatalogFieldRemoval(
  projectId: string,
  catalogFieldId: string,
  fieldName: string
): void {
  markRequirementsGap(projectId, ['catalog_field_id'], 'catalog_field_id = ?', [catalogFieldId], fieldName);
}

/**
 * T-3-10 (D-57): called by `consent-category.dal.ts` `deleteConsentCategory` before the category
 * itself is deleted: nulls `consent_category_id` on `target_kind = 'consent'` rows referencing it.
 */
export function markRequirementsGapForConsentCategoryRemoval(
  projectId: string,
  consentCategoryId: string,
  categoryName: string
): void {
  markRequirementsGap(projectId, ['consent_category_id'], 'consent_category_id = ?', [consentCategoryId], categoryName);
}
