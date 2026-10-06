/**
 * Codegen v2 snippet builders (D-63, T-4-17): pure functions, no server imports. The backend
 * (`codegen.service.ts`) maps attached properties to `CodegenProperty` (with the sample value) and
 * calls these. Output is plain text; validation always runs on the Bloomreach payload, never on
 * the dataLayer.
 */
import type { PropertyKind } from '../enums';
import { BR_PAYLOAD_SOURCE, BR_PAYLOAD_VERSION, computeBrPayload, type BloomreachDataLayer } from './brPayload';
import { sumFields, toNamedDerivation, type NamedDerivation, type PropertyDerivation } from './derivation';
import { compareKeys, jsLiteral } from './literal';

export interface CodegenProperty {
  /** Payload key (`payload_key` or property name). */
  name: string;
  kind: PropertyKind;
  derivation: PropertyDerivation | null;
  required: boolean;
  /** Link role (`normal` | `discriminator` | `context`). */
  role?: string;
  /** Sample value for this property (from `jsonSampleValueForProperty`). */
  sample: unknown;
}

export interface DataLayerModel {
  /** Event-level attributes in dataLayer `properties` (required A-Z, then optional A-Z). */
  properties: CodegenProperty[];
  /** Attributes of the one item interacted with (`item`). */
  item: CodegenProperty[];
  /** State lists / totals computed from `items` by a derivation rule. */
  computed: CodegenProperty[];
  rules: NamedDerivation[];
  /** One example `items` entry, in field order (ids, quantity, sum fields). */
  itemsEntry: { name: string; value: unknown }[];
  /** The `bloomreach` object built from the samples. */
  layer: BloomreachDataLayer;
  /** The final Bloomreach payload, in display order (required A-Z, then optional A-Z). */
  payload: Record<string, unknown>;
  /** Payload keys that are required. */
  requiredKeys: Set<string>;
}

function byRequiredThenName(a: CodegenProperty, b: CodegenProperty): number {
  if (a.required !== b.required) return a.required ? -1 : 1;
  return compareKeys(a.name, b.name);
}

function defaultItemFieldSample(name: string): unknown {
  if (/quantity/i.test(name)) return 1;
  if (/price|amount|total|cost|value/i.test(name)) return 123;
  return 'string';
}

/** F3: a quantity field is numeric whatever it is called (`qty`, `units`), 1 unless a numeric sample exists. */
function quantitySample(sample: unknown): number {
  return typeof sample === 'number' ? sample : 1;
}

/** Variant-level item attributes shown in the items example (T-4-23). */
const VARIANT_ATTRIBUTE = /(^|_)(size|colou?r)(_|$)/i;

export function buildDataLayerModel(all: CodegenProperty[]): DataLayerModel {
  const sorted = [...all].sort(byRequiredThenName);
  const isComputed = (p: CodegenProperty) => p.kind === 'state_list' && p.derivation !== null;
  const computed = sorted.filter(isComputed);
  const item = sorted.filter((p) => p.kind === 'item');
  const properties = sorted.filter((p) => p.kind !== 'item' && !isComputed(p));

  const rules = computed.map((p) => toNamedDerivation(p.name, p.derivation as PropertyDerivation));
  // Item properties first; a same-named property of any other kind is the fallback, so a project
  // whose id field was never marked kind=item (backfilled data) does not render 'string'.
  const itemSampleByName = new Map<string, unknown>();
  for (const p of sorted) if (p.kind !== 'item' && !isComputed(p)) itemSampleByName.set(p.name, p.sample);
  for (const p of item) itemSampleByName.set(p.name, p.sample);

  const fieldNames: string[] = [];
  const add = (n: string) => {
    if (!fieldNames.includes(n)) fieldNames.push(n);
  };
  for (const r of rules) if ('id_field' in r) add(r.id_field);
  // T-4-23: one entry per variant line carries the product and variant ids plus variant-level
  // attributes (size, colour) whenever the project defines them as item properties.
  if (item.length > 0 || itemSampleByName.has('product_id')) {
    for (const id of ['product_id', 'variant_id']) if (itemSampleByName.has(id)) add(id);
    for (const p of item) if (VARIANT_ATTRIBUTE.test(p.name)) add(p.name);
  }
  for (const r of rules) if ('form' in r && r.form === 'id_quantity') add(r.quantity_field || 'quantity');
  for (const r of rules) if ('sum' in r) for (const f of sumFields(r.sum)) add(f);
  const quantityFields = new Set<string>(['quantity']);
  for (const r of rules) if ('form' in r && r.form === 'id_quantity') quantityFields.add(r.quantity_field || 'quantity');
  // Every field multiplied in a sum is numeric too.
  const sumTerms = new Set<string>();
  for (const r of rules) if ('sum' in r) for (const f of sumFields(r.sum)) sumTerms.add(f);
  const itemsEntry = fieldNames.map((name) => {
    const sample = itemSampleByName.get(name);
    if (quantityFields.has(name)) return { name, value: quantitySample(sample) };
    if (sumTerms.has(name)) return { name, value: typeof sample === 'number' ? sample : /quantity/i.test(name) ? 1 : 123 };
    return { name, value: itemSampleByName.has(name) ? sample : defaultItemFieldSample(name) };
  });

  const layer: BloomreachDataLayer = {
    properties: Object.fromEntries(properties.map((p) => [p.name, p.sample])),
    item: Object.fromEntries(item.map((p) => [p.name, p.sample])),
    items: itemsEntry.length > 0 ? [Object.fromEntries(itemsEntry.map((f) => [f.name, f.value]))] : [],
  };
  const built = computeBrPayload(layer, rules);
  const payload: Record<string, unknown> = {};
  for (const p of sorted) if (p.name in built) payload[p.name] = built[p.name];
  for (const k of Object.keys(built)) if (!(k in payload)) payload[k] = built[k];
  return {
    properties,
    item,
    computed,
    rules,
    itemsEntry,
    layer,
    payload,
    requiredKeys: new Set(sorted.filter((p) => p.required).map((p) => p.name)),
  };
}

function propertyLines(props: CodegenProperty[], indent: string): string[] {
  const lines: string[] = [];
  let optionalHeader = false;
  for (const p of props) {
    if (!p.required && !optionalHeader) {
      lines.push(`${indent}// Optional:`);
      optionalHeader = true;
    }
    lines.push(`${indent}${p.name}: ${jsLiteral(p.sample, indent)},`);
  }
  return lines;
}

function payloadLines(payload: Record<string, unknown>, required: Set<string>, indent: string): string[] {
  const lines: string[] = [];
  let optionalHeader = false;
  for (const [k, v] of Object.entries(payload)) {
    if (!required.has(k) && !optionalHeader) {
      lines.push(`${indent}// Optional:`);
      optionalHeader = true;
    }
    lines.push(`${indent}${k}: ${jsLiteral(v, indent)},`);
  }
  return lines;
}

export interface EventNames {
  /** Bloomreach event name as pushed in `bloomreach.event` / tracked. */
  bloomreach: string;
  /** The site's dataLayer event carrying it (`events.dl_event_name`), or `null`. */
  dataLayer: string | null;
}

/** (a) The reset push plus the namespaced push, D-63 shape. */
export function buildDataLayerV2(names: EventNames, model: DataLayerModel): string {
  const siteEvent = names.dataLayer?.trim() || names.bloomreach;
  const lines: string[] = [
    "// E3's recommended practice (D-63): one namespaced 'bloomreach' object on the site's existing",
    '// event, so GA4 and other keys on the dataLayer root are never touched. The client may structure',
    '// the dataLayer differently; validation always runs on the Bloomreach event payload, not here.',
    'window.dataLayer = window.dataLayer || [];',
    'window.dataLayer.push({ bloomreach: null }); // reset, so nothing leaks from the previous event',
    'window.dataLayer.push({',
    names.dataLayer?.trim()
      ? `  event: ${jsLiteral(siteEvent)}, // the site's existing dataLayer event, unchanged`
      : `  event: ${jsLiteral(siteEvent)}, // the site's dataLayer event carrying this Bloomreach event (set dl_event_name in the plan)`,
    '  bloomreach: {',
    `    event: ${jsLiteral(names.bloomreach)},`,
  ];
  if (model.properties.length > 0) {
    lines.push('    properties: {', ...propertyLines(model.properties, '      '), '    },');
  }
  if (model.item.length > 0) {
    lines.push('    item: {', ...propertyLines(model.item, '      '), '    },');
  }
  if (model.computed.length > 0) {
    lines.push(
      `    // Computed by brPayload from items: ${model.computed.map((p) => p.name).join(', ')}`,
      '    // (put a value in properties to override a computed one)'
    );
  }
  if (model.itemsEntry.length > 0) {
    lines.push('    // Recommended practice: one entry per variant line (product_id plus variant_id), the whole',
      '    // collection after the action; product_ids/variant_ids and the *_list values are computed from it.',
      '    items: [',
      '      {');
    for (const f of model.itemsEntry) lines.push(`        ${f.name}: ${jsLiteral(f.value, '        ')},`);
    lines.push('      },', '    ],');
  }
  lines.push('  },', '});');
  return lines.join('\n');
}

/** (b) The shared transformation plus the GTM custom template setup. */
export function buildGtmTemplate(names: EventNames, model: DataLayerModel): string {
  const siteEvent = names.dataLayer?.trim() || names.bloomreach;
  const rules =
    model.rules.length > 0 ? `[\n${model.rules.map((r) => `  ${JSON.stringify(r)},`).join('\n')}\n]` : '[]';
  return [
    `// E3 shared transformation, version ${BR_PAYLOAD_VERSION}. A fixed artefact: do not edit per client.`,
    '// Ships as the E3 GTM custom template and as this JS helper.',
    BR_PAYLOAD_SOURCE,
    '',
    "// This event's state lists and totals (from the property kinds in the plan):",
    `var BR_RULES = ${rules};`,
    '',
    '// GTM custom template setup',
    `//  1. Trigger: Custom Event "${siteEvent}", fires only when the Data Layer Variable "bloomreach" is defined.`,
    '//  2. Tag: the E3 Bloomreach tag (custom template) reads the Data Layer Variable "bloomreach".',
    `//  3. The tag calls the Web SDK: brweb.track(${jsLiteral(names.bloomreach)}, brPayload(dataLayer.bloomreach, BR_RULES));`,
    '//  4. One tag serves every event (it reads bloomreach.event); only the trigger differs per site event.',
  ].join('\n');
}

function trackSnippet(fn: string, eventName: string, model: DataLayerModel): string {
  const lines = ['// Final payload, as brPayload produces it from the dataLayer object.', `${fn}(${jsLiteral(eventName)}, {`];
  lines.push(...payloadLines(model.payload, model.requiredKeys, '  '));
  lines.push('});');
  return lines.join('\n');
}

/** (c) New Web SDK: `brweb.track(event, payload)`. */
export function buildWebSdkV2(eventName: string, model: DataLayerModel): string {
  return trackSnippet('brweb.track', eventName, model);
}

/** (d) Legacy Web SDK: `exponea.track(event, payload)`. */
export function buildWebSdkLegacy(eventName: string, model: DataLayerModel): string {
  return trackSnippet('exponea.track', eventName, model);
}

// Wording written from memory, verify against current Bloomreach docs (session_start / web_exit
// details in particular); kept cautious on purpose.
const SDK_EMITS: Record<string, string> = {
  session_start: 'Emitted by the Web SDK when a visit starts (SDK initialisation on a page while no session is open).',
  session_end: 'Generated by Bloomreach 20 minutes after the last SDK ping; no client code.',
  first_session: "Derived by Bloomreach from a customer's first session_start; no client code.",
  page_visit: 'Emitted by the Web SDK on each page load when the SDK track option for visits is enabled (off by default).',
  web_exit: 'Emitted by the Web SDK when the visitor leaves the site, when the exit-tracking option is enabled.',
};

/** Which SDK call or lifecycle emits an `sdk_auto` event. */
export function describeSdkEmits(eventName: string, eventClass: string | null | undefined): string {
  const known = SDK_EMITS[eventName];
  if (known) return `${eventName}: ${known} No tracking snippet is needed.`;
  if (eventClass === 'platform') {
    return `${eventName}: generated by the Bloomreach platform (campaigns, consent, surveys, ...); no client tracking code.`;
  }
  return `${eventName}: emitted automatically by the Bloomreach SDK; no tracking snippet is needed.`;
}

/** Snippet setting always-tracked default properties (the project's context properties). */
export function buildSdkDefaultProperties(context: Pick<CodegenProperty, 'name' | 'sample'>[]): string {
  const sorted = [...context].sort((a, b) => compareKeys(a.name, b.name));
  // No context properties: empty, so the shared view hides the block (the SDK adds os, browser,
  // device and location by itself).
  if (sorted.length === 0) return '';
  // Nested under track.default_properties per the Bloomreach custom events doc. Written from memory,
  // verify against current Bloomreach docs, in particular the key for the new SDK.
  const lines = [
    '// Added to every event the SDK tracks (SDK configuration; values below are examples).',
    'track: {',
    '  default_properties: {',
  ];
  for (const p of sorted) lines.push(`    ${p.name}: ${jsLiteral(p.sample, '    ')},`);
  lines.push('  },', '},');
  return lines.join('\n');
}

export const SERVER_API_NOTE =
  'Tracked server-side through the Tracking API (purchase, purchase_item, refunds and consent are not sent from the browser), so there is no client snippet.';
export const SDK_AUTO_NOTE = 'Emitted by the SDK or the platform itself; there is no tracking snippet.';
