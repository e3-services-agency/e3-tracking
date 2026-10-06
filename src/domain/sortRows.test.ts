import { describe, expect, it } from 'vitest';
import { sortRows } from './sortRows';

describe('sortRows', () => {
  const rows = [
    { id: 1, n: 'b', v: 10 },
    { id: 2, n: 'A', v: null },
    { id: 3, n: 'a10', v: 2 },
    { id: 4, n: 'a9', v: 10 },
  ];
  it('sorts strings case-insensitively with natural numbers, asc and desc', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.id)).toEqual([2, 4, 3, 1]);
    expect(sortRows(rows, (r) => r.n, 'desc').map((r) => r.id)).toEqual([1, 3, 4, 2]);
  });
  it('keeps empty values last in both directions and is stable on ties', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.id)).toEqual([3, 1, 4, 2]);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.id)).toEqual([1, 4, 3, 2]);
  });
  it('returns the original order with no accessor and does not mutate the input', () => {
    const copy = [...rows];
    expect(sortRows(rows, null, 'asc')).toEqual(copy);
    expect(rows).toEqual(copy);
  });
});
