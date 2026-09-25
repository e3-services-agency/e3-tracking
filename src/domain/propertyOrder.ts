/**
 * Pure display-order merge for the Properties page (fix round point 3, T-1-EXIT re-sweep 02:16
 * FAIL): while the property editor sheet is (really, visually) open, a save re-fetches `properties`
 * (server-sorted by name) and can move the just-edited row to a new alphabetical position — e.g.
 * renaming "action" to "zzz_action" moves it to the bottom. `mergeFrozenOrder` keeps the previous
 * on-screen order for every id still present, appends ids that are genuinely new (created while the
 * sheet was open) at the end, and silently drops ids that no longer exist (deleted). The caller
 * re-syncs to the server's natural order once the sheet actually closes by simply not calling this
 * helper (see `Properties.tsx`).
 */
export function mergeFrozenOrder(previousOrder: string[], currentIds: string[]): string[] {
  const currentSet = new Set(currentIds);
  const kept = previousOrder.filter((id) => currentSet.has(id));
  const keptSet = new Set(kept);
  const added = currentIds.filter((id) => !keptSet.has(id));
  return [...kept, ...added];
}
