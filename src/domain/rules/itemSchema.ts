/**
 * Item schema validator (D-30 ItemSchema, T-2-06): for an array-typed linked property with
 * `item_schema_json`, checks each item's required fields, `data_type` and `data_formats` against
 * `src/domain/comparison/valueChecks.ts` (T-2-05: the single shared value-check module, folding in
 * this file's former local copy). Returns violations; the caller (comparison engine, T-2-07) turns
 * each into one `item_schema_violation` finding per `(event, property, field, reason)` (plan "Rules
 * evaluator").
 */
import type { ItemSchemaField, ItemSchemaViolation } from './types';
import { checkDataFormat, checkDataType } from '../comparison/valueChecks';

/** Validates one array of items against an `ItemSchemaField[]`. `items` that are not plain
 * objects are skipped for field-level checks (a missing/malformed item is a shape problem outside
 * this validator's scope, matching `data_type: 'array'`'s own format check). */
export function validateItems(items: unknown[], schema: ItemSchemaField[]): ItemSchemaViolation[] {
  const violations: ItemSchemaViolation[] = [];
  items.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return;
    const row = item as Record<string, unknown>;
    for (const fieldSchema of schema) {
      const value = row[fieldSchema.field];
      const present = value !== undefined && value !== null && value !== '';
      if (!present) {
        if (fieldSchema.required) {
          violations.push({ index, field: fieldSchema.field, reason: 'missing_required' });
        }
        continue;
      }
      if (!checkDataType(value, fieldSchema.data_type)) {
        violations.push({ index, field: fieldSchema.field, reason: 'wrong_type' });
        continue;
      }
      for (const format of fieldSchema.data_formats ?? []) {
        if (!checkDataFormat(value, format)) {
          violations.push({ index, field: fieldSchema.field, reason: 'format_violation' });
          break;
        }
      }
    }
  });
  return violations;
}

/** `properties.item_schema_json` shape guard, used by the property DAL (400 `ITEM_SCHEMA_REQUIRES_ARRAY`
 * lives in the DAL since it needs the property's own `data_type`; this only checks the schema's own shape). */
export function isValidItemSchemaShape(value: unknown): value is ItemSchemaField[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (row) =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as Record<string, unknown>).field === 'string' &&
      (row as Record<string, unknown>).field !== '' &&
      typeof (row as Record<string, unknown>).data_type === 'string'
  );
}
