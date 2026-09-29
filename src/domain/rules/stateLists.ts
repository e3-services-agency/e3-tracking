/**
 * State list consistency checks (D-63, T-4-17), part of comparison `definition_vs_observations`
 * like the rules and item-schema checks. A "state list" property (`kind = 'state_list'` with a
 * list derivation, e.g. `product_ids` / `product_list`) is computed from the items of a
 * collection; an observed Bloomreach event must keep the lists that share an `id_field` in sync:
 *
 * - `length`: the lists of one id field have the same number of entries.
 * - `type`: ids are typed consistently (all strings or all numbers) across the lists.
 * - `add_missing`: on `action = add` the interacted id (the payload property named like the
 *   `id_field`, e.g. `product_id`) is in the lists.
 * - `remove_present`: on `action = remove` with an explicit quantity of 0 the interacted id is
 *   absent from the lists (a remove that leaves quantity above 0 may keep it). The quantity is read
 *   from the payload property named by the list's `quantity_field` (the source field on items).
 *
 * Totals (`sum` derivations) are not checked here; the money rules cover those. One finding per
 * `(event, property, detail)`, anchored on the first offending observation, same convention as the
 * other per-property checks. Pure.
 */
import type { ComparisonId } from '../enums';
import type { DefinitionSnapshot, EngineFinding, EngineObservation } from '../comparison/definitionVsObservations';
import { parseDerivation, isListDerivation } from '../codegen/derivation';

const COMPARISON: ComparisonId = 'definition_vs_observations';

export interface StateListRef {
  property_id: string;
  payload_key: string;
  form: 'ids' | 'id_quantity';
  id_field: string;
  quantity_field: string;
}

export interface StateListCheck {
  event_id: string;
  event_name: string;
  lists: StateListRef[];
}

/** Every custom event with at least one list-derivation state list. */
export function buildStateListChecks(definition: DefinitionSnapshot, customEventIds: Iterable<string>): StateListCheck[] {
  const custom = new Set(customEventIds);
  const checks: StateListCheck[] = [];
  for (const event of definition.events) {
    if (!custom.has(event.id)) continue;
    const lists: StateListRef[] = [];
    for (const prop of event.properties) {
      if (prop.kind !== 'state_list') continue;
      const d = parseDerivation(prop.derivation);
      if (!isListDerivation(d)) continue;
      lists.push({
        property_id: prop.property_id,
        payload_key: prop.payload_key ?? prop.name,
        form: d.form,
        id_field: d.id_field,
        quantity_field: d.quantity_field || 'quantity',
      });
    }
    if (lists.length > 0) checks.push({ event_id: event.id, event_name: event.name, lists });
  }
  return checks;
}

function fp(eventId: string, propertyId: string | null, detail: string): string {
  return [COMPARISON, 'state_list_mismatch', eventId, '', propertyId ?? '', detail].join('|');
}

interface Extracted {
  ref: StateListRef;
  ids: unknown[];
}

function extractIds(ref: StateListRef, raw: unknown): unknown[] | null {
  if (!Array.isArray(raw)) return null;
  if (ref.form === 'ids') return raw;
  return raw.map((entry) =>
    entry && typeof entry === 'object' ? (entry as Record<string, unknown>)[ref.id_field] : undefined
  );
}

/** True only for the number 0 or a numeric string equal to 0; never for null, '' or absent. */
function isZeroQuantity(v: unknown): boolean {
  if (typeof v === 'number') return v === 0;
  if (typeof v === 'string') return v.trim() !== '' && Number(v) === 0;
  return false;
}

function typeOf(v: unknown): string {
  return v === null ? 'null' : typeof v;
}

export function runStateListChecks(checks: StateListCheck[], observations: EngineObservation[]): EngineFinding[] {
  const seen = new Map<string, EngineFinding>();
  const push = (f: EngineFinding) => {
    if (!seen.has(f.fingerprint)) seen.set(f.fingerprint, f);
  };

  for (const check of checks) {
    const idFields = [...new Set(check.lists.map((l) => l.id_field))];
    for (const obs of observations) {
      if (obs.event_id !== check.event_id) continue;
      for (const idField of idFields) {
        const group: Extracted[] = [];
        for (const ref of check.lists.filter((l) => l.id_field === idField)) {
          const ids = extractIds(ref, obs.properties[ref.payload_key]);
          if (ids) group.push({ ref, ids });
        }
        if (group.length === 0) continue;
        const anchor = group[0].ref;
        const base = {
          comparison: COMPARISON,
          kind: 'state_list_mismatch' as const,
          severity: 'error' as const,
          event_id: check.event_id,
          variant_id: obs.variant_id,
          observation_id: obs.id,
        };

        // length
        const lengths = group.map((g) => g.ids.length);
        if (new Set(lengths).size > 1) {
          const detail = `length:${idField}`;
          push(
            {
              ...base,
              property_id: anchor.property_id,
              expected_json: { rule: 'equal_length', lists: group.map((g) => g.ref.payload_key) },
              actual_json: Object.fromEntries(group.map((g) => [g.ref.payload_key, g.ids.length])),
              message: `State lists for "${idField}" disagree in length: ${group
                .map((g) => `${g.ref.payload_key} has ${g.ids.length}`)
                .join(', ')}.`,
              fingerprint: fp(check.event_id, anchor.property_id, detail),
            }
          );
        }

        // type consistency
        const types = new Set(group.flatMap((g) => g.ids.filter((v) => v !== undefined).map(typeOf)));
        if (types.size > 1) {
          const detail = `type:${idField}`;
          push(
            {
              ...base,
              property_id: anchor.property_id,
              expected_json: { rule: 'consistent_id_type', id_field: idField },
              actual_json: { types: [...types].sort() },
              message: `Ids for "${idField}" are typed inconsistently across ${group
                .map((g) => g.ref.payload_key)
                .join(', ')} (${[...types].sort().join(', ')}).`,
              fingerprint: fp(check.event_id, anchor.property_id, detail),
            }
          );
        }

        // interacted id vs action
        const interacted = obs.properties[idField];
        const action = obs.properties.action;
        if (interacted === undefined || interacted === null) continue;
        const inList = (g: Extracted) => g.ids.some((v) => String(v) === String(interacted));
        if (action === 'add') {
          const missing = group.filter((g) => !inList(g));
          if (missing.length > 0) {
            const detail = `add_missing:${idField}`;
            push(
              {
                ...base,
                property_id: missing[0].ref.property_id,
                expected_json: { rule: 'interacted_id_present_after_add', id_field: idField, id: interacted },
                actual_json: { missing_in: missing.map((g) => g.ref.payload_key) },
                message: `After action "add", ${idField} "${String(interacted)}" is missing from ${missing
                  .map((g) => g.ref.payload_key)
                  .join(', ')}.`,
                fingerprint: fp(check.event_id, missing[0].ref.property_id, detail),
              }
            );
          }
        } else if (action === 'remove' && isZeroQuantity(obs.properties[anchor.quantity_field])) {
          const present = group.filter((g) => inList(g));
          if (present.length > 0) {
            const detail = `remove_present:${idField}`;
            push(
              {
                ...base,
                property_id: present[0].ref.property_id,
                expected_json: { rule: 'interacted_id_absent_after_remove', id_field: idField, id: interacted },
                actual_json: { present_in: present.map((g) => g.ref.payload_key) },
                message: `After action "remove" with quantity 0, ${idField} "${String(interacted)}" is still in ${present
                  .map((g) => g.ref.payload_key)
                  .join(', ')}.`,
                fingerprint: fp(check.event_id, present[0].ref.property_id, detail),
              }
            );
          }
        }
      }
    }
  }
  return [...seen.values()];
}
