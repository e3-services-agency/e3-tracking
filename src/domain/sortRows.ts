/**
 * Pure, stable column sort for the main tables (T-4-24, item 7). Empty values (null, undefined,
 * empty string) always sort last regardless of direction; strings compare case-insensitively with
 * natural number order; equal keys keep their original order.
 */
export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | boolean | null | undefined;

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === '';
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(rows: readonly T[], accessor: ((row: T) => SortValue) | null, dir: SortDir): T[] {
  if (!accessor) return [...rows];
  const factor = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((x, y) => {
      const xe = isEmpty(x.value);
      const ye = isEmpty(y.value);
      if (xe || ye) return xe && ye ? x.index - y.index : xe ? 1 : -1;
      return compareValues(x.value, y.value) * factor || x.index - y.index;
    })
    .map((entry) => entry.row);
}
