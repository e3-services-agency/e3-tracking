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

/**
 * The sdk_call a rule saves and previews (T-4-35 QA): a standalone identify call with no explicit
 * choice defaults to `identify` for a hard identifier; an explicit choice is kept; no mode, no call.
 */
export function resolveSdkCall(mode: 'none' | 'event' | 'standalone' | string, sdkCall: string, identityType: string): string | null {
  if (mode === 'none') return null;
  if (sdkCall) return sdkCall;
  return mode === 'standalone' && identityType === 'hard' ? 'identify' : null;
}

/** The type of a new identifier whose typed name matches a registry entry follows that entry (case-insensitive). */
export function effectiveNewIdentifierType(
  registry: readonly { name: string; type: string }[],
  typedName: string,
  chosenType: string
): { type: string; joinsExisting: boolean } {
  const found = registry.find((i) => i.name.toLowerCase() === typedName.trim().toLowerCase());
  return found ? { type: found.type, joinsExisting: true } : { type: chosenType, joinsExisting: false };
}
