/**
 * Shared lookup/link helpers for the two Bloomreach import services (T-1-08:
 * `dataMappingImport.service.ts`, `expirationSettingsImport.service.ts`). Both planners build
 * their proposed writes by name (Bloomreach JSON has no ids), so "does this already exist" is
 * always a by-name lookup through the DAL, never a raw id.
 */
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import { listVariants } from '../dal/variant.dal';
import { ConflictError } from '../errors';
import type { VariantCondition } from '../../domain/variants';

export function findEventByName(projectId: string, name: string): EventDAL.EventRow | null {
  return EventDAL.listEvents(projectId).find((e) => e.name === name) ?? null;
}

export function findPropertyByName(
  projectId: string,
  scope: 'event' | 'customer',
  name: string
): PropertyDAL.PropertyRow | null {
  return PropertyDAL.listProperties(projectId, { scope }).find((p) => p.name === name) ?? null;
}

/** Attaches `propertyId` to `eventId` with `role` unless already linked (in any role — an existing link is never touched here). */
export function ensureLinked(
  projectId: string,
  eventId: string,
  propertyId: string,
  role: 'discriminator' | 'normal'
): void {
  const { properties } = EventDAL.getEventWithProperties(projectId, eventId);
  if (properties.some((p) => p.property_id === propertyId)) return;
  try {
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyId, role });
  } catch (err) {
    if (err instanceof ConflictError) return; // already attached (race with an earlier step in the same apply)
    throw err;
  }
}

function sameValues(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/**
 * Finds an existing variant of `eventId` whose conditions match `filter` (compared by resolved
 * property *name*, since Bloomreach JSON never carries a property id). Returns `null` when no
 * variant matches.
 */
export function findMatchingVariant(
  projectId: string,
  eventId: string,
  filter: { property: string; operator: string; values: string[] }[]
): { id: string; name: string } | null {
  if (filter.length === 0) return null;
  const variants = listVariants(projectId, eventId);
  for (const variant of variants) {
    if (variant.conditions_json.length !== filter.length) continue;
    const match = filter.every((cond) =>
      variant.conditions_json.some((c: VariantCondition) => {
        const propName = resolvePropertyName(projectId, c.property_id);
        return propName === cond.property && c.operator === cond.operator && sameValues(c.values, cond.values);
      })
    );
    if (match) return { id: variant.id, name: variant.name };
  }
  return null;
}

/**
 * Always reads the current name from the DAL (fix round ERROR 4): a process-lifetime cache here
 * used to survive a rename between two imports in the same server process — `action` renamed to
 * `cart_action` between paste #1 and paste #2 kept resolving to the stale name `action`, so
 * `findMatchingVariant` (which compares by *name*, not id, since Bloomreach JSON has no ids) never
 * matched the already-existing variant, proposed a duplicate `create variant`, and then — because
 * `createVariant`'s resulting `ConflictError` is swallowed — silently upserted the standard event
 * mapping with `variant_id: null` instead. `getPropertyById` is an indexed single-row lookup, so
 * paying it again per condition per plan build is not worth caching incorrectly for.
 */
function resolvePropertyName(projectId: string, propertyId: string): string | null {
  return PropertyDAL.getPropertyById(projectId, propertyId)?.name ?? null;
}
