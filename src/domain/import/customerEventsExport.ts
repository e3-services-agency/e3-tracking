/**
 * Parser for Bloomreach `customer-events-export.json` (PLAN "Import / export contracts" >
 * "Customer events export", D-04, D-22). Pure, strict-but-forgiving like `dataMapping.ts` and
 * `expirationSettings.ts`: a malformed event entry becomes a warning and is skipped, never a
 * thrown exception. No DB or Express import (domain-model skill). Values keep their JSON types
 * exactly (plan: "Values keep their JSON types exactly") — this parser never coerces a string to a
 * number or a boolean; that is exactly what `type_mismatch` (T-1-09 comparison engine) exists to
 * flag.
 */

export interface CustomerEventsExportEvent {
  type: string;
  /** Unix seconds, kept as the source gave it (may carry sub-second precision, e.g. `1778232949.3897672`). */
  timestamp: number;
  properties: Record<string, unknown>;
  /** Set when the event came from an array-form export (`[{customer_id, events}]`, T-5-30). */
  customer_id?: string;
}

export interface CustomerEventsExportModel {
  customer_id: string | null;
  project: string | null;
  url: string | null;
  events_listed: number | null;
  note: string | null;
  events: CustomerEventsExportEvent[];
  /** Distinct customers in an array-form export (T-5-30); 0 for the single-object form. */
  customer_count: number;
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEvent(index: number, raw: unknown, warnings: string[]): CustomerEventsExportEvent | null {
  const path = `events[${index}]`;
  if (!isPlainObject(raw)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  if (typeof raw.type !== 'string' || !raw.type.trim()) {
    warnings.push(`${path}.type is required; skipped.`);
    return null;
  }
  if (typeof raw.timestamp !== 'number' || Number.isNaN(raw.timestamp)) {
    warnings.push(`${path}.timestamp must be a number; skipped.`);
    return null;
  }
  const properties = isPlainObject(raw.properties) ? raw.properties : {};
  if (raw.properties !== undefined && !isPlainObject(raw.properties)) {
    warnings.push(`${path}.properties must be an object; treated as empty.`);
  }
  return { type: raw.type.trim(), timestamp: raw.timestamp, properties };
}

function parseArrayForm(list: unknown[]): CustomerEventsExportModel {
  const warnings: string[] = [];
  const events: CustomerEventsExportEvent[] = [];
  const customers = new Set<string>();
  list.forEach((el, i) => {
    if (!isPlainObject(el)) {
      warnings.push(`[${i}] must be an object; skipped.`);
      return;
    }
    const sub = parseCustomerEventsExport(el);
    for (const w of sub.warnings) warnings.push(`[${i}] ${w}`);
    const cid = sub.customer_id;
    if (cid) customers.add(cid);
    for (const e of sub.events) events.push(cid ? { ...e, customer_id: cid } : e);
  });
  return {
    customer_id: customers.size === 1 ? [...customers][0] : null,
    project: null,
    url: null,
    events_listed: null,
    note: null,
    events,
    customer_count: customers.size,
    warnings,
  };
}

export function parseCustomerEventsExport(json: unknown): CustomerEventsExportModel {
  if (Array.isArray(json)) return parseArrayForm(json);
  const warnings: string[] = [];
  if (!isPlainObject(json)) {
    return {
      customer_id: null,
      project: null,
      url: null,
      events_listed: null,
      note: null,
      events: [],
      customer_count: 0,
      warnings: ['customer-events-export JSON must be an object or an array of {customer_id, events}.'],
    };
  }

  if (!Array.isArray(json.events)) {
    warnings.push('events must be an array; treated as empty.');
  }
  const events = Array.isArray(json.events)
    ? json.events
        .map((raw, i) => parseEvent(i, raw, warnings))
        .filter((e): e is CustomerEventsExportEvent => e !== null)
    : [];

  return {
    customer_id: typeof json.customer_id === 'string' ? json.customer_id : null,
    project: typeof json.project === 'string' ? json.project : null,
    url: typeof json.url === 'string' ? json.url : null,
    events_listed: typeof json.events_listed === 'number' ? json.events_listed : null,
    note: typeof json.note === 'string' ? json.note : null,
    events,
    customer_count: 0,
    warnings,
  };
}
