/**
 * Parser for Bloomreach `data-mapping.json` (PLAN "Import / export contracts" > Data mapping,
 * D-04, D-22, D-26). Pure, strict-but-forgiving: malformed pieces become warnings and are skipped
 * (defaulted), never a thrown exception — the whole point of a preview is to show the user what
 * could and could not be understood before anything is written. No DB or Express import
 * (domain-model skill).
 */

export type DataMappingOperator = 'equals' | 'in';

export interface DataMappingFilterCondition {
  property: string;
  operator: DataMappingOperator;
  values: string[];
}

/** One `standard_events.<key>` entry. `eventType`/`filter` come from the `event` block; `null` when `event` is null (standard event not mapped). */
export interface DataMappingStandardEvent {
  key: string;
  eventType: string | null;
  filter: DataMappingFilterCondition[];
  /** Non-`event` keys of the entry: `{property: "x"}` -> the client property name; `null` stays `null`. */
  fieldMap: Record<string, string | null>;
}

export interface DataMappingCatalogs {
  main: string | null;
  mainColumns: Record<string, string | null>;
  variant: string | null;
}

export interface DataMappingModel {
  id: string | null;
  catalogs: DataMappingCatalogs;
  /**
   * The `catalogs` block exactly as received (verbatim Bloomreach key names, e.g. `main_columns`),
   * for round-trip export via `Project.bloomreach_mapping_meta_json` — `catalogs` above is the
   * normalized/camelCase shape planners reason about, which is a lossy transform (e.g.
   * `main_columns` -> `mainColumns`) not meant to be re-serialized.
   */
  catalogsRaw: unknown;
  /** standard consent key -> client consent category name, or `null` when unmapped. */
  consents: Record<string, string | null>;
  /** Kept verbatim for round-trip export; not otherwise modeled (fixture always `[]`). */
  customEvents: unknown[];
  /** standard customer property key -> client property name, or `null` when unmapped. */
  customerProperties: Record<string, string | null>;
  standardEvents: DataMappingStandardEvent[];
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePropertyMapping(
  value: unknown,
  path: string,
  warnings: string[]
): string | null {
  if (value === null || value === undefined) return null;
  if (isPlainObject(value) && typeof value.property === 'string' && value.property.trim()) {
    return value.property.trim();
  }
  warnings.push(`${path} must be {property} or null; ignored.`);
  return null;
}

function parseFilterCondition(
  stdKey: string,
  index: number,
  item: unknown,
  warnings: string[]
): DataMappingFilterCondition | null {
  const path = `standard_events.${stdKey}.event.filter[${index}]`;
  if (!isPlainObject(item)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  const attribute = item.attribute;
  if (!isPlainObject(attribute) || typeof attribute.property !== 'string' || !attribute.property.trim()) {
    warnings.push(`${path}.attribute.property is required; skipped.`);
    return null;
  }
  const constraint = item.constraint;
  if (!isPlainObject(constraint)) {
    warnings.push(`${path}.constraint must be an object; skipped.`);
    return null;
  }
  const operator = constraint.operator;
  if (operator !== 'equals' && operator !== 'in') {
    warnings.push(`${path}.constraint.operator "${String(operator)}" is not supported (equals|in); skipped.`);
    return null;
  }
  const operands = Array.isArray(constraint.operands) ? constraint.operands : [];
  const values = operands
    .map((operand: unknown) => (isPlainObject(operand) && 'value' in operand ? String(operand.value) : null))
    .filter((v: string | null): v is string => v !== null);
  if (values.length === 0) {
    warnings.push(`${path}.constraint.operands has no usable values; skipped.`);
    return null;
  }
  if (operator === 'equals' && values.length !== 1) {
    warnings.push(`${path}.constraint.operator "equals" expects exactly one operand; using the first value.`);
  }
  return {
    property: attribute.property.trim(),
    operator,
    values: operator === 'equals' ? [values[0]] : values,
  };
}

function parseStandardEvent(key: string, raw: unknown, warnings: string[]): DataMappingStandardEvent {
  if (!isPlainObject(raw)) {
    warnings.push(`standard_events.${key} must be an object; treated as unmapped.`);
    return { key, eventType: null, filter: [], fieldMap: {} };
  }

  let eventType: string | null = null;
  let filter: DataMappingFilterCondition[] = [];
  const eventBlock = raw.event;
  if (eventBlock === null || eventBlock === undefined) {
    // Standard event not mapped; nothing more to parse.
  } else if (isPlainObject(eventBlock)) {
    eventType = typeof eventBlock.type === 'string' && eventBlock.type.trim() ? eventBlock.type.trim() : null;
    if (!eventType) {
      warnings.push(`standard_events.${key}.event.type is required when event is not null; treated as unmapped.`);
    }
    if (Array.isArray(eventBlock.filter)) {
      filter = eventBlock.filter
        .map((item, index) => parseFilterCondition(key, index, item, warnings))
        .filter((c): c is DataMappingFilterCondition => c !== null);
    } else if (eventBlock.filter !== undefined) {
      warnings.push(`standard_events.${key}.event.filter must be an array; treated as [].`);
    }
  } else {
    warnings.push(`standard_events.${key}.event must be an object or null; treated as unmapped.`);
  }

  const fieldMap: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(raw)) {
    if (field === 'event') continue;
    fieldMap[field] = parsePropertyMapping(value, `standard_events.${key}.${field}`, warnings);
  }

  return { key, eventType, filter, fieldMap };
}

export function parseDataMapping(json: unknown): DataMappingModel {
  const warnings: string[] = [];

  if (!isPlainObject(json)) {
    return {
      id: null,
      catalogs: { main: null, mainColumns: {}, variant: null },
      catalogsRaw: null,
      consents: {},
      customEvents: [],
      customerProperties: {},
      standardEvents: [],
      warnings: ['data-mapping JSON must be an object.'],
    };
  }

  const id = typeof json._id === 'string' ? json._id : null;

  let catalogs: DataMappingCatalogs = { main: null, mainColumns: {}, variant: null };
  let catalogsRaw: unknown = null;
  if (isPlainObject(json.catalogs)) {
    const c = json.catalogs;
    catalogsRaw = c;
    catalogs = {
      main: typeof c.main === 'string' ? c.main : null,
      mainColumns: isPlainObject(c.main_columns)
        ? Object.fromEntries(
            Object.entries(c.main_columns).map(([k, v]) => [k, typeof v === 'string' ? v : null])
          )
        : {},
      variant: typeof c.variant === 'string' ? c.variant : null,
    };
  } else if (json.catalogs !== undefined) {
    warnings.push('catalogs must be an object; ignored.');
  }

  const consents: Record<string, string | null> = {};
  if (isPlainObject(json.consents)) {
    for (const [k, v] of Object.entries(json.consents)) {
      if (v === null) {
        consents[k] = null;
      } else if (typeof v === 'string') {
        consents[k] = v;
      } else {
        warnings.push(`consents.${k} must be a string or null; ignored.`);
      }
    }
  } else if (json.consents !== undefined) {
    warnings.push('consents must be an object; ignored.');
  }

  const customEvents = Array.isArray(json.custom_events) ? json.custom_events : [];
  if (json.custom_events !== undefined && !Array.isArray(json.custom_events)) {
    warnings.push('custom_events must be an array; ignored.');
  }

  const customerProperties: Record<string, string | null> = {};
  if (isPlainObject(json.customer_properties)) {
    for (const [k, v] of Object.entries(json.customer_properties)) {
      customerProperties[k] = parsePropertyMapping(v, `customer_properties.${k}`, warnings);
    }
  } else if (json.customer_properties !== undefined) {
    warnings.push('customer_properties must be an object; ignored.');
  }

  const standardEvents: DataMappingStandardEvent[] = [];
  if (isPlainObject(json.standard_events)) {
    for (const [key, raw] of Object.entries(json.standard_events)) {
      standardEvents.push(parseStandardEvent(key, raw, warnings));
    }
  } else if (json.standard_events !== undefined) {
    warnings.push('standard_events must be an object; ignored.');
  }

  return { id, catalogs, catalogsRaw, consents, customEvents, customerProperties, standardEvents, warnings };
}
