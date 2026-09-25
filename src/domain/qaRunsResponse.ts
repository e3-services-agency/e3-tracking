/**
 * Pure response-to-rows helper for the QA runs page (fix round FAIL-2, re-sweep finding 1), split
 * out of `src/pages/QaRuns.tsx` so the "what counts as a valid runs list" decision is unit-testable
 * without mounting the page. `GET /api/projects/:id/qa-runs` (`qa-runs.ts`) always returns a bare
 * JSON array (never `{runs: [...]}`), so a 200 response whose body is not an array (an unreadable
 * body that `res.json()` failed to parse, a truncated/malformed body, or an unexpected shape) is
 * treated as an error, not as an empty list (reviewer PASS finding 1 on 7de9a5b: silently rendering
 * `{}` as "no runs" reproduces the original FAIL-1/FAIL-2 symptom exactly).
 */
export interface QaRunLike {
  id: string;
}

export type QaRunsParseResult<T extends QaRunLike = QaRunLike> =
  | { kind: 'ok'; runs: T[] }
  | { kind: 'not-ok' }
  | { kind: 'invalid-shape' };

/**
 * `body` is whatever `res.json()` produced (or `{}` if it rejected) for the qa-runs list response.
 * `ok` false means the request itself failed (handled separately by the caller using the response's
 * own error message). `ok` true with a non-array body is `invalid-shape`: the caller must surface an
 * error, never silently render an empty list.
 */
export function parseQaRunsResponse<T extends QaRunLike = QaRunLike>(ok: boolean, body: unknown): QaRunsParseResult<T> {
  if (!ok) return { kind: 'not-ok' };
  if (!Array.isArray(body)) return { kind: 'invalid-shape' };
  return { kind: 'ok', runs: body as T[] };
}
