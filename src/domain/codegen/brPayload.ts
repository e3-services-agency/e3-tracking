/**
 * The shared transformation (D-63): `bloomreach` dataLayer object -> Bloomreach event payload.
 * A fixed, versioned artefact owned by E3, shipped as a GTM custom template and as the JS helper
 * `brPayload`. `BR_PAYLOAD_SOURCE` is the text shipped to clients; `computeBrPayload` is the same
 * logic in TypeScript, used to build the codegen samples. A unit test evaluates the source text
 * and asserts both produce identical output.
 */
import type { NamedDerivation } from './derivation';

export const BR_PAYLOAD_VERSION = '1';

export interface BloomreachDataLayer {
  event?: string;
  properties?: Record<string, unknown>;
  item?: Record<string, unknown>;
  items?: Record<string, unknown>[];
}

function defined(v: unknown): boolean {
  return v !== undefined && v !== null;
}

function sumOver(items: Record<string, unknown>[], expr: string): number {
  const fields = expr.split('*').map((f) => f.trim()).filter(Boolean);
  let total = 0;
  for (const it of items) {
    let product = 1;
    for (const f of fields) product *= Number(it[f]) || 0;
    total += product;
  }
  return Math.round(total * 1e6) / 1e6;
}

export function computeBrPayload(br: BloomreachDataLayer | null | undefined, rules?: NamedDerivation[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!br) return out;
  const props = br.properties || {};
  const item = br.item || {};
  const items = br.items || [];
  for (const k of Object.keys(props)) out[k] = props[k];
  for (const k of Object.keys(item)) out[k] = item[k];
  for (const r of rules || []) {
    if (defined(props[r.name])) continue; // a supplied value wins over the computed one
    if ('sum' in r) {
      out[r.name] = sumOver(items, r.sum);
    } else if (r.form === 'ids') {
      out[r.name] = items.map((i) => i[r.id_field]).filter(defined);
    } else {
      const q = r.quantity_field || 'quantity';
      out[r.name] = items
        .filter((i) => defined(i[r.id_field]))
        .map((i) => ({ [r.id_field]: i[r.id_field], [q]: i[q] }));
    }
  }
  return out;
}

/** JS text of the helper, shipped in the `gtm_template` snippet. Keep behaviour in sync with `computeBrPayload`. */
export const BR_PAYLOAD_SOURCE = `function brPayload(br, rules) {
  var out = {};
  if (!br) return out;
  var props = br.properties || {};
  var item = br.item || {};
  var items = br.items || [];
  function defined(v) { return v !== undefined && v !== null; }
  Object.keys(props).forEach(function (k) { out[k] = props[k]; });
  Object.keys(item).forEach(function (k) { out[k] = item[k]; });
  (rules || []).forEach(function (r) {
    if (defined(props[r.name])) return; // a supplied value wins over the computed one
    if (r.sum) {
      var fields = r.sum.split('*');
      var total = 0;
      items.forEach(function (it) {
        var product = 1;
        fields.forEach(function (f) { product *= Number(it[f.trim()]) || 0; });
        total += product;
      });
      out[r.name] = Math.round(total * 1e6) / 1e6;
    } else if (r.form === 'ids') {
      out[r.name] = items.map(function (i) { return i[r.id_field]; }).filter(defined);
    } else {
      var q = r.quantity_field || 'quantity';
      out[r.name] = items.filter(function (i) { return defined(i[r.id_field]); }).map(function (i) {
        var o = {};
        o[r.id_field] = i[r.id_field];
        o[q] = i[q];
        return o;
      });
    }
  });
  return out;
}`;
