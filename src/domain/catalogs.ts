/**
 * Catalog helpers shared by the DAL, the checks and the documents (D-61, T-4-11B). Pure.
 */
import { CATALOG_SEARCHABLE_LIMIT, type CatalogKind } from './enums';
import { moveItem } from './moveItem';

/**
 * The catalog kind a new catalog gets when none is chosen: the Bloomreach mapping role decides
 * first (main -> product, variant -> variant), then a free-text `catalog_type` that names a kind;
 * `other` otherwise. The same rule the 0029 migration backfills with.
 */
export function deriveCatalogKind(mappingRole: string | null | undefined, catalogType: string | null | undefined): CatalogKind {
  if (mappingRole === 'main') return 'product';
  if (mappingRole === 'variant') return 'variant';
  const t = (catalogType ?? '').toLowerCase();
  if (t.includes('variant')) return 'variant';
  if (t.includes('product')) return 'product';
  return 'other';
}

/** The sorted names of the searchable fields (the set the v1 go-live snapshot stores). */
export function searchableFieldNames(fields: readonly { name: string; is_searchable: boolean }[]): string[] {
  return fields.filter((f) => f.is_searchable).map((f) => f.name).sort();
}

/** "GB / en-GB" style label for a catalog's market and language; empty when neither is recorded. */
export function catalogMarketLabel(market: string | null | undefined, language: string | null | undefined): string {
  return [market, language].filter((v) => v && v.trim()).join(' / ');
}

/** The minimum a catalog field row needs for the table editor's validation (T-4-33). */
export interface CatalogFieldDraftLike {
  key: string;
  name: string;
  data_type: string | null;
  is_lookup_key: boolean;
  is_searchable: boolean;
}

export interface CatalogFieldValidation {
  /** Row key -> messages for that row. */
  rowErrors: Record<string, string[]>;
  /** Every reason the catalog cannot be saved, deduplicated, in plain words. */
  reasons: string[];
  searchableCount: number;
  ok: boolean;
}

/** Pure write-time check for the catalog field table: empty or duplicate names, lookup key rules, searchable limit. */
export function validateCatalogFields(fields: readonly CatalogFieldDraftLike[]): CatalogFieldValidation {
  const rowErrors: Record<string, string[]> = {};
  const reasons: string[] = [];
  const add = (key: string, msg: string, reason: string) => {
    (rowErrors[key] ??= []).push(msg);
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const counts = new Map<string, number>();
  for (const f of fields) {
    const n = f.name.trim();
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  for (const f of fields) {
    const n = f.name.trim();
    if (!n) add(f.key, 'Name is required.', 'A field has no name.');
    else if ((counts.get(n) ?? 0) > 1) add(f.key, `Duplicate name "${n}".`, `Field name "${n}" is used more than once.`);
    if (f.is_lookup_key && (f.data_type ?? 'string') !== 'string') {
      add(f.key, 'The lookup key must be a string.', 'The lookup key field must have the data type string.');
    }
  }
  const keys = fields.filter((f) => f.is_lookup_key);
  if (keys.length > 1) {
    for (const f of keys) add(f.key, 'Only one lookup key is allowed.', 'More than one field is the lookup key.');
  }
  const searchableCount = fields.filter((f) => f.is_searchable).length;
  if (searchableCount > CATALOG_SEARCHABLE_LIMIT) {
    reasons.push(`${searchableCount} searchable fields, the limit is ${CATALOG_SEARCHABLE_LIMIT}.`);
    for (const f of fields.filter((x) => x.is_searchable)) (rowErrors[f.key] ??= []).push('Over the searchable limit.');
  }
  return { rowErrors, reasons, searchableCount, ok: reasons.length === 0 };
}

/** Moves the field with `key` up (-1) or down (+1); unchanged copy at the ends or for an unknown key. */
export function moveFieldByKey<T extends { key: string }>(fields: readonly T[], key: string, delta: -1 | 1): T[] {
  const from = fields.findIndex((f) => f.key === key);
  return moveItem(fields, from, from + delta);
}

/** Makes `key` the only lookup key (radio semantics) and, if it is not a string, flips its type to string. */
export function setLookupKey<T extends CatalogFieldDraftLike>(fields: readonly T[], key: string): T[] {
  return fields.map((f) => ({ ...f, is_lookup_key: f.key === key, ...(f.key === key ? { data_type: 'string' } : {}) }));
}
