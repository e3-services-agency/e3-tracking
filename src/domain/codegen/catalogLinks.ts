/**
 * Catalog link comments for the client snippets (D-61 amendment, T-4-11B). Pure: the service resolves
 * each catalog-linked property to its catalog, lookup field and markets; this renders one comment line each.
 */
export interface CatalogLinkForCodegen {
  property: string;
  catalog: string;
  field: string;
  /** `all markets`, or the markets that have the field, comma-joined (`GB, CZ`). */
  markets: string;
}

/** "product_id looks up products_gb by item_id; all markets", one `//` line per link; empty string when none. */
export function catalogLinkComment(links: readonly CatalogLinkForCodegen[] | undefined): string {
  if (!links || links.length === 0) return '';
  return links.map((l) => `// ${l.property} looks up ${l.catalog} by ${l.field}; ${l.markets}`).join('\n');
}

/** Prepends the comment block to a snippet (a blank snippet stays blank). */
export function withCatalogComment(snippet: string, comment: string): string {
  return snippet.trim() === '' || comment === '' ? snippet : `${comment}\n${snippet}`;
}

/** The markets label: `all markets` when every catalog of the kind has the field, else the markets (or catalog names) that do. */
export function marketsLabel(kindCatalogs: { name: string; market: string | null; has_field: boolean }[]): string {
  const having = kindCatalogs.filter((c) => c.has_field);
  if (having.length === kindCatalogs.length) return 'all markets';
  return having.map((c) => c.market || c.name).join(', ');
}
