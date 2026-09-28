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
 */
import { getEventById } from '../dal/event.dal';
import { getPropertyById } from '../dal/property.dal';
import { getUseCaseById } from '../dal/use-case.dal';
import { getRequirementInProject } from '../dal/requirement.dal';
import { listChanges } from '../dal/change-log.dal';
import { buildTargetLabelResolver, type TargetLabelResolver } from './requirements-matrix.service';
import type { CommentRow } from '../dal/comment.dal';

export interface CommentWithLabel extends CommentRow {
  entity_label: string;
}

function resolveRequirementLabel(projectId: string, entityId: string, labelFor: TargetLabelResolver): string {
  const row = getRequirementInProject(projectId, entityId);
  if (row) {
    return labelFor({
      target_kind: row.target_kind,
      property_id: row.property_id,
      event_id: row.event_id,
      variant_id: row.variant_id,
      catalog_field_id: row.catalog_field_id,
      consent_category_id: row.consent_category_id,
    });
  }

  // Genuinely gone: the requirement's last change_log row (always written, T-3-02) still carries
  // parent_entity_id = its use case's id, so the use case context survives even though the row and
  // any comment's link to it are otherwise unrecoverable.
  const [lastChange] = listChanges(projectId, { entity_type: 'requirement', entity_id: entityId, limit: 1 });
  const useCaseId = lastChange?.parent_entity_id;
  const useCase = useCaseId ? getUseCaseById(projectId, useCaseId) : null;
  return useCase ? `removed requirement (${useCase.code ?? useCase.name})` : 'removed requirement';
}

export function resolveCommentEntityLabel(
  projectId: string,
  comment: Pick<CommentRow, 'entity_type' | 'entity_id'>,
  labelFor: TargetLabelResolver = buildTargetLabelResolver(projectId)
): string {
  switch (comment.entity_type) {
    case 'event': {
      const event = getEventById(projectId, comment.entity_id);
      return event ? event.name : '(removed event)';
    }
    case 'property': {
      const property = getPropertyById(projectId, comment.entity_id);
      return property ? property.name : '(removed property)';
    }
    case 'use_case': {
      const useCase = getUseCaseById(projectId, comment.entity_id);
      return useCase ? (useCase.code ? `${useCase.code} ${useCase.name}` : useCase.name) : '(removed use case)';
    }
    case 'requirement':
      return resolveRequirementLabel(projectId, comment.entity_id, labelFor);
    default:
      return comment.entity_id;
  }
}

/** Attaches `entity_label` to every row (one requirement-label-resolver build for the whole list, not per row). */
export function withEntityLabels(projectId: string, comments: CommentRow[]): CommentWithLabel[] {
  const labelFor = buildTargetLabelResolver(projectId);
  return comments.map((comment) => ({
    ...comment,
    entity_label: resolveCommentEntityLabel(projectId, comment, labelFor),
  }));
}
