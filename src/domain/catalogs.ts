/**
 * Catalog helpers shared by the DAL, the checks and the documents (D-61, T-4-11B). Pure.
 */
import type { CatalogKind } from './enums';

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
