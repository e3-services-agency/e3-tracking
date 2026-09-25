/**
 * Parser for Bloomreach `data-manager-customers.json` (PLAN "Import / export contracts: Data
 * Manager" > "Data Manager customers", D-28, D-35, D-37). Pure, strict-but-forgiving: malformed
 * pieces become warnings and are skipped, never a thrown exception — same contract as
 * `src/domain/import/dataMapping.ts`. No DB or Express import (domain-model skill).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `null`/`undefined` values on `description`/`example_values` are kept as `null`; everything else is kept verbatim (including the literal sentinel `"(empty)"`, D-28). */
function readStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : String(value);
}

export interface DataManagerCustomerProperty {
  /** Bloomreach property name (matched against `Property.name` for scope `customer`). */
  property: string;
  /** Raw Bloomreach type string (`string|long text|url|number|boolean|date|datetime|list` or an unrecognized value). */
  type: string;
  description: string | null;
  example_values: string | null;
  private: boolean;
  /** `user` (defined by a person) or `data` (inferred); anything else is kept verbatim (D-35). */
  source: string;
  used: boolean;
  deleting: boolean;
  locked_for_contact_migration: boolean;
  /** `null` = default group. */
  group: string | null;
  /** Monotonic position across the whole file (default group first, then `groups[]` in order); used for export round-trip ordering. */
  dm_index: number;
}

export interface DataManagerCustomersModel {
  are_all_used: boolean;
  default_private: boolean;
  /** Named group order from `groups[]` (excludes the default group, which has no name). */
  group_order: string[];
  properties: DataManagerCustomerProperty[];
  warnings: string[];
}

function parseProperty(
  raw: unknown,
  group: string | null,
  index: number,
  warnings: string[]
): DataManagerCustomerProperty | null {
  const path = group ? `groups[name=${group}].properties[${index}]` : `default_group.properties[${index}]`;
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
    private: raw.private === true,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'user',
    used: raw.used !== false,
    deleting: raw.deleting === true,
    locked_for_contact_migration: raw.locked_for_contact_migration === true,
    group,
    dm_index: index,
  };
}

export function parseDataManagerCustomers(json: unknown): DataManagerCustomersModel {
  const warnings: string[] = [];

  if (!isPlainObject(json)) {
    return {
      are_all_used: false,
      default_private: false,
      group_order: [],
      properties: [],
      warnings: ['data-manager-customers JSON must be an object.'],
    };
  }

  const are_all_used = json.are_all_used === true;
  const default_private = json.default_private === true;
  const properties: DataManagerCustomerProperty[] = [];
  let index = 0;

  if (json.default_group !== undefined) {
    if (isPlainObject(json.default_group)) {
      const rawProps = json.default_group.properties;
      if (Array.isArray(rawProps)) {
        for (const raw of rawProps) {
          const parsed = parseProperty(raw, null, index, warnings);
          if (parsed) properties.push(parsed);
          index++;
        }
      } else if (rawProps !== undefined) {
        warnings.push('default_group.properties must be an array; ignored.');
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
          warnings.push('groups[] entry must be {name, properties}; skipped.');
          continue;
        }
        const groupName = rawGroup.name.trim();
        group_order.push(groupName);
        const rawProps = rawGroup.properties;
        if (Array.isArray(rawProps)) {
          for (const raw of rawProps) {
            const parsed = parseProperty(raw, groupName, index, warnings);
            if (parsed) properties.push(parsed);
            index++;
          }
        } else if (rawProps !== undefined) {
          warnings.push(`groups[name=${groupName}].properties must be an array; ignored.`);
        }
      }
    } else {
      warnings.push('groups must be an array; ignored.');
    }
  }

  return { are_all_used, default_private, group_order, properties, warnings };
}
