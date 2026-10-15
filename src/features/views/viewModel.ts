/**
 * Pure helpers of the shared views (T-5-40): table density remembered per browser, search and
 * filter matching, and filter options. No React, so the unit tests import it directly.
 */

export type Density = 'compact' | 'comfortable';
export const DENSITIES: readonly Density[] = ['compact', 'comfortable'];
export const DENSITY_STORAGE_KEY = 'e3.views.density';
export const DEFAULT_DENSITY: Density = 'comfortable';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** The remembered density; the default when storage is missing, blocked or holds anything else. */
export function readDensity(storage: ReadableStorage | null | undefined): Density {
  try {
    const value = storage?.getItem(DENSITY_STORAGE_KEY);
    return value === 'compact' || value === 'comfortable' ? value : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

/** Best effort: a private window or blocked site data just forgets the choice. */
export function writeDensity(storage: WritableStorage | null | undefined, density: Density): void {
  try {
    storage?.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Storage unavailable: the table still works with the in-memory choice.
  }
}

/** `localStorage`, or `null` when the accessor itself throws (sandboxed frames, blocked data). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Case-insensitive substring match over every given field; an empty needle matches everything. */
export function matchesSearch(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return fields.some((f) => !!f && f.toLowerCase().includes(n));
}

/** `''` means "all". A row value that is a list matches when any element equals the filter. */
export function matchesFilter(filter: string, value: string | null | undefined | readonly string[]): boolean {
  if (!filter) return true;
  if (Array.isArray(value)) return value.includes(filter);
  return value === filter;
}

/** Sorted distinct non-empty values, for a filter select built from the rows themselves. */
export function filterOptions<T>(rows: readonly T[], get: (row: T) => string | null | undefined | readonly string[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const v = get(row);
    for (const item of Array.isArray(v) ? v : [v]) if (item) out.add(item as string);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Known values first in their given order, then any other value the rows carry. */
export function withKnownOrder(known: readonly string[], present: readonly string[]): string[] {
  return [...known, ...present.filter((v) => !known.includes(v))];
}
