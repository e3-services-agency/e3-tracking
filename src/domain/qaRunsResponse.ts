/**
 * Pure response-to-rows helper for the QA runs page (fix round FAIL-2), split out of
 * `src/pages/QaRuns.tsx` so the "what counts as a valid runs list" decision is unit-testable
 * without mounting the page. `GET /api/projects/:id/qa-runs` (`qa-runs.ts`) always returns a bare
 * JSON array (never `{runs: [...]}`), so the only real failure modes are a non-array body (parsed
 * error object, `{}` from a JSON-parse failure) or a non-ok response.
 */
export interface QaRunLike {
  id: string;
}

/**
 * `body` is whatever `res.json()` produced for the qa-runs list response. Returns `[]` (not an
 * error) for anything that isn't a JSON array, since an empty/malformed body should render as "no
 * runs", not throw. Generic over the caller's row shape (`QaRunRow` in `QaRuns.tsx`) since this
 * helper only cares about "is it an array", not the row's exact fields.
 */
export function parseQaRunsResponse<T extends QaRunLike = QaRunLike>(ok: boolean, body: unknown): T[] {
  if (!ok) return [];
  return Array.isArray(body) ? (body as T[]) : [];
}
