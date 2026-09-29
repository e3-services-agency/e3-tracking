/** JS literal text for sample values in generated snippets (single-quoted strings, sorted keys). */

export function compareKeys(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function jsLiteral(value: unknown, indent: string = '  '): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    // Escape backslash, single quote, and newlines/tabs to keep snippets copy/paste-safe.
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
    return `'${escaped}'`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const innerIndent = indent + '  ';
    return `[${value.map((v) => jsLiteral(v, innerIndent)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort(compareKeys);
    if (keys.length === 0) return '{}';
    const innerIndent = indent + '  ';
    const lines = keys.map((k) => `${innerIndent}${k}: ${jsLiteral(o[k], innerIndent)}`);
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}
