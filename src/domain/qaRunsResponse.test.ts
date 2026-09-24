/**
 * Unit tests for `parseQaRunsResponse` (fix round FAIL-2): the pure "is this a valid runs list"
 * decision extracted from `QaRuns.tsx`.
 */
import { describe, expect, it } from 'vitest';
import { parseQaRunsResponse } from './qaRunsResponse';

describe('parseQaRunsResponse', () => {
  it('returns the array as-is for a 200 with a JSON array body', () => {
    const body = [{ id: 'run-1' }, { id: 'run-2' }];
    expect(parseQaRunsResponse(true, body)).toEqual(body);
  });

  it('returns [] for a 200 with a non-array body (e.g. {} from a JSON parse failure)', () => {
    expect(parseQaRunsResponse(true, {})).toEqual([]);
  });

  it('returns [] for a non-ok response even if the body happens to be an array', () => {
    expect(parseQaRunsResponse(false, [{ id: 'run-1' }])).toEqual([]);
  });

  it('returns [] for null/undefined bodies', () => {
    expect(parseQaRunsResponse(true, null)).toEqual([]);
    expect(parseQaRunsResponse(true, undefined)).toEqual([]);
  });
});
