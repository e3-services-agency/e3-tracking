/**
 * Single shared `escapeHtml` for the documentation export (D-04: exports are plain files, no
 * templating engine). Both `export.service.ts` and `docs/sections.ts` import from here (T-1-06
 * integration fix: the two files used to each define their own copy).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
