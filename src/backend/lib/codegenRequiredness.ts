/**
 * Aligns codegen snippet requiredness with Event Properties / effective definitions
 * (including variant overrides), used by shared journey JSON and HTML export.
 */
import type { EventPropertyPresence } from '../../types/schema';
import {
  isAttachedPropertyRequiredForTrigger,
  isPropertyRequiredForTrigger,
} from '../../lib/effectiveEventSchema';
import { listEffectiveEventPropertyDefinitionsWithVariant } from '../dal/event-property-definition.dal';
import { NotFoundError } from '../errors';

export type EffectiveListCache = Map<string, Awaited<ReturnType<typeof listEffectiveEventPropertyDefinitionsWithVariant>>>;

function cacheKey(workspaceId: string, eventId: string, variantId: string | null): string {
  return `${workspaceId}\0${eventId}\0${variantId ?? ''}`;
}

/** Cached load of variant-aware effective definitions (falls back to base event if variant is missing). */
export async function loadEffectiveDefinitionsForEventVariant(
  workspaceId: string,
  eventId: string,
  variantId: string | null,
  cache: EffectiveListCache
): Promise<Awaited<ReturnType<typeof listEffectiveEventPropertyDefinitionsWithVariant>>> {
  const k = cacheKey(workspaceId, eventId, variantId);
  const hit = cache.get(k);
  if (hit) return hit;
  let list: Awaited<ReturnType<typeof listEffectiveEventPropertyDefinitionsWithVariant>>;
  try {
    list = await listEffectiveEventPropertyDefinitionsWithVariant(workspaceId, eventId, {
      variantId: variantId ?? undefined,
    });
  } catch (e) {
    if (e instanceof NotFoundError && variantId) {
      list = await listEffectiveEventPropertyDefinitionsWithVariant(workspaceId, eventId, {});
    } else {
      throw e;
    }
  }
  cache.set(k, list);
  return list;
}

type AttachedRowForCodegenFlags = {
  property_id: string;
  presence: EventPropertyPresence | null | undefined;
  property_required_override?: boolean | null;
};

/**
 * For each attached property, true if required for trigger in the sense of
 * `isPropertyRequiredForTrigger` on the effective definition for any of the
 * given variants (OR). If a property never appears in any loaded effective list,
 * falls back to `isAttachedPropertyRequiredForTrigger` from the base row.
 *
 * Empty `variantIds` is treated as `[null]` (base event only, no variant overlay).
 */
export async function computeCodegenRequiredForTriggerByPropertyIds(
  workspaceId: string,
  eventId: string,
  variantIds: ReadonlySet<string | null>,
  rows: AttachedRowForCodegenFlags[],
  effListCache: EffectiveListCache
): Promise<Map<string, boolean>> {
  const ids =
    variantIds.size > 0 ? [...variantIds] : ([null] as (string | null)[]);
  const lists: Awaited<ReturnType<typeof listEffectiveEventPropertyDefinitionsWithVariant>>[] = [];
  for (const vid of ids) {
    lists.push(await loadEffectiveDefinitionsForEventVariant(workspaceId, eventId, vid, effListCache));
  }

  const out = new Map<string, boolean>();
  for (const row of rows) {
    const pid = typeof row.property_id === 'string' ? row.property_id.trim() : '';
    if (!pid) continue;

    let anyListHadDef = false;
    let required = false;
    for (const effectiveList of lists) {
      const def = effectiveList.find((d) => {
        const id = typeof d.property_id === 'string' ? d.property_id.trim() : '';
        return id === pid;
      });
      if (def) {
        anyListHadDef = true;
        if (isPropertyRequiredForTrigger(def)) {
          required = true;
          break;
        }
      }
    }

    if (!anyListHadDef) {
      required = isAttachedPropertyRequiredForTrigger(
        row.presence ?? undefined,
        row.property_required_override
      );
    }

    out.set(pid, required);
  }

  return out;
}
