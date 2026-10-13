/**
 * Parser for Bloomreach `data-manager-events.json` (PLAN "Import / export contracts: Data
 * Manager" > "Data Manager events", D-28, D-29, D-35, D-37, T-2-03). Pure, strict-but-forgiving:
 * malformed pieces become warnings and are skipped, never a thrown exception — same contract as
 * `dataMappingImport.ts`/`dataManagerCustomers.ts`. No DB or Express import (domain-model skill).
 *
 * Shape: `{default_forbidden, default_private, default_group: {events: [...]}, groups: [{name,
 * events: [...]}]}`. Each event is `{type, description, source, used, forbidden, deleting,
 * real_time_analytics, properties: {are_all_used, default_group: {properties: [...]}, groups:
 * [{name, properties: [...]}]}}`. Each event property is `{property, type, description,
 * example_values, private, source, used, deleting}` (no per-event-property `group` key at that
 * level; the property's *group* — an event-scoped property grouping, distinct from the event's own
 * group — is the array it was found under, same convention as the top-level event groups; the
 * fixture has none, but the shape is parsed anyway).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Same convention as `dataManagerCustomers.ts`: `null`/`undefined` stay `null`; everything else (incl. `""`, `"(empty)"`) is kept verbatim. */
function readStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : String(value);
}

function readBoolFlag(raw: unknown, defaultValue: boolean, path: string, field: string, warnings: string[]): boolean {
  if (raw === undefined) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  warnings.push(`${path}.${field} must be a boolean; got ${JSON.stringify(raw)}, treated as ${defaultValue}.`);
  return defaultValue;
}

export interface DataManagerEventProperty {
  /** Bloomreach property name (matched against `Property.name` for scope `event`). */
  property: string;
  type: string;
  description: string | null;
  example_values: string | null;
  private: boolean;
  source: string;
  used: boolean;
  deleting: boolean;
  /** `null` = the event's default property group. */
  group: string | null;
  /** Monotonic position within this event's own property list (default group first, then named groups). */
  dm_index: number;
}

export interface DataManagerEvent {
  /** Bloomreach event type; matched against `Event.name`. */
  type: string;
  description: string | null;
  source: string;
  used: boolean;
  forbidden: boolean;
  deleting: boolean;
  real_time_analytics: boolean;
  properties_are_all_used: boolean;
  properties: DataManagerEventProperty[];
  /** `null` = the file's default event group; symmetrical with `Event.category`. */
  group: string | null;
  /** Monotonic position across the whole file (default group events first, then named groups in order). */
  dm_index: number;
}

export interface DataManagerEventsModel {
  default_forbidden: boolean;
  default_private: boolean;
  /** Named event group order from `groups[]` (excludes the default group, which has no name). */
  group_order: string[];
  events: DataManagerEvent[];
  warnings: string[];
}

function parseEventProperty(
  raw: unknown,
  group: string | null,
  index: number,
  eventPath: string,
  warnings: string[]
): DataManagerEventProperty | null {
  const path = group ? `${eventPath}.properties.groups[name=${group}].properties[${index}]` : `${eventPath}.properties.default_group.properties[${index}]`;
  if (!isPlainObject(raw)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  const name = typeof raw.property === 'string' && raw.property.trim() ? raw.property.trim() : null;
  if (!name) {
    warnings.push(`${path}.property is required; skipped.`);
    return null;
  }
  let type = 'string';
  if (typeof raw.type === 'string' && raw.type.trim()) {
    type = raw.type.trim();
  } else {
    warnings.push(`${path}.type is missing for property "${name}"; treated as "string".`);
  }
  return {
    property: name,
    type,
    description: readStringOrNull(raw.description),
    example_values: readStringOrNull(raw.example_values),
    private: readBoolFlag(raw.private, false, path, 'private', warnings),
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'user',
    used: readBoolFlag(raw.used, true, path, 'used', warnings),
    deleting: readBoolFlag(raw.deleting, false, path, 'deleting', warnings),
    group,
    dm_index: index,
  };
}

function parseEventProperties(raw: unknown, eventPath: string, warnings: string[]): DataManagerEventProperty[] {
  const properties: DataManagerEventProperty[] = [];
  if (raw === undefined || raw === null) return properties;
  if (!isPlainObject(raw)) {
    warnings.push(`${eventPath}.properties must be an object; ignored.`);
    return properties;
  }
  let index = 0;
  if (raw.default_group !== undefined) {
    if (isPlainObject(raw.default_group)) {
      const rawProps = raw.default_group.properties;
      if (Array.isArray(rawProps)) {
        for (const p of rawProps) {
          const parsed = parseEventProperty(p, null, index, eventPath, warnings);
          if (parsed) properties.push(parsed);
          index++;
        }
      } else if (rawProps !== undefined) {
        warnings.push(`${eventPath}.properties.default_group.properties must be an array; ignored.`);
      }
    } else {
      warnings.push(`${eventPath}.properties.default_group must be an object; ignored.`);
    }
  }
  if (raw.groups !== undefined) {
    if (Array.isArray(raw.groups)) {
      for (const rawGroup of raw.groups) {
        if (!isPlainObject(rawGroup) || typeof rawGroup.name !== 'string' || !rawGroup.name.trim()) {
          warnings.push(`${eventPath}.properties.groups[] entry must be {name, properties}; skipped.`);
          continue;
        }
        const groupName = rawGroup.name.trim();
        const rawProps = rawGroup.properties;
        if (Array.isArray(rawProps)) {
          for (const p of rawProps) {
            const parsed = parseEventProperty(p, groupName, index, eventPath, warnings);
            if (parsed) properties.push(parsed);
            index++;
          }
        } else if (rawProps !== undefined) {
          warnings.push(`${eventPath}.properties.groups[name=${groupName}].properties must be an array; ignored.`);
        }
      }
    } else {
      warnings.push(`${eventPath}.properties.groups must be an array; ignored.`);
    }
  }
  return properties;
}

function parseEvent(raw: unknown, group: string | null, index: number, warnings: string[]): DataManagerEvent | null {
  const path = group ? `groups[name=${group}].events[${index}]` : `default_group.events[${index}]`;
  if (!isPlainObject(raw)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  const type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : null;
  if (!type) {
    warnings.push(`${path}.type is required; skipped.`);
    return null;
  }
  const properties = parseEventProperties(raw.properties, path, warnings);
  const propertiesAreAllUsed =
    isPlainObject(raw.properties) && (raw.properties as Record<string, unknown>).are_all_used === true;
  if (properties.length === 0) {
    warnings.push(`Event "${type}" has no properties in this payload.`);
  }
  return {
    type,
    description: readStringOrNull(raw.description),
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'user',
    used: readBoolFlag(raw.used, true, path, 'used', warnings),
    forbidden: readBoolFlag(raw.forbidden, false, path, 'forbidden', warnings),
    deleting: readBoolFlag(raw.deleting, false, path, 'deleting', warnings),
    real_time_analytics: readBoolFlag(raw.real_time_analytics, false, path, 'real_time_analytics', warnings),
    properties_are_all_used: propertiesAreAllUsed,
    properties,
    group,
    dm_index: index,
  };
}

/** The raw Bloomreach `project/schemas` wrapper (T-5-30): `{_id, customer_properties, events: {default_group, groups, ...}}`; unwrap `events`. */
export function unwrapSchemasEvents(json: unknown): unknown {
  if (isPlainObject(json) && isPlainObject(json.events) && !Array.isArray(json.events)) {
    const e = json.events;
    if ('default_group' in e || 'groups' in e || 'default_forbidden' in e) return e;
  }
  return json;
}

export function parseDataManagerEvents(rawJson: unknown): DataManagerEventsModel {
  const json = unwrapSchemasEvents(rawJson);
  const warnings: string[] = [];

  if (!isPlainObject(json)) {
    return {
      default_forbidden: false,
      default_private: false,
      group_order: [],
      events: [],
      warnings: ['data-manager-events JSON must be an object.'],
    };
  }

  const default_forbidden = json.default_forbidden === true;
  const default_private = json.default_private === true;

  // Symmetric with `dataManagerCustomers.ts`'s own "wrong file" guard: a customers export nests
  // properties directly under `default_group.properties`/`groups[].properties`, not under
  // `default_group.events`/`groups[].events`, so it otherwise silently parses to zero events here.
  const looksLikeCustomers =
    (isPlainObject(json.default_group) && Array.isArray((json.default_group as Record<string, unknown>).properties)) ||
    (Array.isArray(json.groups) &&
      json.groups.some((g) => isPlainObject(g) && Array.isArray((g as Record<string, unknown>).properties)));
  if (looksLikeCustomers) {
    warnings.push(
      'This looks like a Data Manager customers export (events nested under "properties"), not an events export; parsed 0 events.'
    );
  }

  const events: DataManagerEvent[] = [];
  let index = 0;

  if (json.default_group !== undefined) {
    if (isPlainObject(json.default_group)) {
      const rawEvents = json.default_group.events;
      if (Array.isArray(rawEvents)) {
        for (const raw of rawEvents) {
          const parsed = parseEvent(raw, null, index, warnings);
          if (parsed) events.push(parsed);
          index++;
        }
      } else if (rawEvents !== undefined) {
        warnings.push('default_group.events must be an array; ignored.');
      }
    } else {
      warnings.push('default_group must be an object; ignored.');
    }
  }

  const group_order: string[] = [];
  if (json.groups !== undefined) {
    if (Array.isArray(json.groups)) {
      for (const rawGroup of json.groups) {
        if (!isPlainObject(rawGroup) || typeof rawGroup.name !== 'string' || !rawGroup.name.trim()) {
          warnings.push('groups[] entry must be {name, events}; skipped.');
          continue;
        }
        const groupName = rawGroup.name.trim();
        group_order.push(groupName);
        const rawEvents = rawGroup.events;
        if (Array.isArray(rawEvents)) {
          for (const raw of rawEvents) {
            const parsed = parseEvent(raw, groupName, index, warnings);
            if (parsed) events.push(parsed);
            index++;
          }
        } else if (rawEvents !== undefined) {
          warnings.push(`groups[name=${groupName}].events must be an array; ignored.`);
        }
      }
    } else {
      warnings.push('groups must be an array; ignored.');
    }
  }

  // Same "last occurrence wins" duplicate rule as `dataManagerCustomers.ts`.
  const lastIndexByType = new Map<string, number>();
  events.forEach((e, i) => lastIndexByType.set(e.type, i));
  const duplicateTypes = new Set(events.filter((e, i) => lastIndexByType.get(e.type) !== i).map((e) => e.type));
  for (const type of duplicateTypes) {
    warnings.push(`Event "${type}" is defined more than once in this payload; the last definition wins.`);
  }
  const dedupedEvents = events.filter((e, i) => lastIndexByType.get(e.type) === i);

  return { default_forbidden, default_private, group_order, events: dedupedEvents, warnings };
}
