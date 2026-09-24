/**
 * Parser for Bloomreach `expiration-settings.json` (PLAN "Import / export contracts" > Expiration
 * settings, D-04, D-22). Pure, strict-but-forgiving like `dataMapping.ts`: malformed pieces become
 * warnings, never a thrown exception. No DB or Express import (domain-model skill).
 */
import { EXPIRATION_UNITS } from '../enums';

export interface ExpirationBlock {
  enabled: boolean;
  /** `null` duration is valid (disabled, or enabled with no remembered duration yet — T-1-08 delta on `validateExpirationJson`). */
  count: number | null;
  units: string | null;
}

export interface ExpirationSettingsFilterCondition {
  property: string;
  operator: 'equals' | 'in';
  values: string[];
}

export interface ExpirationSettingsEvent {
  type: string;
  filter: ExpirationSettingsFilterCondition[];
  expiration: ExpirationBlock;
}

export interface ExpirationSettingsModel {
  events: ExpirationSettingsEvent[];
  other: ExpirationBlock;
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFilterCondition(
  eventType: string,
  index: number,
  item: unknown,
  warnings: string[]
): ExpirationSettingsFilterCondition | null {
  const path = `events[type=${eventType}].filter[${index}]`;
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
  return { property: attribute.property.trim(), operator, values: operator === 'equals' ? [values[0]] : values };
}

function parseExpirationBlock(value: unknown, label: string, warnings: string[]): ExpirationBlock {
  if (!isPlainObject(value)) {
    warnings.push(`${label} must be an object; treated as disabled.`);
    return { enabled: false, count: null, units: null };
  }
  const enabled = value.enabled === true;
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    warnings.push(`${label}.enabled must be a boolean; treated as false.`);
  }
  if (value.duration === null || value.duration === undefined) {
    return { enabled, count: null, units: null };
  }
  if (!isPlainObject(value.duration)) {
    warnings.push(`${label}.duration must be an object or null; treated as null.`);
    return { enabled, count: null, units: null };
  }
  const count = Number.isInteger(value.duration.count) ? (value.duration.count as number) : null;
  if (value.duration.count !== undefined && count === null) {
    warnings.push(`${label}.duration.count must be an integer; ignored.`);
  }
  const rawUnits = value.duration.units;
  const units = typeof rawUnits === 'string' ? rawUnits : null;
  if (units !== null && !(EXPIRATION_UNITS as readonly string[]).includes(units)) {
    warnings.push(`${label}.duration.units "${units}" is not one of ${EXPIRATION_UNITS.join(', ')}; ignored.`);
    return { enabled, count: null, units: null };
  }
  return { enabled, count, units };
}

export function parseExpirationSettings(json: unknown): ExpirationSettingsModel {
  const warnings: string[] = [];

  if (!isPlainObject(json)) {
    return { events: [], other: { enabled: false, count: null, units: null }, warnings: ['expiration-settings JSON must be an object.'] };
  }

  const events: ExpirationSettingsEvent[] = [];
  if (Array.isArray(json.events)) {
    json.events.forEach((raw, index) => {
      if (!isPlainObject(raw) || typeof raw.type !== 'string' || !raw.type.trim()) {
        warnings.push(`events[${index}] is missing "type"; skipped.`);
        return;
      }
      const filter = Array.isArray(raw.filter)
        ? raw.filter
            .map((item, i) => parseFilterCondition(raw.type as string, i, item, warnings))
            .filter((c): c is ExpirationSettingsFilterCondition => c !== null)
        : [];
      const expiration = parseExpirationBlock(raw.expiration, `events[type=${raw.type}].expiration`, warnings);
      events.push({ type: raw.type.trim(), filter, expiration });
    });
  } else if (json.events !== undefined) {
    warnings.push('events must be an array; ignored.');
  }

  const other = parseExpirationBlock(json.other, 'other', warnings);

  // `success` is part of the Bloomreach envelope but carries no data (PLAN); deliberately ignored.

  return { events, other, warnings };
}
