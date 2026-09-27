/**
 * document.service tests (T-2-08): the `EventCard` builder on a small hand-built project (one
 * custom event with a discriminator variant, a context property, and observations), certification
 * flip when a property is marked required, the coverage grid, and the certification route's `applicable: false` for an sdk event.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import * as VariantDAL from '../dal/variant.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as RuleDAL from '../dal/rule.dal';
import * as FindingDAL from '../dal/finding.dal';
import { runComparison } from './comparison.service';
import { buildEventCard, computeEventCertification, computeEventCoverageGrid, buildTrackingDocument } from './document.service';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

/** One custom `cart_update` event: `action` discriminator (add/remove), `location` context (web/app), optional `total_price`. */
function setUpCartUpdate(): { eventId: string; totalPricePropertyId: string; actionPropertyId: string; locationPropertyId: string; variantAddId: string } {
  const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });

  const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number', data_formats_json: ['money'] });
  const action = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  });
  const location = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'location',
    data_type: 'string',
    allowed_values_json: [{ value: 'web' }, { value: 'app' }],
  });

  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id, required: false, role: 'normal' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, required: true, role: 'discriminator' });
  EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: location.id, required: false, role: 'context' });

  const variantAdd = VariantDAL.createVariant(projectId, event.id, {
    conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }],
  });

  return { eventId: event.id, totalPricePropertyId: totalPrice.id, actionPropertyId: action.id, locationPropertyId: location.id, variantAddId: variantAdd.id };
}

function addObservation(eventType: string, properties: Record<string, unknown>, timestamp = 1_700_000_000): void {
  const run = QaRunDAL.createQaRun(projectId, { kind: 'manual' });
  ObservationDAL.createObservation(projectId, run.id, { source: 'manual', event_type: eventType, timestamp, properties });
}

describe('buildEventCard', () => {
  it('assembles properties, contexts, variants and certification for a custom event with one observation', () => {
    const { eventId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    runComparison(projectId);

    const card = buildEventCard(projectId, eventId);

    expect(card.name).toBe('cart_update');
    expect(card.class).toBe('custom');
    expect(card.properties.map((p) => p.name).sort()).toEqual(['action', 'location', 'total_price']);
    const totalPriceCard = card.properties.find((p) => p.name === 'total_price');
    expect(totalPriceCard?.required).toBe(false);
    expect(totalPriceCard?.data_type).toBe('number');

    expect(card.contexts).toEqual([
      { property_id: expect.any(String), property: 'location', payload_key: 'location', values: ['web', 'app'] },
    ]);

    expect(card.variants).toHaveLength(1);
    expect(card.variants[0].name).toContain('action');
    expect(card.variants[0].conditions).toEqual([
      { property_id: expect.any(String), property_name: 'action', operator: 'equals', values: ['add'] },
    ]);
    expect(card.variants[0].expected_payload.action).toBe('add');

    expect(card.freshness.observation_count).toBe(1);
    expect(card.freshness.last_observation_at).toBe(1_700_000_000);

    expect(card.certification).toEqual({ applicable: true, certified: true, reasons: [] });

    expect(card.codegen.gtm).toContain('cart_update');
    expect(card.sdk_default_properties).toEqual(['os', 'browser', 'device', 'location']);
  });

  it('is not applicable, and not certified, for an sdk/platform event', () => {
    const event = EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });
    const card = buildEventCard(projectId, event.id);
    expect(card.certification).toEqual({ applicable: false, certified: false, reasons: ['not_applicable'] });

    const certification = computeEventCertification(projectId, event.id);
    expect(certification).toEqual({ applicable: false, certified: false, reasons: ['not_applicable'] });
  });
});

describe('certification flip when total_price is marked required', () => {
  it('stays certified while total_price is optional, flips to not-certified once it is required and missing, and flips back once reverted', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    // The observation never sends total_price (an optional field the fixture-style payload omits).
    addObservation('cart_update', { action: 'add', location: 'web' });
    runComparison(projectId);

    expect(buildEventCard(projectId, eventId).certification.certified).toBe(true);

    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    const blocked = buildEventCard(projectId, eventId).certification;
    expect(blocked.certified).toBe(false);
    expect(blocked.reasons).toContain('open_errors: 1');

    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: false });
    runComparison(projectId);

    expect(buildEventCard(projectId, eventId).certification.certified).toBe(true);
  });
});

describe('D-42 (T-2-09 fix round): manual resolve is an acknowledgement, not a fix', () => {
  it('stays not-certified with acknowledged_errors while the finding is resolved by hand and the fingerprint still reproduces, then re-certifies once the fingerprint stops reproducing', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    runComparison(projectId);
    expect(buildEventCard(projectId, eventId).certification.certified).toBe(true);

    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);
    const blocked = buildEventCard(projectId, eventId).certification;
    expect(blocked.certified).toBe(false);
    expect(blocked.reasons).toEqual(['open_errors: 1']);

    const [finding] = FindingDAL.listFindings(projectId, { event_id: eventId, status: 'open' });
    expect(finding).toBeDefined();
    FindingDAL.setFindingStatus(projectId, finding.id, 'resolved');

    // Recompute while the problem still reproduces: certification does NOT flip to true, and the
    // reason changes from open_errors to acknowledged_errors (D-42 -- acknowledgement, not a fix).
    runComparison(projectId);
    const acknowledged = buildEventCard(projectId, eventId).certification;
    expect(acknowledged.certified).toBe(false);
    expect(acknowledged.reasons).toEqual(['acknowledged_errors: 1']);

    const acknowledgedFinding = FindingDAL.getFindingOrThrow(projectId, finding.id);
    expect(acknowledgedFinding.status).toBe('resolved');
    expect(acknowledgedFinding.resolved_by).toBe('user');

    // Fix the underlying problem: the next recompute no longer reproduces the fingerprint, which
    // clears the acknowledgement marker automatically (resolveStaleFindings, D-42) and the event is
    // certified again.
    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: false });
    runComparison(projectId);
    const restored = buildEventCard(projectId, eventId).certification;
    expect(restored.certified).toBe(true);
    expect(restored.reasons).toEqual([]);

    const clearedFinding = FindingDAL.getFindingOrThrow(projectId, finding.id);
    expect(clearedFinding.status).toBe('resolved');
    expect(clearedFinding.resolved_by).toBeNull();
  });

  it('an explicit reopen (PATCH status=open) also un-acknowledges immediately, without waiting for the fingerprint to stop reproducing', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    const [finding] = FindingDAL.listFindings(projectId, { event_id: eventId, status: 'open' });
    FindingDAL.setFindingStatus(projectId, finding.id, 'resolved');
    runComparison(projectId);
    expect(buildEventCard(projectId, eventId).certification.reasons).toEqual(['acknowledged_errors: 1']);

    FindingDAL.setFindingStatus(projectId, finding.id, 'open');
    expect(buildEventCard(projectId, eventId).certification.reasons).toEqual(['open_errors: 1']);
  });
});

describe('computeEventCoverageGrid', () => {
  it('reports the observed action=add/location=web cell and the unobserved combinations', () => {
    const { eventId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });

    const grid = computeEventCoverageGrid(projectId, eventId);

    expect(grid.rows).toHaveLength(1);
    expect(grid.columns).toHaveLength(1);
    expect(grid.columns[0].values).toEqual(['web', 'app']);
    const observed = grid.cells.find((c) => c.value === 'web');
    expect(observed?.count).toBe(1);
    expect(grid.unobserved).toContainEqual({ row: grid.rows[0].variant_id as string, property_id: grid.columns[0].property_id, value: 'app' });
  });
});

describe('buildTrackingDocument', () => {
  it('lists custom events before sdk/platform events and carries the project money tolerance', () => {
    setUpCartUpdate();
    EventDAL.createEvent(projectId, { name: 'session_start', class: 'sdk' });

    const doc = buildTrackingDocument(projectId);
    expect(doc.format).toBe('e3-tracking-document');
    expect(doc.version).toBe(1);
    expect(doc.events.map((e) => e.name)).toEqual(['cart_update', 'session_start']);
    expect(doc.project.money_tolerance).toEqual({ percent: 1, floor: 0.01 });
  });
});

// ---------------------------------------------------------------------------
// T-2-08 fix round (2026-09-25 17:04 reviewer FAIL, D-40 Q9 supervisor DECISION)
// ---------------------------------------------------------------------------

describe('EventCard.findings (ERROR 1 fix round: D-40 Q9)', () => {
  it('carries every open finding for the event, uncapped, with property/message/expected/actual/qa_run_id/timestamps resolved', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    const card = buildEventCard(projectId, eventId);
    expect(card.quality.open.error).toBe(1);
    expect(card.findings).toHaveLength(1);
    const finding = card.findings[0];
    expect(finding.severity).toBe('error');
    expect(finding.kind).toBe('missing_required');
    expect(finding.property).toBe('total_price');
    expect(finding.property_id).toBe(totalPricePropertyId);
    expect(finding.message).toEqual(expect.any(String));
    expect(finding.first_seen).toEqual(expect.any(String));
    expect(finding.last_seen).toEqual(expect.any(String));
    expect(finding.id).toEqual(expect.any(String));
    expect(finding.comparison).toBe('definition_vs_observations');
  });
});

describe('EventCard.coverage columns (ERROR 2 fix round: keyed by payload_key, not display name)', () => {
  it('matches GET .../coverage when the context property has a payload_key different from its name', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });
    const action = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    });
    const location = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'location',
      data_type: 'string',
      allowed_values_json: [{ value: 'pdp' }, { value: 'minicart' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: action.id, required: true, role: 'discriminator' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: location.id, required: false, role: 'context', payload_key: 'loc' });
    VariantDAL.createVariant(projectId, event.id, { conditions: [{ property_id: action.id, operator: 'equals', values: ['add'] }] });

    // The observation carries the payload key "loc", not the display name "location".
    addObservation('cart_update', { action: 'add', loc: 'pdp' });

    const card = buildEventCard(projectId, event.id);
    expect(card.coverage.columns).toHaveLength(1);
    expect(card.coverage.columns[0].payload_key).toBe('loc');
    expect(card.contexts[0].payload_key).toBe('loc');
    // The card's coverage summary and the full grid must agree (previously the card counted zero
    // observed cells here because it looked the value up under "location" instead of "loc").
    expect(card.coverage.observed_count).toBe(1);

    const grid = computeEventCoverageGrid(projectId, event.id);
    expect(grid.cells).toHaveLength(1);
    expect(card.coverage.observed_count).toBe(grid.cells.length);
    expect(card.coverage.unobserved_count).toBe(grid.unobserved.length);
  });
});

describe('EventCard.rules variant scope (ERROR 3 fix round)', () => {
  it('carries variant_id/variant_name for a rule scoped to one variant', () => {
    const { eventId, totalPricePropertyId, variantAddId } = setUpCartUpdate();
    const rule = RuleDAL.createRule(projectId, eventId, {
      kind: 'bound',
      name: 'refund negative',
      message: 'Refunds must be negative.',
      expression_json: { kind: 'bound', subject: { ref: 'property', property_id: totalPricePropertyId }, check: 'lt', bound: { ref: 'constant', value: 0 } },
      variant_id: variantAddId,
    });

    const card = buildEventCard(projectId, eventId);
    const cardRule = card.rules.find((r) => r.id === rule.id);
    expect(cardRule).toBeDefined();
    expect(cardRule?.variant_id).toBe(variantAddId);
    expect(cardRule?.variant_name).toBe(card.variants[0].name);
  });

  it('carries variant_id: null for an unconditional (event-wide) rule', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    RuleDAL.createRule(projectId, eventId, {
      kind: 'bound',
      name: 'non-negative price',
      message: 'total_price must not be negative.',
      expression_json: { kind: 'bound', subject: { ref: 'property', property_id: totalPricePropertyId }, check: 'gte', bound: { ref: 'constant', value: 0 } },
    });

    const card = buildEventCard(projectId, eventId);
    expect(card.rules[0].variant_id).toBeNull();
    expect(card.rules[0].variant_name).toBeNull();
  });
});

describe('EventCard.variants expiration override (WARNING 4 fix round)', () => {
  it('reports the event/project value at event level, and the per-variant override under variants[].expiration when set', () => {
    const { eventId, variantAddId } = setUpCartUpdate();
    ProjectDAL.updateProject(projectId, { default_expiration_json: { enabled: true, count: 90, units: 'days' } });
    VariantDAL.updateVariant(projectId, eventId, variantAddId, {
      expiration_json: { enabled: true, count: 30, units: 'days' },
    });

    const card = buildEventCard(projectId, eventId);
    expect(card.expiration).toEqual({ effective: { enabled: true, count: 90, units: 'days' }, source: 'project' });
    const variant = card.variants.find((v) => v.id === variantAddId);
    expect(variant?.expiration).toEqual({ effective: { enabled: true, count: 30, units: 'days' }, source: 'variant' });
  });

  it('reports no per-variant override when the variant has none', () => {
    const { eventId, variantAddId } = setUpCartUpdate();
    const card = buildEventCard(projectId, eventId);
    expect(card.variants.find((v) => v.id === variantAddId)?.expiration).toBeNull();
  });
});

describe('EventCard.variants required_keys (WARNING 6 fix round)', () => {
  it('lists the payload keys required on the variant, alongside the expected_payload sample', () => {
    const { eventId } = setUpCartUpdate();
    const card = buildEventCard(projectId, eventId);
    // `action` is required (the discriminator); `total_price` and `location` are optional (T-1-04 D-16).
    expect(card.variants[0].required_keys).toEqual(['action']);
    expect(Object.keys(card.variants[0].expected_payload)).toEqual(expect.arrayContaining(['action']));
  });
});

// ---------------------------------------------------------------------------
// T-2-08 fix round 2 (2026-09-27 15:19 qa-tester FAIL, supervisor DECISION)
// ---------------------------------------------------------------------------

describe('TrackingDocument.unattached_findings (fix round 2)', () => {
  it('carries every open finding whose event_id is null, and the invariant sum(events[].findings) + unattached_findings.length === findings_summary.open holds, with no finding counted twice', () => {
    const { eventId, totalPricePropertyId } = setUpCartUpdate();
    addObservation('cart_update', { action: 'add', location: 'web' });
    EventDAL.updateEventProperty(projectId, eventId, totalPricePropertyId, { required: true });
    runComparison(projectId);

    // An event-scoped finding (baseline: total_price is now required and missing on the observation).
    expect(buildEventCard(projectId, eventId).findings).toHaveLength(1);

    // A cross-event finding: shape_inconsistent has no single owning event.
    FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'shape_inconsistent',
      severity: 'warning',
      event_id: null,
      message: 'Property "product_ids" is observed with inconsistent JSON types across events: array, string.',
      fingerprint: 'cross-event-shape-inconsistent',
    });

    // A consent/project-level finding: a mapping rename mismatch with no owning event.
    FindingDAL.upsertFinding(projectId, {
      comparison: 'mapping_vs_observations',
      kind: 'rename_mismatch',
      severity: 'error',
      event_id: null,
      message: 'newsletter renamed to brand_consent.',
      fingerprint: 'consent-rename-mismatch',
    });

    const doc = buildTrackingDocument(projectId);

    expect(doc.unattached_findings).toHaveLength(2);
    expect(doc.unattached_findings.map((f) => f.kind).sort()).toEqual(['rename_mismatch', 'shape_inconsistent']);
    for (const f of doc.unattached_findings) {
      expect(f.property_id).toBeNull();
      expect(f.property).toBeNull();
    }

    const sumOfEventFindings = doc.events.reduce((total, event) => total + event.findings.length, 0);
    const openTotal = doc.findings_summary.open.error + doc.findings_summary.open.warning + doc.findings_summary.open.info;
    expect(sumOfEventFindings + doc.unattached_findings.length).toBe(openTotal);

    // No finding id appears twice (in an event card and also in unattached_findings, or in two cards).
    const allIds = [...doc.events.flatMap((e) => e.findings.map((f) => f.id)), ...doc.unattached_findings.map((f) => f.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('sortEventCardFindings tie-break (WARNING 1 fix round)', () => {
  it('orders two findings identical except expected/actual deterministically, by JSON.stringify(expected) then actual then id', () => {
    const { eventId } = setUpCartUpdate();

    const findingA = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'rule_violation',
      severity: 'error',
      event_id: eventId,
      expected_json: { value: 10 },
      actual_json: { value: 3 },
      message: 'Items total mismatch.',
      fingerprint: 'items-total-parent-a',
    });
    const findingB = FindingDAL.upsertFinding(projectId, {
      comparison: 'definition_vs_observations',
      kind: 'rule_violation',
      severity: 'error',
      event_id: eventId,
      expected_json: { value: 20 },
      actual_json: { value: 4 },
      message: 'Items total mismatch.',
      fingerprint: 'items-total-parent-b',
    });

    const card = buildEventCard(projectId, eventId);
    expect(card.findings).toHaveLength(2);
    const [first, second] = card.findings;
    // Deterministic content-based order: JSON.stringify({value:10}) < JSON.stringify({value:20}).
    const expectedFirstId = JSON.stringify(findingA.expected_json) < JSON.stringify(findingB.expected_json) ? findingA.id : findingB.id;
    expect(first.id).toBe(expectedFirstId);
    expect(second.id).not.toBe(first.id);

    // Re-running the build gives the exact same order (stable, not just "some" deterministic order).
    const cardAgain = buildEventCard(projectId, eventId);
    expect(cardAgain.findings.map((f) => f.id)).toEqual(card.findings.map((f) => f.id));
  });
});
