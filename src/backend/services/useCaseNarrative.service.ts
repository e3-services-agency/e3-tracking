/**
 * Use case narrative orchestration (T-2-11, D-32): resolves a use case's requirements to display
 * names (the pure `generateUseCaseNarrative` in `src/domain/narrative/useCaseNarrative.ts` never
 * touches the database) and enforces the "regenerating over a manual edit needs `force`" guard.
 *
 * `rules` (the "Guardrails" section) are always passed as `[]` today: the `rules` table is built
 * by T-2-06/T-2-07 in a parallel worktree and not present on this branch. Once that merges, this
 * function is the one place to wire in `listRulesByEvent`-style data; the generator already
 * accepts a `NarrativeRule[]` and the "Guardrails" section is simply omitted while it is empty.
 */
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import { listEvents } from '../dal/event.dal';
import { listProperties } from '../dal/property.dal';
import { listVariantsByProject } from '../dal/variant.dal';
import { generateUseCaseNarrative, type NarrativeRequirement, type NarrativeRule } from '../../domain/narrative/useCaseNarrative';
import { NarrativeEditedError } from '../errors';

/** Builds the `NarrativeRequirement[]` for a use case by resolving each requirement's ids to display names (event/variant/property), per requirement order. */
export function resolveNarrativeRequirements(projectId: string, useCaseId: string): NarrativeRequirement[] {
  const requirements = RequirementDAL.listRequirements(projectId, useCaseId);
  const eventNameById = new Map(listEvents(projectId).map((e) => [e.id, e.name]));
  const variantNameById = new Map(listVariantsByProject(projectId).map((v) => [v.id, v.name]));
  const propertyNameById = new Map(listProperties(projectId).map((p) => [p.id, p.name]));

  return requirements.map((req) => ({
    target_kind: req.target_kind as NarrativeRequirement['target_kind'],
    level: req.level as NarrativeRequirement['level'],
    status: req.status as NarrativeRequirement['status'],
    note: req.note,
    event_label: req.event_id ? (eventNameById.get(req.event_id) ?? null) : null,
    variant_label: req.variant_id ? (variantNameById.get(req.variant_id) ?? null) : null,
    property_label: req.property_id ? (propertyNameById.get(req.property_id) ?? null) : null,
  }));
}

/** Guardrails input; empty until the rules table (T-2-06) is available on this branch, see module doc. */
function resolveNarrativeRules(_projectId: string, _useCaseId: string): NarrativeRule[] {
  return [];
}

/**
 * Regenerates and stores a use case's narrative. Throws `NarrativeEditedError` (409
 * `NARRATIVE_EDITED`) when the stored narrative was edited by hand (`narrative_edited_at` set) and
 * `force` is not `true` (D-32).
 */
export function regenerateNarrative(projectId: string, useCaseId: string, force: boolean): UseCaseDAL.UseCaseRow {
  const useCase = UseCaseDAL.getUseCaseOrThrow(projectId, useCaseId);
  if (useCase.narrative_edited_at && !force) {
    throw new NarrativeEditedError(
      'This narrative was edited by hand; pass force: true to overwrite it with a fresh regeneration.'
    );
  }
  const requirements = resolveNarrativeRequirements(projectId, useCaseId);
  const rules = resolveNarrativeRules(projectId, useCaseId);
  const narrative = generateUseCaseNarrative(
    { name: useCase.name, type: useCase.type, description: useCase.description },
    requirements,
    rules
  );
  return UseCaseDAL.regenerateUseCaseNarrative(projectId, useCaseId, narrative);
}
