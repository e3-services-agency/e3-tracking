/**
 * Carried by (D-67, T-4-32): the pure diff behind the rule editor's checklist and
 * `PUT /identity-rules/:id/carried-by`. Given the events a rule should be carried by, it returns the
 * events whose `identifiers_json` must change and their new value. Pure; no server imports.
 */
import {
  candidateNames,
  deriveEventIdentifiers,
  effectiveEventIdentifiers,
  type IdentifierLike,
  type IdentifierEventLike,
  type IdentifierSourceLike,
  type IdentityRuleLike,
} from './identifiers';

export interface CarriedByChange {
  event_id: string;
  /** The new explicit list, or `null` when the result equals the derived default (the override is cleared). */
  identifiers: string[] | null;
}

/**
 * Changes needed so that exactly `selectedEventIds` carry `identifierName`. An event whose effective
 * list already agrees is left alone (derived stays derived: no write). Otherwise its new list is its
 * current effective list plus or minus the name, in rule order; a list equal to the derived default
 * is `null`; an empty result is an explicit `[]`.
 */
export function diffCarriedBy(
  identifierName: string,
  selectedEventIds: ReadonlySet<string>,
  events: readonly IdentifierEventLike[],
  rules: readonly IdentityRuleLike[],
  sources?: readonly IdentifierSourceLike[],
  registry?: readonly IdentifierLike[]
): CarriedByChange[] {
  const changes: CarriedByChange[] = [];
  for (const event of events) {
    const current = effectiveEventIdentifiers(event, rules, sources, registry);
    const carries = current.includes(identifierName);
    const wanted = selectedEventIds.has(event.id);
    if (carries === wanted) continue;
    const next = new Set(wanted ? [...current, identifierName] : current.filter((n) => n !== identifierName));
    const ordered = candidateNames(rules, registry ?? []).filter((n) => next.has(n));
    const derived = deriveEventIdentifiers(event, rules, sources, registry);
    const sameAsDerived = ordered.length === derived.length && ordered.every((n, i) => n === derived[i]);
    // D-67 amendment 2: null only when the result equals the derived default; an empty result is an explicit [].
    const value = sameAsDerived ? null : ordered;
    const stored = event.identifiers_json ?? null;
    const unchanged = value === null ? stored === null : stored !== null && stored.length === value.length && stored.every((n, i) => n === value[i]);
    if (!unchanged) changes.push({ event_id: event.id, identifiers: value });
  }
  return changes;
}
