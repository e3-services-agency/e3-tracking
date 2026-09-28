/**
 * Use case coverage (T-2-11, PLAN "Coverage grid": "`GET /use-cases/:id/coverage` unions the
 * grids of the events its requirements reference"). This is the requirement-level summary that
 * `GET /use-cases/:id/coverage` returns today; the full per-event grid (`src/domain/coverage.ts`)
 * is built in T-2-08 and this endpoint's shape is additive to it, not a replacement.
 *
 * For each requirement, "satisfied" means at least one observation in a non-archived run
 * (D-21 comparison scope) demonstrates it:
 * "Resolved" here means resolved *live*, the same way `comparison.service.ts` does (WARNING 2 fix
 * round): each observation's `event_type`/raw properties are matched against the event by name and
 * the variant by evaluating its discriminator conditions (`eventResolution.ts`'s
 * `createEventResolver`, a cached per-call resolver -- events-by-name built once, discriminator
 * links/variants loaded at most once per distinct event id, so this whole function costs
 * O(events + variants in the project) plus O(discriminators) per observation instead of re-running
 * `listEvents`/`getEventWithProperties`/`listVariants` per observation; see that module's header
 * for the measured before/after), not the observation's stored `event_id`/`variant_id` columns,
 * which are only refreshed by a comparison recompute. This way an observation captured before a
 * variant existed (or before an event was linked) still counts as soon as the definitions catch up,
 * with no need to run a comparison first.
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
import { getEventWithProperties, type EventPropertyWithDetails } from '../dal/event.dal';
import { listVariantsByProject } from '../dal/variant.dal';
import { createEventResolver } from './eventResolution';
import type { ObservationRow } from '../dal/observation.dal';

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

interface ResolvedObservation {
  observation: ObservationRow;
  event_id: string | null;
  variant_id: string | null;
}

/**
 * Per-event property-link cache (LOW 7 fix round: `resolvePayloadKey` used to call
 * `getEventWithProperties` once per `*_property` requirement; one requirement matrix has at most a
 * handful of distinct events, so this caches by event id instead).
 */
function buildPayloadKeyResolver(projectId: string): (eventId: string, propertyId: string) => string | null {
  const cache = new Map<string, EventPropertyWithDetails[]>();
  return (eventId, propertyId) => {
    let links = cache.get(eventId);
    if (!links) {
      links = getEventWithProperties(projectId, eventId).properties;
      cache.set(eventId, links);
    }
    const link = links.find((p) => p.property_id === propertyId);
    if (!link) return null;
    return link.payload_key ?? link.property.name;
  };
}

function unsatisfiedRow(req: RequirementDAL.RequirementRow): UseCaseCoverageRow {
  return { requirement_id: req.id, target_kind: req.target_kind, level: req.level, status: req.status, satisfied: false, observation_count: 0 };
}

export function computeUseCaseCoverage(projectId: string, useCaseId: string): UseCaseCoverage {
  const requirements = RequirementDAL.listRequirements(projectId, useCaseId);
  const observations = ObservationDAL.listObservationsInScope(projectId);
  const variantEventId = new Map(listVariantsByProject(projectId).map((v) => [v.id, v.event_id]));
  const resolvePayloadKey = buildPayloadKeyResolver(projectId);

  // WARNING 2 fix round: resolve every observation *live* against current definitions (same
  // resolution `comparison.service.ts` uses), not the observation's stored `event_id`/`variant_id`
  // columns, which are only refreshed by a comparison recompute. `createEventResolver` is built
  // once per call and cached across every observation (see the module comment).
  const resolveEventAndVariant = createEventResolver(projectId);
  const resolved: ResolvedObservation[] = observations.map((o) => {
    const resolution = resolveEventAndVariant(o.event_type, o.properties_json);
    return { observation: o, event_id: resolution.event_id, variant_id: resolution.variant_id };
  });

  const rows: UseCaseCoverageRow[] = requirements.map((req) => {
    // T-3-10 (D-57): `catalog_attribute`/`consent` are, like `customer_property`, never observable
    // from an event payload (observations carry event properties, not catalog data or consent
    // state) -- always reported unsatisfied with `observation_count: 0`.
    if (req.target_kind === 'customer_property' || req.target_kind === 'catalog_attribute' || req.target_kind === 'consent') {
      return unsatisfiedRow(req);
    }

    if (req.status === 'gap') {
      return unsatisfiedRow(req);
    }

    let matching: ResolvedObservation[];
    let payloadKey: string | null = null;

    if (req.target_kind === 'event' || req.target_kind === 'event_property') {
      if (!req.event_id) return unsatisfiedRow(req);
      matching = resolved.filter((r) => r.event_id === req.event_id);
      if (req.target_kind === 'event_property' && req.property_id) {
        payloadKey = resolvePayloadKey(req.event_id, req.property_id);
      }
    } else {
      // variant | variant_property
      if (!req.variant_id) return unsatisfiedRow(req);
      matching = resolved.filter((r) => r.variant_id === req.variant_id);
      if (req.target_kind === 'variant_property' && req.property_id) {
        const eventId = variantEventId.get(req.variant_id);
        payloadKey = eventId ? resolvePayloadKey(eventId, req.property_id) : null;
      }
    }

    if (payloadKey) {
      matching = matching.filter((r) => Object.prototype.hasOwnProperty.call(r.observation.properties_json, payloadKey as string));
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
