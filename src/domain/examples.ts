/**
 * Example value helpers (T-4-19, D-53 amendment 7). Pure.
 *
 * Root cause of the escaped-JSON examples (`[{"value":"\"2023\""}]`): Bloomreach's Data Manager
 * `example_values` text for an array property is the JSON-ish rendering of the array, e.g.
 * `"2023"]` or `["a","b"]`; the import stored that text verbatim as `{value: '"2023"]'}` and the
 * views printed `JSON.stringify` of the stored list. `parseBloomreachExample` unwraps it at the
 * source; the `format*` helpers render stored examples readably.
 */

const QUOTED = String.raw`"((?:[^"\\]|\\.)*)"`;
const QUOTED_LIST = new RegExp(`^${QUOTED}(?:\\s*,\\s*${QUOTED})*$`);
const QUOTED_TOKEN = new RegExp(QUOTED, 'g');

/** Unwraps Bloomreach's quoted / bracketed example text into plain values. Plain text is returned as one value. */
export function parseBloomreachExample(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '(empty)') return [];
  let inner = trimmed;
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);
  inner = inner.trim();
  if (inner.length >= 2 && QUOTED_LIST.test(inner)) {
    const out: string[] = [];
    for (const m of inner.matchAll(QUOTED_TOKEN)) out.push(m[1].replace(/\\(.)/g, '$1'));
    return out;
  }
  return [raw];
}

/** Stored-shape helper: `{value}[]` for `example_values_json`. */
export function toExampleValuesJson(raw: string | null | undefined): { value: string }[] {
  return parseBloomreachExample(raw).map((value) => ({ value }));
}

/**
 * Scalar strings out of a stored example (`{value}[]`, plain array or single string), rendered
 * as stored: no re-parsing at render time (the import and migration 0026 already normalise), so a
 * literal `"hello"` keeps its quotes and a stored `"a","b"` renders as that text.
 */
export function exampleValueStrings(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return typeof raw === 'string' ? (raw === '' ? [] : [raw]) : [String(raw)];
  return raw
    .map((item) => {
      const x = item !== null && typeof item === 'object' && 'value' in (item as object) ? (item as { value: unknown }).value : item;
      return typeof x === 'string' ? x : x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x ?? '');
    })
    .filter((v) => v !== '');
}

/** Readable one-line rendering of stored examples, comma separated. */
export function formatExampleValues(raw: unknown): string {
  return exampleValueStrings(raw).join(', ');
}

export interface DisplayExample {
  text: string;
  /** True for objects / arrays of objects: render as a pretty-printed code block. */
  block: boolean;
}

/** Readable rendering of a generated sample payload value (`EventCard` property `example`). */
export function displaySampleValue(v: unknown): DisplayExample {
  if (v === null || v === undefined) return { text: '', block: false };
  if (typeof v === 'string') return { text: v, block: false };
  if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v), block: false };
  if (Array.isArray(v) && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
    return { text: v.map((x) => String(x ?? '')).join(', '), block: false };
  }
  return { text: JSON.stringify(v, null, 2), block: true };
}
