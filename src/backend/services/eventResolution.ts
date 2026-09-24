/**
 * Shared event/variant resolution (T-1-09 fix round, ERROR 1: extracted out of
 * `customerEventsExportImport.service.ts` so `comparison.service.ts` can re-resolve every
 * observation in scope against the *current* definitions on every recompute, not just once at
 * import time). Resolves an event by exact name match against the raw observed `event_type`, then
 * its variant by evaluating the event's discriminator conditions against the raw payload, keyed
 * through each discriminator's `payload_key`/name (`evaluateVariant` itself keys by `property_id`,
 * see `src/domain/variants.ts`'s header comment).
 */
import * as EventDAL from '../dal/event.dal';
import { listVariants } from '../dal/variant.dal';
import { evaluateVariant, type VariantCondition } from '../../domain/variants';

export interface EventResolution {
  event_id: string | null;
  variant_id: string | null;
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
  if (discriminators.length === 0) return { event_id: event.id, variant_id: null };

  const keyed: Record<string, unknown> = {};
  for (const link of discriminators) {
    const payloadKey = link.payload_key ?? link.property.name;
    keyed[link.property_id] = properties[payloadKey];
  }

  const variants = listVariants(projectId, event.id);
  for (const variant of variants) {
    if (evaluateVariant(variant.conditions_json as VariantCondition[], keyed)) {
      return { event_id: event.id, variant_id: variant.id };
    }
  }
  return { event_id: event.id, variant_id: null };
}
