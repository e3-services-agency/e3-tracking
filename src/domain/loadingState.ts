/**
 * Pure list-loading display state (fix round point 2, T-1-EXIT re-sweep 02:16 FAIL): shared by
 * StandardEvents/QaRuns/Findings so a page never shows its empty-state text ("No QA runs yet", "No
 * findings match these filters") until a load has actually completed with zero rows, and never
 * blanks out rows it already has just because a reload started (SPA navigation, project switch,
 * filter change) — the reload's own loading indicator/spinner covers that instead.
 */
export function showLoadingPlaceholder(isLoading: boolean, rowCount: number): boolean {
  return isLoading && rowCount === 0;
}

export function showEmptyState(isLoading: boolean, rowCount: number): boolean {
  return !isLoading && rowCount === 0;
}
