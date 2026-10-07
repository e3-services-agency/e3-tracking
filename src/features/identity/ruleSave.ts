/**
 * Pure helpers of the identity rule editor (T-4-32): which request a save sends, and which source an
 * event-mode rule takes. Kept apart from the component so they are unit tested.
 */

/** A new rule POSTs once; once it exists (the id of the created rule is known) every save PATCHes it. */
export function resolveSaveTarget(baseUrl: string, ruleId: string | null): { method: 'POST' | 'PATCH'; url: string } {
  return ruleId === null ? { method: 'POST', url: baseUrl } : { method: 'PATCH', url: `${baseUrl}/${ruleId}` };
}

/**
 * Source of a rule set by an event: the hand-set source when it is one of the event's sources, else the
 * event's first source; an event with no source keeps the source already set (never clears it).
 */
export function resolveEventSourceId(
  eventSources: readonly { id: string }[] | undefined,
  currentSourceId: string | null | undefined
): string | null {
  const list = eventSources ?? [];
  if (currentSourceId && list.some((s) => s.id === currentSourceId)) return currentSourceId;
  return list[0]?.id ?? (currentSourceId || null);
}
