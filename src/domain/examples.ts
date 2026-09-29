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

/** Scalar strings out of any stored example shape (`{value}[]`, plain array, JSON text, string). */
export function exampleValueStrings(raw: unknown): string[] {
  let v = raw;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        v = JSON.parse(t);
      } catch {
        return parseBloomreachExample(v as string);
      }
    } else return parseBloomreachExample(v);
  }
  if (!Array.isArray(v)) return v === null || v === undefined ? [] : [String(v)];
  return v.map((item) => {
    const x = item !== null && typeof item === 'object' && 'value' in (item as object) ? (item as { value: unknown }).value : item;
    return typeof x === 'string' ? parseBloomreachExample(x)[0] ?? '' : x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x ?? '');
  }).filter((s) => s !== '');
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
