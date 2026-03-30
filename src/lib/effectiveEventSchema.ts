/**
 * Canonical effective-schema resolver for a base event + optional variant (v1).
 * All merge logic lives in `applyVariantOverridesToEffectiveDefinitions` — used by
 * `resolveEffectiveEventSchema` and `mergeEffectiveEventPropertyDefinitions` (overrides-only).
 */
import type {
  EffectiveEventPropertyDefinition,
  EventVariantOverridesV1,
} from '@/src/types/schema';

function cloneEffective(d: EffectiveEventPropertyDefinition): EffectiveEventPropertyDefinition {
  return {
    ...d,
    property: { ...d.property },
    override: d.override ? { ...d.override } : null,
    effective: { ...d.effective },
    warnings: [...d.warnings],
  };
}

/** Single implementation: deterministic merge; unknown property ids in overrides are ignored. */
function applyVariantOverridesToEffectiveDefinitions(
  base: EffectiveEventPropertyDefinition[],
  overrides: EventVariantOverridesV1 | null | undefined
): EffectiveEventPropertyDefinition[] {
  if (!overrides?.properties || Object.keys(overrides.properties).length === 0) {
    return base.map(cloneEffective);
  }

  const byId = new Map<string, EffectiveEventPropertyDefinition>(
    base.map((d) => [d.property_id, cloneEffective(d)])
  );

  for (const [propertyId, delta] of Object.entries(overrides.properties)) {
    if (!propertyId) continue;

    if (delta.excluded === true) {
      byId.delete(propertyId);
      continue;
    }

    const existing = byId.get(propertyId);
    if (!existing) {
      continue;
    }

    if (delta.presence != null) {
      existing.presence = delta.presence;
    }

    if (delta.required === true) {
      existing.effective = { ...existing.effective, required: true };
      if (existing.presence === 'never_sent') {
        existing.presence = 'sometimes_sent';
      }
    } else if (delta.required === false) {
      existing.effective = { ...existing.effective, required: false };
      if (existing.presence === 'always_sent') {
        existing.presence = 'sometimes_sent';
      }
    }
  }

  return Array.from(byId.values());
}

export function isPropertyRequiredForTrigger(def: EffectiveEventPropertyDefinition): boolean {
  return def.presence === 'always_sent' || def.effective.required === true;
}

/**
 * Resolve merged effective property definitions for a base event + optional persisted variant.
 * When `variant` is null/undefined, returns a clone of the base list (same behavior as no variant).
 */
export function resolveEffectiveEventSchema(
  baseEffectiveDefinitions: EffectiveEventPropertyDefinition[],
  variant: { overrides_json: EventVariantOverridesV1 } | null | undefined
): EffectiveEventPropertyDefinition[] {
  return applyVariantOverridesToEffectiveDefinitions(
    baseEffectiveDefinitions,
    variant?.overrides_json
  );
}

/**
 * Same merge as `resolveEffectiveEventSchema`, but accepts raw overrides JSON (DAL / tests).
 */
export function mergeEffectiveEventPropertyDefinitions(
  base: EffectiveEventPropertyDefinition[],
  overrides: EventVariantOverridesV1 | null | undefined
): EffectiveEventPropertyDefinition[] {
  return applyVariantOverridesToEffectiveDefinitions(base, overrides);
}
