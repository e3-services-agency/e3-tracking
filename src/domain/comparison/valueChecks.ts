/**
 * Shared value/format checks for every comparison engine and the rules evaluator (T-2-05, plan
 * "Comparison engine design": "shared `valueChecks.ts` (extracted from comparison 3: `jsType`,
 * `matchesDataType`, `FORMAT_CHECKS` incl. `e164_phone`, `long_text` no-op)"). Pure, no DB/Express
 * import (domain-model skill).
 *
 * Extraction history: `definitionVsObservations.ts` (T-1-09) originally defined `jsType`/
 * `matchesDataType`/`FORMAT_CHECKS` inline; `src/domain/rules/valueChecks.ts` (T-2-06) kept its own
 * diverging copy (`checkDataType`/`checkDataFormat`, item-schema-scoped) with a documented note that
 * T-2-05 would consolidate ownership here. This module is now the single source: comparison 3
 * re-exports/imports from here instead of defining its own copies (see `definitionVsObservations.ts`
 * header), and `src/domain/rules/itemSchema.ts` imports `checkDataType`/`checkDataFormat` from here
 * too. `src/domain/rules/valueChecks.ts` is deleted (T-2-05).
 */
import { toNumber } from '../rules/operators';

/** JSON-value "type" of an observed value, `array`/`null` distinguished from `object` (event-level checks, T-1-09). */
export function jsType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** `data_type` acceptance rule for an observed *event-level* property value (comparison 3's table: `timestamp` accepts number or ISO string). */
export function matchesDataType(dataType: string, value: unknown): boolean {
  const type = jsType(value);
  switch (dataType) {
    case 'string':
      return type === 'string';
    case 'number':
      return type === 'number';
    case 'boolean':
      return type === 'boolean';
    case 'object':
      return type === 'object';
    case 'array':
      return type === 'array';
    case 'timestamp':
      return type === 'number' || (type === 'string' && !Number.isNaN(Date.parse(String(value))));
    default:
      return true;
  }
}

/** `e164_phone` (D-30): starts with `+` or `00`, then digits only, 8 to 15 digits total. */
export function isE164Phone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let digits: string;
  if (value.startsWith('+')) digits = value.slice(1);
  else if (value.startsWith('00')) digits = value.slice(2);
  else return false;
  if (!/^[0-9]+$/.test(digits)) return false;
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Format checks for `format_violation` (event-level, string values only), against
 * `src/domain/enums.ts`'s `PROPERTY_DATA_FORMATS`: `email`, `uri`, `uuid`, `iso8601_date`,
 * `iso8601_datetime`, `currency_code`, `country_code`, `language_code`, `e164_phone` (D-30).
 * `long_text` (D-37) has no shape to check — any string qualifies, so it is intentionally absent
 * from this map (no check registered means "not checked", matching `unix_seconds`/`unix_milliseconds`/
 * `money` below).
 *
 * Not checked: `unix_seconds`/`unix_milliseconds` (a plain number cannot be distinguished from any
 * other number without a plausible-range heuristic, which would be more guess than check) and
 * `money` (drives the `rounding_drift` rule instead of a format check — D-25 Q12).
 */
export const FORMAT_CHECKS: Record<string, (value: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  iso8601_date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
  iso8601_datetime: (v) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(v) && !Number.isNaN(Date.parse(v)),
  currency_code: (v) => /^[A-Z]{3}$/.test(v),
  country_code: (v) => /^[A-Z]{2}$/.test(v),
  language_code: (v) => /^[a-z]{2}$/.test(v),
  e164_phone: (v) => isE164Phone(v),
};

/** Minimal per-`data_type` shape check for one item-schema field value (T-2-06, moved here T-2-05). */
export function checkDataType(value: unknown, dataType: string): boolean {
  switch (dataType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return toNumber(value) !== null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'timestamp':
      return typeof value === 'string' || typeof value === 'number';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      // Unknown data_type: don't fail an item over a schema typo the property editor should
      // have already rejected (data_type is validated against PROPERTY_DATA_TYPES on write).
      return true;
  }
}

/** Per-format check for one item-schema field value (T-2-06, moved here T-2-05); shares `FORMAT_CHECKS` plus `e164_phone`. */
export function checkDataFormat(value: unknown, format: string): boolean {
  if (typeof value !== 'string') return format === 'e164_phone' ? isE164Phone(value) : true;
  const check = FORMAT_CHECKS[format];
  return check ? check(value) : true;
}
