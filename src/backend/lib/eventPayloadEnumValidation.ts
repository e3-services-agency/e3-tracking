/**
 * Minimal runtime check: when effective enum_values exist for (workspace, event, property),
 * tracking JSON values under that property's payload key must be strings in the allowed list.
 *
 * Canvas: PUT /api/journeys/:id/canvas calls assertEnumValuesForJourneyCanvasNodes before journey creation + saveJourneyCanvas.
 * QA: upsertJourneyQARuns calls assertEnumValuesForQaRunPayloads before writes.
 * - Invalid payload = QA failure — throws BadRequestError; no catch here (errors propagate).
 * - Payload must match effective enum_values from event_property_definitions (via getEffectiveEventPropertyDefinition).
 * - This is a hard validation gate, not advisory.
 */
import { getEffectiveEventPropertyDefinition } from '../dal/event-property-definition.dal';
import { listPayloadKeyPropertyBindingsForEvent } from '../dal/event.dal';
import { BadRequestError } from '../errors';
import type { EffectiveEventPropertyDefinition } from '../../types/schema';

/** Same object-shape rule as journey QA validate: plain JSON object only (not array / null). */
export function tryParseEventPayloadObject(json: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(json);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTriggerEventIdFromNode(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;
  if (n.type !== 'triggerNode') return null;
  const data = n.data;
  if (!data || typeof data !== 'object') return null;
  const ce = (data as Record<string, unknown>).connectedEvent;
  if (!ce || typeof ce !== 'object') return null;
  const eventId = (ce as Record<string, unknown>).eventId;
  return typeof eventId === 'string' && eventId.trim() ? eventId.trim() : null;
}

function collectJsonPayloadStringsFromVerificationLike(v: unknown): string[] {
  if (!v || typeof v !== 'object') return [];
  const o = v as Record<string, unknown>;
  const out: string[] = [];
  if (typeof o.proofText === 'string' && o.proofText.trim()) out.push(o.proofText.trim());
  const proofs = o.proofs;
  if (Array.isArray(proofs)) {
    for (const p of proofs) {
      if (!p || typeof p !== 'object') continue;
      const pr = p as Record<string, unknown>;
      if (pr.type === 'json' && typeof pr.content === 'string' && pr.content.trim()) {
        out.push(pr.content.trim());
      }
    }
  }
  return out;
}

function collectJsonPayloadStringsFromProofArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    const pr = p as Record<string, unknown>;
    if (pr.type === 'json' && typeof pr.content === 'string' && pr.content.trim()) {
      out.push(pr.content.trim());
    }
  }
  return out;
}

/**
 * Validate JSON tracking payloads on trigger nodes (qaVerification + pendingProofs) when they parse as plain objects.
 *
 * Ownership: invoked from PUT /api/journeys/:id/canvas before createJourneyIfMissing and saveJourneyCanvas
 * (pass `{ enumValidated: true }`; saveJourneyCanvas does not re-validate, only asserts the flag).
 *
 * Invalid payload = QA failure.
 * Payload must match event_property_definitions (effective enum_values).
 * Hard validation gate, not advisory.
 */
export async function assertEnumValuesForJourneyCanvasNodes(
  workspaceId: string,
  nodes: unknown
): Promise<void> {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    const eventId = getTriggerEventIdFromNode(node);
    if (!eventId) continue;
    if (!node || typeof node !== 'object') continue;
    const data = (node as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') continue;
    const d = data as Record<string, unknown>;
    const strings = [
      ...collectJsonPayloadStringsFromVerificationLike(d.qaVerification),
      ...collectJsonPayloadStringsFromProofArray(d.pendingProofs),
    ];
    for (const s of strings) {
      const parsed = tryParseEventPayloadObject(s);
      if (!parsed) continue;
      await assertEventPayloadEnumValues(workspaceId, eventId, parsed);
    }
  }
}

/**
 * Before persisting QA runs: validate json proofs / proofText per verification when the run
 * includes canvas nodes to resolve trigger → eventId. Skips entries when nodes are omitted.
 *
 * Invalid payload = QA failure.
 * Payload must match event_property_definitions (effective enum_values).
 * Hard validation gate, not advisory — caller must invoke before any qa_runs / qa_run_payloads writes.
 */
export async function assertEnumValuesForQaRunPayloads(
  workspaceId: string,
  qaRuns: unknown[]
): Promise<void> {
  for (const run of qaRuns) {
    if (!run || typeof run !== 'object') continue;
    const r = run as Record<string, unknown>;
    const nodes = r.nodes;
    const verifications = r.verifications;
    if (!verifications || typeof verifications !== 'object') continue;

    for (const [nodeId, verification] of Object.entries(verifications as Record<string, unknown>)) {
      if (!nodeId) continue;
      const node =
        Array.isArray(nodes) ?
          (nodes as unknown[]).find(
            (n) => n && typeof n === 'object' && (n as Record<string, unknown>).id === nodeId
          )
        : null;
      const eventId = node ? getTriggerEventIdFromNode(node) : null;
      if (!eventId) continue;

      for (const s of collectJsonPayloadStringsFromVerificationLike(verification)) {
        const parsed = tryParseEventPayloadObject(s);
        if (!parsed) continue;
        await assertEventPayloadEnumValues(workspaceId, eventId, parsed);
      }
    }
  }
}

export async function assertEventPayloadEnumValues(
  workspaceId: string,
  eventId: string,
  parsed: Record<string, unknown>
): Promise<void> {
  const bindings = await listPayloadKeyPropertyBindingsForEvent(workspaceId, eventId);
  const payloadKeyToPropertyId = new Map<string, string>();
  for (const b of bindings) {
    if (!payloadKeyToPropertyId.has(b.payload_key)) {
      payloadKeyToPropertyId.set(b.payload_key, b.property_id);
    }
  }

  const cache = new Map<string, EffectiveEventPropertyDefinition>();

  async function effectiveCached(propertyId: string): Promise<EffectiveEventPropertyDefinition> {
    const hit = cache.get(propertyId);
    if (hit) return hit;
    const def = await getEffectiveEventPropertyDefinition(workspaceId, eventId, propertyId);
    cache.set(propertyId, def);
    return def;
  }

  for (const [payloadKey, rawValue] of Object.entries(parsed)) {
    const propertyId = payloadKeyToPropertyId.get(payloadKey);
    if (!propertyId) continue;

    const effective = await effectiveCached(propertyId);
    const allowed = effective.effective.enum_values;
    if (allowed == null || allowed.length === 0) continue;

    const propName = effective.property.name;

    if (typeof rawValue !== 'string') {
      throw new BadRequestError(`Invalid value for property '${propName}'`, payloadKey, {
        property_id: propertyId,
        value: rawValue,
        allowed,
      });
    }

    if (!allowed.includes(rawValue)) {
      throw new BadRequestError(`Invalid value for property '${propName}'`, payloadKey, {
        property_id: propertyId,
        value: rawValue,
        allowed,
      });
    }
  }
}
