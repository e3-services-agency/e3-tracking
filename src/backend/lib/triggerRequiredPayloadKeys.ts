import { isPropertyRequiredForTrigger } from '../../lib/effectiveEventSchema';
import { listPayloadKeyPropertyBindingsForEvent } from '../dal/event.dal';
import { listEffectiveEventPropertyDefinitionsWithVariant } from '../dal/event-property-definition.dal';

/**
 * Payload keys required for QA / trigger validation: merged effective schema + bindings.
 */
export async function getTriggerRequiredPayloadKeysForEvent(
  workspaceId: string,
  eventId: string,
  variantId?: string | null
): Promise<string[]> {
  const merged = await listEffectiveEventPropertyDefinitionsWithVariant(workspaceId, eventId, {
    variantId: variantId ?? undefined,
  });
  const bindings = await listPayloadKeyPropertyBindingsForEvent(workspaceId, eventId);
  const pidToKey = new Map(bindings.map((b) => [b.property_id, b.payload_key]));
  const keys: string[] = [];
  for (const def of merged) {
    if (!isPropertyRequiredForTrigger(def)) continue;
    const k = pidToKey.get(def.property_id);
    if (k) keys.push(k);
  }
  return keys;
}
