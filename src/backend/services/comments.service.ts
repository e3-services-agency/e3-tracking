/**
 * Comment label resolution (D-49, T-4-02): `entity_label` is computed on read, never stored, so it
 * always reflects the current name of the target -- event name, property name, use case code (plus
 * name), or a requirement's target label via `buildTargetLabelResolver` (`requirements-matrix.service.ts`).
 *
 * A requirement whose row has actually been deleted (a genuine target swap or removal via
 * `replaceRequirements`, not the id-stable case T-4-02 added) can no longer be looked up directly;
 * its owning use case is recovered from the requirement's own last `change_log` row (T-3-02 already
 * writes one with `parent_entity_id = use_case_id` for every requirement delete), so the comment
 * still reads as "removed requirement" under the use case it belonged to, rather than a bare id.
 *
 * Fix round (reviewer FAIL 2026-09-28 18:18, ERROR 1): the Comments page needs somewhere to route a
 * click -- for a requirement comment, that is its owning use case, which is not `entity_id` itself.
 * `resolveCommentEntity`/`withEntityLabels` therefore also return `use_case_id` (null for every
 * other entity_type, and for a requirement whose owning use case cannot be recovered at all) so the
 * frontend never has to re-derive it.
 */
import { getDb } from '../db';
import { listAttachmentsByComment, type CommentAttachmentRow } from '../dal/comment-attachment.dal';
import { getEventById } from '../dal/event.dal';
import { getPropertyById } from '../dal/property.dal';
import { getUseCaseById } from '../dal/use-case.dal';
import { getRequirementInProject } from '../dal/requirement.dal';
import { listChanges } from '../dal/change-log.dal';
import { buildTargetLabelResolver, type TargetLabelResolver } from './requirements-matrix.service';
import type { CommentRow } from '../dal/comment.dal';

export interface CommentEntityInfo {
  label: string;
  /** The requirement's owning use case id (null for every other entity_type, or when a genuinely
   *  removed requirement's use case cannot be recovered either). */
  use_case_id: string | null;
  property_id?: string | null;
}

export interface CommentWithLabel extends CommentRow {
  entity_label: string;
  /** See `CommentEntityInfo.use_case_id`. */
  use_case_id: string | null;
  property_id?: string | null;
  /** T-5-04: comment images, in order (absent on a freshly created comment). */
  attachments?: CommentAttachmentRow[];
}

function resolveRequirementEntity(projectId: string, entityId: string, labelFor: TargetLabelResolver): CommentEntityInfo {
  const row = getRequirementInProject(projectId, entityId);
  if (row) {
    return {
      label: labelFor({
        target_kind: row.target_kind,
        property_id: row.property_id,
        event_id: row.event_id,
        variant_id: row.variant_id,
        catalog_field_id: row.catalog_field_id,
        consent_category_id: row.consent_category_id,
      }),
      use_case_id: row.use_case_id,
    };
  }

  // Genuinely gone: the requirement's last change_log row (always written, T-3-02) still carries
  // parent_entity_id = its use case's id, so the use case context (and, per ERROR 1, the link
  // itself) survives even though the row and any comment's link to it are otherwise unrecoverable.
  const [lastChange] = listChanges(projectId, { entity_type: 'requirement', entity_id: entityId, limit: 1 });
  const useCaseId = lastChange?.parent_entity_id ?? null;
  const useCase = useCaseId ? getUseCaseById(projectId, useCaseId) : null;
  return {
    label: useCase ? `removed requirement (${useCase.code ?? useCase.name})` : 'removed requirement',
    use_case_id: useCase ? useCaseId : null,
  };
}

export function resolveCommentEntity(
  projectId: string,
  comment: Pick<CommentRow, 'entity_type' | 'entity_id'>,
  labelFor: TargetLabelResolver = buildTargetLabelResolver(projectId)
): CommentEntityInfo {
  switch (comment.entity_type) {
    case 'event': {
      const event = getEventById(projectId, comment.entity_id);
      return { label: event ? event.name : '(removed event)', use_case_id: null };
    }
    case 'property': {
      const property = getPropertyById(projectId, comment.entity_id);
      return { label: property ? property.name : '(removed property)', use_case_id: null };
    }
    case 'use_case': {
      const useCase = getUseCaseById(projectId, comment.entity_id);
      return {
        label: useCase ? (useCase.code ? `${useCase.code} ${useCase.name}` : useCase.name) : '(removed use case)',
        use_case_id: null,
      };
    }
    case 'identity_rule':
    case 'catalog': {
      const table = comment.entity_type === 'catalog' ? 'catalogs' : 'identity_rules';
      const row = getDb().prepare(`SELECT name FROM ${table} WHERE project_id = ? AND id = ? ${table === 'catalogs' ? 'AND deleted_at IS NULL' : ''}`).get(projectId, comment.entity_id) as {name:string} | undefined;
      return {label: row?.name ?? `(removed ${comment.entity_type.replace('_', ' ')})`, use_case_id:null};
    }
    case 'property_definition': {
      const row = getDb().prepare('SELECT d.name,p.name AS property_name,p.id AS property_id FROM property_definitions d JOIN properties p ON p.id = d.property_id WHERE p.project_id = ? AND d.project_id = p.project_id AND d.id = ? AND d.deleted_at IS NULL AND p.deleted_at IS NULL').get(projectId,comment.entity_id) as {name:string;property_name:string;property_id:string} | undefined;
      return {label:row ? `${row.property_name}: ${row.name}` : '(removed property definition)',property_id:row?.property_id ?? null,use_case_id:null};
    }
    case 'requirement':
      return resolveRequirementEntity(projectId, comment.entity_id, labelFor);
    default:
      return { label: comment.entity_id, use_case_id: null };
  }
}

/** Thin string-only wrapper over `resolveCommentEntity`, for callers (CSV export) that only need the label. */
export function resolveCommentEntityLabel(
  projectId: string,
  comment: Pick<CommentRow, 'entity_type' | 'entity_id'>,
  labelFor?: TargetLabelResolver
): string {
  return resolveCommentEntity(projectId, comment, labelFor).label;
}

/** Attaches `entity_label`/`use_case_id` to every row (one requirement-label-resolver build for the whole list, not per row). */
export function withEntityLabels(projectId: string, comments: CommentRow[]): CommentWithLabel[] {
  const labelFor = buildTargetLabelResolver(projectId);
  const attachments = listAttachmentsByComment(projectId, comments.map((c) => c.id));
  return comments.map((comment) => {
    const { label, use_case_id, property_id } = resolveCommentEntity(projectId, comment, labelFor);
    return { ...comment, entity_label: label, use_case_id, property_id: property_id ?? null, attachments: attachments.get(comment.id) ?? [] };
  });
}
