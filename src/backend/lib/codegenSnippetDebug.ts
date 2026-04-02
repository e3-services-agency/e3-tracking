/**
 * Opt-in diagnostics for shared-journey / codegen snippet classification.
 * Set env `E3_DEBUG_SNIPPET_PROPERTY_NAME` to a property's canonical `property_name`
 * (e.g. `placement`) to log one property's path through shared snippets + codegen.
 * No hardcoded property names in logic — filter is env-driven only.
 */
export function debugSnippetPropertyName(): string | null {
  const v = process.env.E3_DEBUG_SNIPPET_PROPERTY_NAME;
  return typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : null;
}

export function matchesDebugSnippetProperty(propertyName: string | undefined | null): boolean {
  const d = debugSnippetPropertyName();
  if (!d) return false;
  return String(propertyName || '').trim().toLowerCase() === d;
}
