/**
 * Value/format checks shared by `itemSchema.ts` (D-30 ItemSchema) and, later, the comparison
 * engine's own format checks (`definitionVsObservations.ts` currently inlines its own; T-2-05's
 * plan-referenced `snapshot.ts`/`valueChecks.ts` module is expected to consolidate that — this
 * file only covers what T-2-06 needs: the item-level `data_type` check and the new `e164_phone`
 * format, D-30).
 */
import { toNumber } from './operators';

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

/** Minimal per-`data_type` shape check for one item-schema field value; mirrors the base types
 * `definitionVsObservations.ts` checks at the event level, scoped down to what an item field can be. */
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

/** Per-format check for one item-schema field value; only formats with a real check are covered
 * (mirrors `definitionVsObservations.ts`'s documented "not checked" list) plus `e164_phone` (D-30). */
export function checkDataFormat(value: unknown, format: string): boolean {
  switch (format) {
    case 'e164_phone':
      return isE164Phone(value);
    case 'email':
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'uri':
      return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
    case 'uuid':
      return (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      );
    case 'iso8601_date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'iso8601_datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    default:
      // unix_seconds/unix_milliseconds/money/currency_code/country_code/language_code: not
      // checked here either (same rationale as definitionVsObservations.ts).
      return true;
  }
}
