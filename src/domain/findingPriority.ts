/**
 * Finding priority (D-89, T-5-47): a pure, deterministic and explainable P1-P4 for every finding,
 * from its severity and the business tier of its event. Derived at read time on the backend and
 * never stored (an event's priority, implementation method, use case status and requirements are
 * all mutable), except the frozen copy inside an immutable QA report item.
 *
 * Business tier, highest first (only the highest one sets the priority; every tier that holds is
 * named in `reasons`):
 * - `transactional`: the event's effective implementation method is `server_api` (data sent from the
 *   client's backend through the Tracking API: purchase, purchase_item, refund-like, consent).
 * - `required`: a level `R` requirement of a use case that is not `dropped` targets the event, one
 *   of its variants, or the finding's property on that event (`event_property`/`variant_property`).
 * - `important`: the event's priority is `critical` or `high`.
 * - `normal`: everything else, including project-level findings with no event.
 *
 * Matrix (severity x tier): error = P1 transactional/required, P2 otherwise; warning = P2
 * transactional, P3 required/important, P4 normal; info = P3 transactional, P4 otherwise.
 *
 * `rank` is one integer for sorting (lower first): priority, then severity, then tier, then event
 * priority, then `finding_sequence`. Reasons name only data the public tracking document already
 * carries (severity, use case codes, the event priority value), so they are safe on share routes.
 *
 * No server or database imports; `src/backend/services/findingPriority.service.ts` loads the inputs
 * in a few batched queries and calls `buildFindingPriorityContext`.
 */
import { defaultImplementationMethod } from './codegen/defaults';
import type { FindingPriority, FindingPriorityTier } from './enums';

export interface FindingPriorityResult {
  priority: FindingPriority;
  rank: number;
  reasons: string[];
  tier: FindingPriorityTier;
}

/** The finding fields the rule reads. */
export interface FindingPriorityInput {
  severity: string;
  event_id: string | null;
  property_id: string | null;
  finding_sequence?: number | null;
}

export interface FindingPriorityEventFacts {
  name: string;
  class?: string | null;
  priority: string | null;
  implementation_method: string | null;
}

export interface FindingPriorityContext {
  events: Map<string, FindingPriorityEventFacts>;
  /** Use case labels of live R requirements on the event itself or any of its variants. */
  requiredByEvent: Map<string, string[]>;
  /** Use case labels of live R requirements on a property of the event (`event_property`, or `variant_property` on one of its variants), keyed by `eventPropertyKey`. */
  requiredByEventProperty: Map<string, string[]>;
}

/** Raw rows `buildFindingPriorityContext` needs; a subset of the DAL rows. */
export interface FindingPriorityContextInput {
  events: ({ id: string } & FindingPriorityEventFacts)[];
  variants: { id: string; event_id: string }[];
  useCases: { id: string; code: string | null; name: string; status: string | null }[];
  requirements: {
    use_case_id: string;
    target_kind: string;
    level: string;
    event_id: string | null;
    variant_id: string | null;
    property_id: string | null;
  }[];
}

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };
const TIER_ORDER: Record<FindingPriorityTier, number> = { transactional: 0, required: 1, important: 2, normal: 3 };
const EVENT_PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const MISSING_EVENT_PRIORITY = 4;
const PRIORITY_ORDER: Record<FindingPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
/** `finding_sequence` occupies the low digits of the rank; a missing one sorts last. */
const SEQUENCE_SLOTS = 10_000_000;
const MAX_LISTED_USE_CASES = 3;

export function eventPropertyKey(eventId: string, propertyId: string): string {
  return `${eventId}\u0000${propertyId}`;
}

/** The stored method, or the default rule for a row that has none (the column is NOT NULL since 0025). */
export function effectiveImplementationMethod(event: FindingPriorityEventFacts): string {
  return event.implementation_method ?? defaultImplementationMethod(event.name, event.class);
}

function pushLabel(map: Map<string, string[]>, key: string, label: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [label]);
  else if (!list.includes(label)) list.push(label);
}

const byLabel = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

export function buildFindingPriorityContext(input: FindingPriorityContextInput): FindingPriorityContext {
  const events = new Map(input.events.map((e) => [e.id, { name: e.name, class: e.class ?? null, priority: e.priority, implementation_method: e.implementation_method }]));
  const eventIdByVariantId = new Map(input.variants.map((v) => [v.id, v.event_id]));
  const labelByUseCaseId = new Map(
    input.useCases.filter((uc) => uc.status !== 'dropped').map((uc) => [uc.id, uc.code?.trim() || uc.name])
  );
  const requiredByEvent = new Map<string, string[]>();
  const requiredByEventProperty = new Map<string, string[]>();
  for (const r of input.requirements) {
    if (r.level !== 'R') continue;
    const label = labelByUseCaseId.get(r.use_case_id);
    if (label === undefined) continue;
    const eventId = r.event_id ?? (r.variant_id ? eventIdByVariantId.get(r.variant_id) ?? null : null);
    if (!eventId) continue;
    if (r.target_kind === 'event' || r.target_kind === 'variant') pushLabel(requiredByEvent, eventId, label);
    else if ((r.target_kind === 'event_property' || r.target_kind === 'variant_property') && r.property_id) {
      pushLabel(requiredByEventProperty, eventPropertyKey(eventId, r.property_id), label);
    }
  }
  for (const list of requiredByEvent.values()) list.sort(byLabel);
  for (const list of requiredByEventProperty.values()) list.sort(byLabel);
  return { events, requiredByEvent, requiredByEventProperty };
}

function priorityFor(severity: string, tier: FindingPriorityTier): FindingPriority {
  if (severity === 'error') return tier === 'transactional' || tier === 'required' ? 'P1' : 'P2';
  if (severity === 'warning') return tier === 'transactional' ? 'P2' : tier === 'normal' ? 'P4' : 'P3';
  return tier === 'transactional' ? 'P3' : 'P4';
}

function severityReason(severity: string): string {
  if (severity === 'error') return 'Error: blocks certification';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}

function listUseCases(labels: string[]): string {
  const shown = labels.slice(0, MAX_LISTED_USE_CASES).join(', ');
  return labels.length > MAX_LISTED_USE_CASES ? `${shown} +${labels.length - MAX_LISTED_USE_CASES}` : shown;
}

export function computeFindingPriority(finding: FindingPriorityInput, context: FindingPriorityContext): FindingPriorityResult {
  const event = finding.event_id ? context.events.get(finding.event_id) : undefined;
  const transactional = !!event && effectiveImplementationMethod(event) === 'server_api';
  const requiredLabels: string[] = [];
  if (event && finding.event_id) {
    for (const label of context.requiredByEvent.get(finding.event_id) ?? []) requiredLabels.push(label);
    if (finding.property_id) {
      for (const label of context.requiredByEventProperty.get(eventPropertyKey(finding.event_id, finding.property_id)) ?? []) {
        if (!requiredLabels.includes(label)) requiredLabels.push(label);
      }
    }
    requiredLabels.sort(byLabel);
  }
  const eventPriority = event?.priority ?? null;
  const important = eventPriority === 'critical' || eventPriority === 'high';
  const tier: FindingPriorityTier = transactional ? 'transactional' : requiredLabels.length > 0 ? 'required' : important ? 'important' : 'normal';
  const priority = priorityFor(finding.severity, tier);

  const reasons = [severityReason(finding.severity)];
  if (transactional) reasons.push('Transactional backend event');
  if (requiredLabels.length > 0) reasons.push(`Required by ${listUseCases(requiredLabels)}`);
  if (important) reasons.push(`Event priority ${eventPriority}`);

  const severityOrder = SEVERITY_ORDER[finding.severity] ?? 2;
  const eventPriorityOrder = (eventPriority !== null ? EVENT_PRIORITY_ORDER[eventPriority] : undefined) ?? MISSING_EVENT_PRIORITY;
  const sequence = finding.finding_sequence;
  const sequenceOrder =
    typeof sequence === 'number' && Number.isInteger(sequence) && sequence >= 0 ? Math.min(sequence, SEQUENCE_SLOTS - 1) : SEQUENCE_SLOTS - 1;
  const bucket = ((PRIORITY_ORDER[priority] * 3 + severityOrder) * 4 + TIER_ORDER[tier]) * 5 + eventPriorityOrder;
  return { priority, rank: bucket * SEQUENCE_SLOTS + sequenceOrder, reasons, tier };
}

/** The additive fields every finding-carrying response gains (D-89). */
export interface FindingPriorityFields {
  priority: FindingPriority;
  priority_rank: number;
  priority_reasons: string[];
}

export function findingPriorityFields(finding: FindingPriorityInput, context: FindingPriorityContext): FindingPriorityFields {
  const { priority, rank, reasons } = computeFindingPriority(finding, context);
  return { priority, priority_rank: rank, priority_reasons: reasons };
}

/** Parses a `?priority=P1,P2` style filter. `null` for an empty value; throws on an unknown value. */
export function parseFindingPriorityFilter(raw: string | readonly string[] | null | undefined): Set<FindingPriority> | null {
  if (raw === null || raw === undefined) return null;
  const parts = (Array.isArray(raw) ? raw : [raw as string]).flatMap((v) => String(v).split(',')).map((v) => v.trim().toUpperCase()).filter(Boolean);
  if (parts.length === 0) return null;
  const out = new Set<FindingPriority>();
  for (const p of parts) {
    if (!Object.hasOwn(PRIORITY_ORDER, p)) throw new RangeError(`Unknown priority "${p}"; use P1, P2, P3 or P4.`);
    out.add(p as FindingPriority);
  }
  return out;
}
