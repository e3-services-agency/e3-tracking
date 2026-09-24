/**
 * Shared field validators used across the Property, Event and Project DALs (T-1-04 fix round:
 * reviewer ERROR 1/5). One implementation for `expiration_json` (Event.expiration_json and
 * Project.default_expiration_json) and `derived_metrics_json` (Event) so the shape rule lives in
 * one place instead of being duplicated per DAL.
 */
import { BadRequestError } from '../errors';
import { EXPIRATION_UNITS } from '../../domain/enums';

/**
 * `null` clears the value; otherwise `{enabled: boolean, count: positive integer|null,
 * units: EXPIRATION_UNITS|null}`. `count`/`units` are only required when `enabled` is `true`
 * (T-1-08 delta): a disabled expiration with no duration — e.g. Bloomreach
 * `expiration-settings.json`'s `{enabled: false, duration: null}` (`consent`, `other`) — must be
 * representable so the import/export round trip does not lose it; forcing a duration on a
 * disabled toggle was never a real constraint (the UI's disabled expiration editor has no count
 * to give). When `enabled` is `false`, `count`/`units` may still be provided (and are validated if
 * so) so an event can be disabled while remembering its last configured duration.
 */
export function validateExpirationJson(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an object with enabled, count and units, or null.`, field);
  }
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') {
    throw new BadRequestError(`${field}.enabled must be a boolean.`, field);
  }
  const countProvided = v.count !== null && v.count !== undefined;
  const unitsProvided = v.units !== null && v.units !== undefined;
  if (v.enabled || countProvided) {
    if (!Number.isInteger(v.count) || (v.count as number) <= 0) {
      throw new BadRequestError(`${field}.count must be a positive integer.`, field);
    }
  }
  if (v.enabled || unitsProvided) {
    if (!(EXPIRATION_UNITS as readonly string[]).includes(String(v.units))) {
      throw new BadRequestError(`${field}.units must be one of: ${EXPIRATION_UNITS.join(', ')}.`, field);
    }
  }
}

/** `null`/undefined clears the value; otherwise an array of `{name, expression, description?}`. */
export function validateDerivedMetricsJson(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array.`, field);
  }
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new BadRequestError('Each derived metric needs a non-empty "name" and "expression".', field);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) {
      throw new BadRequestError('Each derived metric needs a non-empty "name".', field);
    }
    if (typeof row.expression !== 'string' || !row.expression.trim()) {
      throw new BadRequestError('Each derived metric needs a non-empty "expression".', field);
    }
    if (row.description !== undefined && row.description !== null && typeof row.description !== 'string') {
      throw new BadRequestError('A derived metric "description" must be a string or null.', field);
    }
  }
}

/** `null`/undefined clears the value; otherwise an array of strings. */
export function validateStringArray(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new BadRequestError(`${field} must be an array of strings.`, field);
  }
}
