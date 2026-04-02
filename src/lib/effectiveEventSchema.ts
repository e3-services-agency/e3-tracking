/**
 * Canonical effective-schema resolver for a base event + optional variant (v1).
 * All merge logic lives in `applyVariantOverridesToEffectiveDefinitions` — used by
 * `resolveEffectiveEventSchema` and `mergeEffectiveEventPropertyDefinitions` (overrides-only).
 */
import type {
  EffectiveEventPropertyDefinition,
  EventPropertyPresence,
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

    // Semantic overrides: non-null values replace base effective fields; null/absent → keep cloned base.
    if (delta.description !== undefined && delta.description !== null) {
      existing.effective = { ...existing.effective, description: delta.description };
    }
    if (delta.example_values !== undefined && delta.example_values !== null) {
      existing.effective = { ...existing.effective, example_values: delta.example_values };
    }
    if (delta.enum_values !== undefined && delta.enum_values !== null) {
      existing.effective = { ...existing.effective, enum_values: delta.enum_values };
    }
  }

  return Array.from(byId.values());
}

export function isPropertyRequiredForTrigger(def: EffectiveEventPropertyDefinition): boolean {
  return def.presence === 'always_sent' || def.effective.required === true;
}

/**
 * Same rule as `isPropertyRequiredForTrigger` for attached rows when you only have
 * `event_properties.presence` + `event_property_definitions.required` (no full effective row).
 * Use this for event list / export sorting — not a second source of truth.
 */
export function isAttachedPropertyRequiredForTrigger(
  presence: EventPropertyPresence | null | undefined,
  requiredOverride: boolean | null | undefined
): boolean {
  return presence === 'always_sent' || requiredOverride === true;
}

/** UI / export copy derived from the same rule as `isAttachedPropertyRequiredForTrigger` — no extra business logic. */
export type TriggerRequirementDisplay = {
  requiredForTrigger: boolean;
  /** Primary, prominent status */
  primaryLabel: 'Required for trigger' | 'Optional for trigger';
  /** Secondary sentence (differs from primary when extra context helps) */
  secondaryExplanation: string;
  /** Short note for a narrow “why” column */
  reasonNote: string;
};

function buildTriggerRequirementDisplay(
  requiredForTrigger: boolean,
  fromAlwaysSentPresence: boolean,
  fromDefinitionRequired: boolean
): TriggerRequirementDisplay {
  if (!requiredForTrigger) {
    return {
      requiredForTrigger: false,
      primaryLabel: 'Optional for trigger',
      secondaryExplanation: 'Optional for trigger',
      reasonNote: '—',
    };
  }

  if (fromAlwaysSentPresence && fromDefinitionRequired) {
    return {
      requiredForTrigger: true,
      primaryLabel: 'Required for trigger',
      secondaryExplanation:
        'Required for trigger because presence is Always sent and the event definition is Required',
      reasonNote: 'Always sent; definition',
    };
  }
  if (fromAlwaysSentPresence) {
    return {
      requiredForTrigger: true,
      primaryLabel: 'Required for trigger',
      secondaryExplanation: 'Required for trigger because presence is Always sent',
      reasonNote: 'Always sent',
    };
  }
  if (fromDefinitionRequired) {
    return {
      requiredForTrigger: true,
      primaryLabel: 'Required for trigger',
      secondaryExplanation: 'Required for trigger because event definition is Required',
      reasonNote: 'Event definition',
    };
  }

  return {
    requiredForTrigger: true,
    primaryLabel: 'Required for trigger',
    secondaryExplanation: 'Required for trigger',
    reasonNote: '—',
  };
}

export function describeAttachedTriggerRequirement(
  presence: EventPropertyPresence | null | undefined,
  requiredOverride: boolean | null | undefined
): TriggerRequirementDisplay {
  return buildTriggerRequirementDisplay(
    isAttachedPropertyRequiredForTrigger(presence, requiredOverride),
    presence === 'always_sent',
    requiredOverride === true
  );
}

export function describeEffectiveTriggerRequirement(
  def: EffectiveEventPropertyDefinition
): TriggerRequirementDisplay {
  return buildTriggerRequirementDisplay(
    isPropertyRequiredForTrigger(def),
    def.presence === 'always_sent',
    def.effective.required === true
  );
}

/** Stable sort: required-for-trigger first, then original order. */
export function sortEffectiveDefinitionsForTriggerDisplay(
  defs: EffectiveEventPropertyDefinition[]
): EffectiveEventPropertyDefinition[] {
  const indexed = defs.map((d, i) => ({ d, i }));
  indexed.sort((a, b) => {
    const ar = isPropertyRequiredForTrigger(a.d) ? 0 : 1;
    const br = isPropertyRequiredForTrigger(b.d) ? 0 : 1;
    if (ar !== br) return ar - br;
    return a.i - b.i;
  });
  return indexed.map(({ d }) => d);
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
