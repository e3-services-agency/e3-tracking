/**
 * Batched inputs for the finding priority rule (D-89, T-5-47). `loadFindingPriorityContext` reads
 * the project's events, variants, use cases and requirements once (four queries, or two when the
 * caller already holds events and variants) and hands them to the pure
 * `src/domain/findingPriority.ts#buildFindingPriorityContext`; every finding is then prioritised
 * in memory, never with a query per finding. Priority is derived on every read and never stored.
 */
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import {
  buildFindingPriorityContext,
  findingPriorityFields,
  type FindingPriorityContext,
  type FindingPriorityContextInput,
  type FindingPriorityFields,
  type FindingPriorityInput,
} from '../../domain/findingPriority';
import type { FindingPriority } from '../../domain/enums';

export function loadFindingPriorityContext(
  projectId: string,
  preloaded: { events?: FindingPriorityContextInput['events']; variants?: FindingPriorityContextInput['variants'] } = {}
): FindingPriorityContext {
  return buildFindingPriorityContext({
    events: preloaded.events ?? EventDAL.listEventPriorityFacts(projectId),
    variants: preloaded.variants ?? VariantDAL.listVariantsByProject(projectId),
    useCases: UseCaseDAL.listUseCases(projectId),
    requirements: RequirementDAL.listRequirementsByProject(projectId),
  });
}

export type WithFindingPriority<T> = T & FindingPriorityFields;

/** Adds `priority`, `priority_rank` and `priority_reasons` to each row (input order kept). */
export function withFindingPriority<T extends FindingPriorityInput>(rows: readonly T[], context: FindingPriorityContext): WithFindingPriority<T>[] {
  return rows.map((row) => ({ ...row, ...findingPriorityFields(row, context) }));
}

/** Stable sort by `priority_rank` (ties keep their incoming order). */
export function sortByFindingPriority<T extends { priority_rank: number }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.priority_rank - b.row.priority_rank || a.index - b.index)
    .map(({ row }) => row);
}

export function filterByFindingPriority<T extends { priority: FindingPriority }>(rows: readonly T[], allowed: ReadonlySet<FindingPriority> | null): T[] {
  return allowed ? rows.filter((row) => allowed.has(row.priority)) : [...rows];
}
