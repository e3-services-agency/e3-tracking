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
import { NotFoundError, RequirementTargetInvalidError, ValidationError } from '../errors';
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

/**
 * Validates `target_kind` and that exactly the ids that kind requires are set (others must be
 * null/undefined), that every set id belongs to this project, and — for the two `..._property`
 * kinds — that the property is actually linked to the target's event. Throws
 * `RequirementTargetInvalidError` (400 `REQUIREMENT_TARGET_INVALID`) on any mismatch.
 */
function validateTarget(
  projectId: string,
  input: Pick<RequirementInput, 'target_kind' | 'property_id' | 'event_id' | 'variant_id'>
): { property_id: string | null; event_id: string | null; variant_id: string | null } {
  const { target_kind } = input;
  if (!(REQUIREMENT_TARGET_KINDS as readonly string[]).includes(target_kind)) {
    throw new ValidationError(
      `target_kind must be one of ${REQUIREMENT_TARGET_KINDS.join(', ')}.`,
      'target_kind'
    );
  }
  const propertyId = input.property_id ?? null;
  const eventId = input.event_id ?? null;
  const variantId = input.variant_id ?? null;

  switch (target_kind) {
    case 'customer_property': {
      if (!propertyId || eventId || variantId) {
        throw new RequirementTargetInvalidError(
          'target_kind "customer_property" requires property_id only (no event_id/variant_id).',
          'target_kind'
        );
      }
      assertPropertyInProject(projectId, propertyId, 'customer');
      return { property_id: propertyId, event_id: null, variant_id: null };
    }
    case 'event': {
      if (!eventId || propertyId || variantId) {
        throw new RequirementTargetInvalidError(
          'target_kind "event" requires event_id only (no property_id/variant_id).',
          'target_kind'
        );
      }
      assertEventInProject(projectId, eventId);
      return { property_id: null, event_id: eventId, variant_id: null };
    }
    case 'variant': {
      if (!variantId || propertyId || eventId) {
        throw new RequirementTargetInvalidError(
          'target_kind "variant" requires variant_id only (no property_id/event_id).',
          'target_kind'
        );
      }
      assertVariantInProject(projectId, variantId);
      return { property_id: null, event_id: null, variant_id: variantId };
    }
    case 'event_property': {
      if (!eventId || !propertyId || variantId) {
        throw new RequirementTargetInvalidError(
          'target_kind "event_property" requires event_id and property_id (no variant_id).',
          'target_kind'
        );
      }
      assertEventInProject(projectId, eventId);
      assertPropertyInProject(projectId, propertyId, 'event');
      assertPropertyLinkedToEvent(eventId, propertyId);
      return { property_id: propertyId, event_id: eventId, variant_id: null };
    }
    case 'variant_property': {
      if (!variantId || !propertyId || eventId) {
        throw new RequirementTargetInvalidError(
          'target_kind "variant_property" requires variant_id and property_id (no event_id).',
          'target_kind'
        );
      }
      const variantEventId = assertVariantInProject(projectId, variantId);
      assertPropertyInProject(projectId, propertyId, 'event');
      assertPropertyLinkedToEvent(variantEventId, propertyId);
      return { property_id: propertyId, event_id: null, variant_id: variantId };
    }
    default:
      // Unreachable: REQUIREMENT_TARGET_KINDS check above already rejects anything else.
      throw new RequirementTargetInvalidError('Unknown target_kind.', 'target_kind');
  }
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

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM requirements WHERE use_case_id = ?').run(useCaseId);
    const insert = db.prepare(
      `INSERT INTO requirements (
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id, level,
        status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
 * real target (all target ids null, `status: 'ignored'`, `note` explaining what was missing). A
 * normal PUT (`replaceRequirements`) never produces such a row; a human clears the note once they
 * fix it up in the requirements editor and the next `PUT` re-validates normally.
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
        id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id, level,
        status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 'ignored', ?, ?, ?)`
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
          id, use_case_id, sort_order, target_kind, property_id, event_id, variant_id, level,
          status, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId(),
        useCaseId,
        sortOrder,
        input.target_kind,
        target.property_id,
        target.event_id,
        target.variant_id,
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
