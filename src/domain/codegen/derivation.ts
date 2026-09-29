/**
 * Property derivation rules (D-63, T-4-17): how a `state_list` property is computed from the
 * `bloomreach.items` collection of the dataLayer object. Pure, no server imports.
 *
 * - List: `{source: 'items', id_field: 'product_id', form: 'ids'}` gives `['a', 'b']`;
 *   `form: 'id_quantity'` gives `[{product_id: 'a', quantity: 1}, ...]`. `quantity_field` (default
 *   `quantity`) names the SOURCE field on each item; the output entry key is always `quantity`.
 * - Total: `{source: 'items', sum: 'price*quantity'}` sums the product of the named item fields
 *   over all items (`sum: 'quantity'` is a plain sum).
 */
import { DERIVATION_FORMS, type DerivationForm } from '../enums';

export interface ListDerivation {
  source: 'items';
  id_field: string;
  form: DerivationForm;
  quantity_field?: string;
}

export interface SumDerivation {
  source: 'items';
  /** Item field names joined by `*`, e.g. `price*quantity`. */
  sum: string;
}

export type PropertyDerivation = ListDerivation | SumDerivation;

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isListDerivation(d: PropertyDerivation | null | undefined): d is ListDerivation {
  return !!d && 'form' in d;
}

export function isSumDerivation(d: PropertyDerivation | null | undefined): d is SumDerivation {
  return !!d && 'sum' in d;
}

/** Field names a sum expression multiplies (`price*quantity` gives `['price', 'quantity']`). */
export function sumFields(sum: string): string[] {
  return sum.split('*').map((f) => f.trim()).filter(Boolean);
}

/**
 * Returns an error message when `value` is not a valid derivation, else `null`. `null`/`undefined`
 * is valid (no rule).
 */
export function validateDerivation(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'derivation_json must be an object.';
  const d = value as Record<string, unknown>;
  if (d.source !== 'items') return 'derivation_json.source must be "items".';
  if ('sum' in d) {
    if (typeof d.sum !== 'string' || d.sum.trim() === '') return 'derivation_json.sum must be a non-empty string.';
    // Every term must be a field name: an empty term ("price*") is rejected, never silently dropped.
    const terms = d.sum.split('*').map((t) => t.trim());
    if (terms.some((f) => !FIELD_NAME.test(f))) {
      return 'derivation_json.sum must be item field names joined by "*", e.g. "price*quantity".';
    }
    return null;
  }
  if (typeof d.id_field !== 'string' || !FIELD_NAME.test(d.id_field)) {
    return 'derivation_json.id_field must be an item field name.';
  }
  if (!(DERIVATION_FORMS as readonly unknown[]).includes(d.form)) {
    return `derivation_json.form must be one of: ${DERIVATION_FORMS.join(', ')}.`;
  }
  if (d.quantity_field !== undefined && (typeof d.quantity_field !== 'string' || !FIELD_NAME.test(d.quantity_field))) {
    return 'derivation_json.quantity_field must be an item field name.';
  }
  return null;
}

/** Normalises a stored value to a `PropertyDerivation`, or `null` when absent/invalid. */
export function parseDerivation(value: unknown): PropertyDerivation | null {
  if (validateDerivation(value) !== null || value === null || value === undefined) return null;
  return value as PropertyDerivation;
}

/** Human-readable rule, e.g. `product_id of each item` or `sum of price*quantity over items`. */
export function describeDerivation(d: PropertyDerivation | null | undefined): string | null {
  if (!d) return null;
  if (isSumDerivation(d)) return `sum of ${d.sum} over items`;
  const q = d.quantity_field || 'quantity';
  return d.form === 'ids' ? `${d.id_field} of each item` : `{${d.id_field}, ${q}} of each item`;
}

/** A derivation rule with the property name it fills; the shape `brPayload` consumes. */
export type NamedDerivation = { name: string } & (
  | { form: DerivationForm; id_field: string; quantity_field?: string }
  | { sum: string }
);

export function toNamedDerivation(name: string, d: PropertyDerivation): NamedDerivation {
  if (isSumDerivation(d)) return { name, sum: d.sum };
  return d.quantity_field
    ? { name, form: d.form, id_field: d.id_field, quantity_field: d.quantity_field }
    : { name, form: d.form, id_field: d.id_field };
}

/** The dataLayer path of a property by kind (`bloomreach.properties.x`, `bloomreach.item.x`, ...). */
export function dataLayerPath(kind: string, name: string, derivation: PropertyDerivation | null | undefined): string {
  if (kind === 'item') return `bloomreach.item.${name}`;
  if (kind === 'state_list') return derivation ? 'computed from items' : `bloomreach.properties.${name}`;
  return `bloomreach.properties.${name}`;
}
