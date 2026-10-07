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

// ---------------------------------------------------------------------------
// Enum examples (T-5-11): examples of a property with allowed values come from the allowed set.
// ---------------------------------------------------------------------------

/** Number of examples shown for an enum when the stored ones do not fill it up. */
export const ENUM_EXAMPLE_COUNT = 2;

export interface ExampleSource {
  allowed_values_json?: unknown;
  example_values_json?: unknown;
  data_type?: string | null;
}

/** Allowed value strings out of a stored `allowed_values_json` (`{value}[]` or plain strings). */
export function allowedValueStrings(raw: unknown): string[] {
  return exampleValueStrings(raw);
}

/**
 * Examples to render/export. With a non-empty allowed set: stored examples that are allowed values
 * first (deduped, stored order), then allowed values until two examples; stored examples outside
 * the set are ignored. With no allowed set: the stored examples as they are.
 */
export function exampleValuesFor(src: ExampleSource): { value: string }[] {
  const stored = exampleValueStrings(src.example_values_json);
  const allowed = [...new Set(allowedValueStrings(src.allowed_values_json))];
  if (allowed.length === 0) return stored.map((value) => ({ value }));
  const set = new Set(allowed);
  const out: string[] = [];
  for (const s of stored) if (set.has(s) && !out.includes(s)) out.push(s);
  for (const a of allowed) {
    if (out.length >= ENUM_EXAMPLE_COUNT) break;
    if (!out.includes(a)) out.push(a);
  }
  return out.map((value) => ({ value }));
}

/** Stored examples that are not in the allowed set (empty when there is no allowed set). */
export function disallowedExamples(src: ExampleSource): string[] {
  const allowed = new Set(allowedValueStrings(src.allowed_values_json));
  if (allowed.size === 0) return [];
  return exampleValueStrings(src.example_values_json).filter((s) => !allowed.has(s));
}

/** True when every stored example is an allowed value (or there is no allowed set). */
export function isExampleAllowed(src: ExampleSource): boolean {
  return disallowedExamples(src).length === 0;
}

/** Warning strings for the write responses. */
export function exampleWarnings(src: ExampleSource): string[] {
  return disallowedExamples(src).map((v) => `example ${v} is not an allowed value`);
}

/** Splits a sheet example cell of the form "a / b / ..." into tokens that are all allowed values; else null. */
export function splitEnumExampleCell(cell: string | null | undefined, allowed: string[]): string[] | null {
  if (!cell) return null;
  const set = new Set(allowed);
  const tokens = cell.split('/').map((t) => t.trim()).filter((t) => t !== '' && t !== '...' && t !== '…');
  if (tokens.length === 0) return null;
  return tokens.every((t) => set.has(t)) ? [...new Set(tokens)] : null;
}
