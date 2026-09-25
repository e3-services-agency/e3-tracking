/**
 * Unit tests for `parseQaRunsResponse` (fix round FAIL-2; re-sweep finding 1): the pure "is this a
 * valid runs list" decision extracted from `QaRuns.tsx`. A 200 with a non-array body is an error
 * (`invalid-shape`), not an empty list — see `qaRunsResponse.ts` for why.
 */
import { describe, expect, it } from 'vitest';
import { parseQaRunsResponse } from './qaRunsResponse';

describe('parseQaRunsResponse', () => {
  it('returns the array as-is for a 200 with a JSON array body', () => {
    const body = [{ id: 'run-1' }, { id: 'run-2' }];
    expect(parseQaRunsResponse(true, body)).toEqual({ kind: 'ok', runs: body });
  });

  it('is invalid-shape for a 200 with a non-array body (e.g. {} from a JSON parse failure)', () => {
    expect(parseQaRunsResponse(true, {})).toEqual({ kind: 'invalid-shape' });
  });

  it('is invalid-shape for a 200 with null/undefined bodies', () => {
    expect(parseQaRunsResponse(true, null)).toEqual({ kind: 'invalid-shape' });
    expect(parseQaRunsResponse(true, undefined)).toEqual({ kind: 'invalid-shape' });
  });

  it('is not-ok for a non-ok response even if the body happens to be an array', () => {
    expect(parseQaRunsResponse(false, [{ id: 'run-1' }])).toEqual({ kind: 'not-ok' });
  });
});
