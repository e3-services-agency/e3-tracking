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
 */
export function replaceRequirements(
  projectId: string,
  useCaseId: string,
  inputs: RequirementInput[]
): RequirementRow[] {
  getUseCaseOrThrow(projectId, useCaseId);
  const db = getDb();
  const now = nowIso();

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

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM requirements WHERE use_case_id = ?').run(useCaseId);
    const insert = db.prepare(
      `INSERT INTO requirements (
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
        catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    validated.forEach((row, index) => {
      try {
        insert.run(
          newId(),
          useCaseId,
          index,
          inputs[index].target_kind,
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
  useCaseId: string,
  sortOrder: number,
  input: { target_kind: string; level: string; note: string }
): void {
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO requirements (
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
        catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 'gap', ?, ?, ?)`
    )
    .run(newId(), useCaseId, sortOrder, input.target_kind, input.level, input.note, now, now);
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
  try {
    getDb()
      .prepare(
        `INSERT INTO requirements (
          id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id,
          catalog_field_id, consent_category_id, level, status, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId(),
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
 */
function markRequirementsGap(
  nullColumns: TargetIdKey[],
  whereSql: string,
  whereParams: unknown[],
  targetName: string
): void {
  const now = nowIso();
  const note = `target removed: ${targetName}`;
  const setClause = nullColumns.map((c) => `${c} = NULL`).join(', ');
  getDb()
    .prepare(
      `UPDATE requirements SET ${setClause}, status = 'gap',
         note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE note || ' | ' || ? END,
         updated_at = ?
       WHERE ${whereSql}`
    )
    .run(note, note, now, ...whereParams);
}

/**
 * Called by `event.dal.ts` `deleteEvent` before the event's variants are deleted: nulls `event_id`
 * on `target_kind = 'event'|'event_property'` rows referencing this event directly. Rows referencing
 * one of the event's variants are a separate call to `markRequirementsGapForVariantRemoval` per
 * variant (the caller does this once per variant, before deleting the variants themselves).
 */
export function markRequirementsGapForEventRemoval(eventId: string, eventName: string): void {
  markRequirementsGap(['event_id'], 'event_id = ?', [eventId], eventName);
}

/**
 * Called by `variant.dal.ts` `deleteVariant` and `event.dal.ts` `deleteEvent` (once per variant)
 * before the `DELETE FROM variants` itself: nulls `variant_id` on `target_kind =
 * 'variant'|'variant_property'` rows referencing this variant.
 */
export function markRequirementsGapForVariantRemoval(variantId: string, variantName: string): void {
  markRequirementsGap(['variant_id'], 'variant_id = ?', [variantId], variantName);
}

/**
 * Called by `property.dal.ts` `deleteProperty` (which already refuses to delete a property still
 * attached to any event, so only `customer_property` rows and any pre-detached `event_property`/
 * `variant_property` leftovers can still reference it): nulls `property_id` on every row referencing
 * this property, regardless of `target_kind`.
 */
export function markRequirementsGapForPropertyRemoval(propertyId: string, propertyName: string): void {
  markRequirementsGap(['property_id'], 'property_id = ?', [propertyId], propertyName);
}

/**
 * Called by `event.dal.ts` `detachPropertyFromEvent`: the property itself is not deleted (it may
 * still be linked to other events), so only the rows scoped to *this* (event, property) pair lose
 * their target — `event_property` rows for this exact event, and `variant_property` rows whose
 * `variant_id` belongs to this event and whose `property_id` is the one being detached.
 */
export function markRequirementsGapForDetach(eventId: string, propertyId: string, propertyName: string): void {
  markRequirementsGap(
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
export function markRequirementsGapForCatalogFieldRemoval(catalogFieldId: string, fieldName: string): void {
  markRequirementsGap(['catalog_field_id'], 'catalog_field_id = ?', [catalogFieldId], fieldName);
}

/**
 * T-3-10 (D-57): called by `consent-category.dal.ts` `deleteConsentCategory` before the category
 * itself is deleted: nulls `consent_category_id` on `target_kind = 'consent'` rows referencing it.
 */
export function markRequirementsGapForConsentCategoryRemoval(consentCategoryId: string, categoryName: string): void {
  markRequirementsGap(['consent_category_id'], 'consent_category_id = ?', [consentCategoryId], categoryName);
}
