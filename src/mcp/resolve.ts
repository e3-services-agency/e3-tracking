/**
 * Shared lookups for MCP tool handlers (T-2-10): resolving `project_key` (D-25 Q7 default from
 * `E3_PROJECT_KEY`), and resolving an event/variant/use case given either its id or its display
 * name/code -- every tool in the plan's table accepts "name or id" for `event`/`use_case`/`variant`
 * so an agent that only has the human-readable name from a previous call never has to look up the
 * id first.
 */
import { remoteProject } from './toolPolicy';
import * as ProjectDAL from '../backend/dal/project.dal';
import * as EventDAL from '../backend/dal/event.dal';
import * as UseCaseDAL from '../backend/dal/use-case.dal';
import type { ProjectWithClient } from '../backend/dal/project.dal';
import type { EventWithCounts } from '../backend/dal/event.dal';
import type { UseCaseRow } from '../backend/dal/use-case.dal';
import type { EventCardVariant } from '../domain/document/trackingDocument';
import { McpToolError, ProjectNotFoundError } from './errors';

/** Resolves `project_key`, defaulting to `E3_PROJECT_KEY` (D-25 Q7); throws `PROJECT_NOT_FOUND` when neither resolves. */
export function resolveProject(projectKey: string | undefined): ProjectWithClient {
  const authorized = remoteProject(projectKey);
  if (authorized) return authorized;
  const key = projectKey?.trim() || process.env.E3_PROJECT_KEY?.trim() || '';
  if (!key) {
    throw new ProjectNotFoundError(
      'No project_key was given and E3_PROJECT_KEY is not set; pass project_key or configure a default project.'
    );
  }
  const project = ProjectDAL.listProjects().find((p) => p.key === key);
  if (!project) {
    throw new ProjectNotFoundError(`No project with key "${key}".`);
  }
  return project;
}

/** Resolves an event by id or exact name. */
export function resolveEvent(projectId: string, event: string): EventWithCounts {
  const events = EventDAL.listEvents(projectId);
  const found = events.find((e) => e.id === event) ?? events.find((e) => e.name === event);
  if (!found) throw new McpToolError('EVENT_NOT_FOUND', `No event named or with id "${event}".`);
  return found;
}

/** Resolves a use case by id or code. */
export function resolveUseCase(projectId: string, useCase: string): UseCaseRow {
  const useCases = UseCaseDAL.listUseCases(projectId);
  const found = useCases.find((u) => u.id === useCase) ?? useCases.find((u) => u.code === useCase);
  if (!found) throw new McpToolError('USE_CASE_NOT_FOUND', `No use case coded or with id "${useCase}".`);
  return found;
}

/** Resolves a variant by id or exact name (variant names are `event[discriminator=value]`, e.g. `cart_update[action=add]`). */
export function resolveVariant(variants: EventCardVariant[], variant: string): EventCardVariant {
  const found = variants.find((v) => v.id === variant) ?? variants.find((v) => v.name === variant);
  if (!found) throw new McpToolError('VARIANT_NOT_FOUND', `No variant named or with id "${variant}".`);
  return found;
}
