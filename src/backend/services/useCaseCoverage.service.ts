/**
 * Use case coverage (T-2-11, PLAN "Coverage grid": "`GET /use-cases/:id/coverage` unions the
 * grids of the events its requirements reference"). This is the requirement-level summary that
 * `GET /use-cases/:id/coverage` returns today; the full per-event grid (`src/domain/coverage.ts`)
 * is built in T-2-08 and this endpoint's shape is additive to it, not a replacement.
 *
 * For each requirement, "satisfied" means at least one observation in a non-archived run
 * (D-21 comparison scope) demonstrates it:
 *  - `event`/`event_property`: an observation resolved to the requirement's `event_id` (any
 *    variant, or none), and for `event_property` the property's payload key is present in that
 *    observation's raw properties.
 *  - `variant`/`variant_property`: an observation resolved to the requirement's `variant_id`
 *    specifically, and for `variant_property` the property's payload key is present.
 *  - `customer_property`: not observable from event payloads in this data model (observations
 *    carry event properties, not the customer profile) -- always reported unsatisfied with
 *    `observation_count: 0`, so the caller can render it distinctly from "checked and missing".
 * A requirement whose target was removed (`status: 'gap'`, ids nulled, see
 * `requirement.dal.ts`'s `markRequirementsGap*`) is always unsatisfied.
 */
import * as RequirementDAL from '../dal/requirement.dal';
import * as ObservationDAL from '../dal/observation.dal';
import { getEventWithProperties } from '../dal/event.dal';
import { listVariantsByProject } from '../dal/variant.dal';

export interface UseCaseCoverageRow {
  requirement_id: string;
  target_kind: string;
  level: string;
  status: string | null;
  satisfied: boolean;
  observation_count: number;
}

export interface UseCaseCoverage {
  rows: UseCaseCoverageRow[];
  satisfied_count: number;
  total_count: number;
}

/** `payload_key` (or the property's own name, falling back to the id) of a property linked to an event, or `null` when it is not linked. */
function resolvePayloadKey(projectId: string, eventId: string, propertyId: string): string | null {
  const { properties } = getEventWithProperties(projectId, eventId);
  const link = properties.find((p) => p.property_id === propertyId);
  if (!link) return null;
  return link.payload_key ?? link.property.name;
}

export function computeUseCaseCoverage(projectId: string, useCaseId: string): UseCaseCoverage {
  const requirements = RequirementDAL.listRequirements(projectId, useCaseId);
  const observations = ObservationDAL.listObservationsInScope(projectId);
  const variantEventId = new Map(listVariantsByProject(projectId).map((v) => [v.id, v.event_id]));

  const rows: UseCaseCoverageRow[] = requirements.map((req) => {
    let matching = observations;
    let payloadKey: string | null = null;

    if (req.target_kind === 'customer_property') {
      return {
        requirement_id: req.id,
        target_kind: req.target_kind,
        level: req.level,
        status: req.status,
        satisfied: false,
        observation_count: 0,
      };
    }

    if (req.target_kind === 'event' || req.target_kind === 'event_property') {
      if (!req.event_id) {
        return { requirement_id: req.id, target_kind: req.target_kind, level: req.level, status: req.status, satisfied: false, observation_count: 0 };
      }
      matching = observations.filter((o) => o.event_id === req.event_id);
      if (req.target_kind === 'event_property' && req.property_id) {
        payloadKey = resolvePayloadKey(projectId, req.event_id, req.property_id);
      }
    } else {
      // variant | variant_property
      if (!req.variant_id) {
        return { requirement_id: req.id, target_kind: req.target_kind, level: req.level, status: req.status, satisfied: false, observation_count: 0 };
      }
      matching = observations.filter((o) => o.variant_id === req.variant_id);
      if (req.target_kind === 'variant_property' && req.property_id) {
        const eventId = variantEventId.get(req.variant_id);
        payloadKey = eventId ? resolvePayloadKey(projectId, eventId, req.property_id) : null;
      }
    }

    if (payloadKey) {
      matching = matching.filter((o) => Object.prototype.hasOwnProperty.call(o.properties_json, payloadKey as string));
    }

    return {
      requirement_id: req.id,
      target_kind: req.target_kind,
      level: req.level,
      status: req.status,
      satisfied: matching.length > 0,
      observation_count: matching.length,
    };
  });

  return {
    rows,
    satisfied_count: rows.filter((r) => r.satisfied).length,
    total_count: rows.length,
  };
}
