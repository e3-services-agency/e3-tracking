/**
 * Pure resolution helper for which project should become active on mount/popstate
 * (T-1-02 fix round 2, QA #1). The URL's `/p/:key` segment always wins when present;
 * the previously-active project id (restored from localStorage by store.tsx) is only
 * consulted when the URL carries no project key at all. Kept dependency-free (no
 * React, no window) so it is directly unit-testable under the node vitest config.
 */
export interface ProjectKeyRef {
  id: string;
  key: string;
}

export type ResolvedProject =
  | { type: 'select'; projectId: string; projectKey: string }
  | { type: 'clear' }
  | { type: 'none' };

export function resolveInitialProject(
  urlKey: string | null,
  storedId: string | null,
  projects: ReadonlyArray<ProjectKeyRef>,
): ResolvedProject {
  if (urlKey) {
    const match = projects.find((p) => p.key === urlKey);
    return match ? { type: 'select', projectId: match.id, projectKey: match.key } : { type: 'clear' };
  }
  if (storedId) {
    const match = projects.find((p) => p.id === storedId);
    return match ? { type: 'select', projectId: match.id, projectKey: match.key } : { type: 'clear' };
  }
  return { type: 'none' };
}
