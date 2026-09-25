/**
 * Shared event/variant resolution (T-1-09 fix round, ERROR 1: extracted out of
 * `customerEventsExportImport.service.ts` so `comparison.service.ts` can re-resolve every
 * observation in scope against the *current* definitions on every recompute, not just once at
 * import time). Resolves an event by exact name match against the raw observed `event_type`, then
 * its variant by evaluating the event's discriminator conditions against the raw payload, keyed
 * through each discriminator's `payload_key`/name (`evaluateVariant` itself keys by `property_id`,
 * see `src/domain/variants.ts`'s header comment).
 *
 * `createEventResolver` (T-2-11 fix round, WARNING 2) is the cached, per-call form:
 * `useCaseCoverage.service.ts` calls `resolveEventAndVariant` once per in-scope observation, and
 * each call re-ran `listEvents` + `getEventWithProperties` + `listVariants` from scratch (measured:
 * ~8.7 statements per observation, 13k statements / 1.2s for 1500 observations against 4
 * requirements). The events-by-name map and each event's discriminator links/variants only depend
 * on the *definitions*, not the observation, so one resolver instance built at the top of a
 * `computeUseCaseCoverage`/`runComparison` call can serve every observation in that call: event
 * lookup drops to a `Map.get`, and links/variants are loaded at most once per distinct event id.
 * Cost is now O(events + variants in the project), not O(observations); resolving each individual
 * observation is still O(discriminators for its event), same as before. `resolveEventAndVariant`
 * stays as the uncached one-shot form (comparison.service.ts's `buildEngineObservations` could be
 * migrated to `createEventResolver` too, since it has the same per-observation-call shape, but that
 * is not part of this fix round).
 */
import * as EventDAL from '../dal/event.dal';
import { listVariants } from '../dal/variant.dal';
import { evaluateVariant, type VariantCondition } from '../../domain/variants';
import type { EventWithCounts, EventPropertyWithDetails } from '../dal/event.dal';
import type { VariantRow } from '../dal/variant.dal';

export interface EventResolution {
  event_id: string | null;
  variant_id: string | null;
}

/** Resolves `properties` (keyed by `payload_key`/property name) against `event`'s discriminators and variants. */
function resolveVariantFor(
  event: EventWithCounts,
  discriminatorLinks: EventPropertyWithDetails[],
  variants: VariantRow[],
  properties: Record<string, unknown>
): EventResolution {
  if (discriminatorLinks.length === 0) return { event_id: event.id, variant_id: null };

  const keyed: Record<string, unknown> = {};
  for (const link of discriminatorLinks) {
    const payloadKey = link.payload_key ?? link.property.name;
    keyed[link.property_id] = properties[payloadKey];
  }

  for (const variant of variants) {
    if (evaluateVariant(variant.conditions_json as VariantCondition[], keyed)) {
      return { event_id: event.id, variant_id: variant.id };
    }
  }
  return { event_id: event.id, variant_id: null };
}

export function resolveEventAndVariant(
  projectId: string,
  eventType: string,
  properties: Record<string, unknown>
): EventResolution {
  const event = EventDAL.listEvents(projectId).find((e) => e.name === eventType);
  if (!event) return { event_id: null, variant_id: null };

  const { properties: links } = EventDAL.getEventWithProperties(projectId, event.id);
  const discriminators = links.filter((l) => l.role === 'discriminator');
  const variants = listVariants(projectId, event.id);
  return resolveVariantFor(event, discriminators, variants, properties);
}

/**
 * Builds a cached resolver for one call's worth of repeated `resolveEventAndVariant` lookups (see
 * the module comment): the events-by-name map is built once, and each event's discriminator links
 * and variants are loaded at most once, on first use. Reuse across many `(eventType, properties)`
 * pairs in the same call; do not hold onto the returned function beyond it, since it does not
 * observe later writes to events/variants (definitions do not change mid-request).
 */
export function createEventResolver(
  projectId: string
): (eventType: string, properties: Record<string, unknown>) => EventResolution {
  const eventsByName = new Map(EventDAL.listEvents(projectId).map((e) => [e.name, e]));
  const discriminatorsByEventId = new Map<string, EventPropertyWithDetails[]>();
  const variantsByEventId = new Map<string, VariantRow[]>();

  return (eventType, properties) => {
    const event = eventsByName.get(eventType);
    if (!event) return { event_id: null, variant_id: null };

    let discriminators = discriminatorsByEventId.get(event.id);
    if (!discriminators) {
      const { properties: links } = EventDAL.getEventWithProperties(projectId, event.id);
      discriminators = links.filter((l) => l.role === 'discriminator');
      discriminatorsByEventId.set(event.id, discriminators);
    }

    let variants = variantsByEventId.get(event.id);
    if (!variants) {
      variants = listVariants(projectId, event.id);
      variantsByEventId.set(event.id, variants);
    }

    return resolveVariantFor(event, discriminators, variants, properties);
  };
}
