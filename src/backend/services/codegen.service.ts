/**
 * CodeGen Service: generates implementation snippets for events in multiple styles.
 * - GTM dataLayer
 * - Bloomreach Web SDK (exponea.track)
 * - Bloomreach Tracking API (JSON body for /track/v2/projects/{token}/customers/events)
 *
 * Always-sent properties are included; sometimes-sent properties get a "// Optional:" comment above the line.
 * Output event names may differ per method via `codegen_event_name_overrides` (canonical `events.name` unchanged).
 */
import type {
  CodegenEventNameOverrides,
  ObjectChildFieldSnapshot,
  PropertyExampleValue,
  PropertyValueSchema,
} from '../../types/schema';
import type { PropertyDataFormat, IdentityTransformation, ImplementationMethod, PropertyKind } from '../../domain/enums';
import { DEFAULT_PROPERTY_KIND } from '../../domain/enums';
import { describeTrigger } from '../../domain/identity/identifiers';
import { parseDerivation, type PropertyDerivation } from '../../domain/codegen/derivation';
import {
  buildDataLayerModel,
  buildDataLayerV2,
  buildGtmTemplate,
  buildSdkDefaultProperties,
  buildWebSdkLegacy,
  buildWebSdkV2,
  describeSdkEmits,
  SDK_AUTO_NOTE,
  SERVER_API_NOTE,
  type CodegenProperty,
} from '../../domain/codegen/snippets';
import { IDENTITY_TRANSFORMATIONS } from '../../domain/enums';
import { BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES } from '../../domain/bloomreach';
import { jsLiteral } from '../../domain/codegen/literal';
import { catalogLinkComment, withCatalogComment, type CatalogLinkForCodegen } from '../../domain/codegen/catalogLinks';
import type { EventPropertyWithDetails, EventPropertyWithDetailsExtended } from '../dal/event.dal';
import type { VariantRow } from '../dal/variant.dal';

export interface AttachedPropertyForCodegen {
  property_name: string;
  /**
   * D-16: presence is dropped; codegen reads `EventProperty.required` directly (T-1-04 delta).
   * `required=false` means optional in codegen and QA.
   */
  required: boolean;
  /** Catalog property id (attached row); used for nested resolution. */
  property_id?: string;
  property_data_type?: string | null;
  property_data_formats?: string[] | null;
  property_example_values_json?: PropertyExampleValue[] | null;
  property_value_schema_json?: PropertyValueSchema | null;
  property_object_child_property_refs_json?: Record<string, string> | null;
  object_child_snapshots_by_field?: Record<string, ObjectChildFieldSnapshot> | null;
  /** D-63 (T-4-17): property kind, derivation rule and link role; default `event` / none / `normal`. */
  kind?: PropertyKind;
  derivation?: PropertyDerivation | null;
  role?: string;
}

export interface CodegenSnippets {
  dataLayer: string;
  bloomreachSdk: string;
  bloomreachApi: string;
}

type CodegenMethodKey = keyof CodegenEventNameOverrides;

export type CodegenProjectConfig = {
  /**
   * Bloomreach Tracking API customer identifier key inside `customer_ids`.
   * Derived from the project's hard identity rule (T-4-23); `<hard_id>` placeholder when none.
   */
  bloomreachApiCustomerIdKey?: string | null;
  /**
   * D-67 (T-4-28): the event's effective identifier names; when non-empty they replace the single
   * project-wide hard id key as the `customer_ids` keys.
   */
  identifierKeys?: string[] | null;
  /** True when at least one of `identifierKeys` is a soft identifier (changes the customer_ids note). */
  identifierHasSoft?: boolean;
};

export const SOFT_CUSTOMER_IDS_COMMENT =
  'customer_ids carry the identifiers this event uses (soft ids are merged into the profile; a hard id must be present somewhere in the session); see https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview';

export const CUSTOMER_IDS_COMMENT =
  "customer_ids must match the project's hard ID; see https://documentation.bloomreach.com/data-hub/reference/tracking-api-overview";

function resolveOutputEventName(
  canonicalTrimmed: string,
  method: CodegenMethodKey,
  overrides: CodegenEventNameOverrides | null | undefined
): string {
  const o = overrides?.[method];
  if (typeof o === 'string' && o.trim() !== '') return o.trim();
  return canonicalTrimmed;
}

function hasFormat(formats: string[] | null | undefined, f: PropertyDataFormat): boolean {
  return Array.isArray(formats) && formats.includes(f);
}

function isRequiredForCodegenSnippet(p: AttachedPropertyForCodegen): boolean {
  return p.required;
}

/** Alphabetical by property name (catalog `property_name` / generated payload key). */
function compareCodegenPropertyNames(
  a: AttachedPropertyForCodegen,
  b: AttachedPropertyForCodegen
): number {
  return a.property_name.localeCompare(b.property_name, undefined, { sensitivity: 'base' });
}

function compareFieldKeys(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Required properties first (A–Z), then optional (A–Z).
 * Avoids a misleading visual where a required line follows `// Optional:` for a prior optional prop.
 */
function orderCodegenPropsForSnippetDisplay(
  props: AttachedPropertyForCodegen[]
): AttachedPropertyForCodegen[] {
  const required: AttachedPropertyForCodegen[] = [];
  const optional: AttachedPropertyForCodegen[] = [];
  for (const p of props) {
    if (isRequiredForCodegenSnippet(p)) required.push(p);
    else optional.push(p);
  }
  required.sort(compareCodegenPropertyNames);
  optional.sort(compareCodegenPropertyNames);
  return [...required, ...optional];
}

function coerceIsoLikeToUnixSeconds(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Assume already unix seconds.
    return Math.floor(v);
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    // Numeric string (seconds)
    if (/^-?\d+(\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n)) return Math.floor(n);
    }
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return Math.floor(d.getTime() / 1000);
    }
  }
  return null;
}

/**
 * Sample JSON value for a property (codegen / export examples only).
 */
export function jsonSampleValueForProperty(p: AttachedPropertyForCodegen): unknown {
  const ex = p.property_example_values_json;
  const dt = (p.property_data_type || 'string').toLowerCase();
  if (Array.isArray(ex) && ex.length > 0) {
    const v = ex[0]?.value;
    if (v === null) return null;
    // Guardrail: highlighted HTML must never leak into raw codegen output.
    if (
      typeof v === 'string' &&
      ((/<\s*span\b/i.test(v) && /ch-(num|str|kw|lit|com|key)/.test(v)) ||
        /ch-(num|str|kw|lit|com|key)"?>/i.test(v) ||
        /ch-(num|str|kw|lit|com|key)\b/i.test(v))
    ) {
      // Treat as invalid example payload; fall back to typed sample below.
    } else {
    // Legacy tolerance: example value stored as string but data_type is number/boolean/timestamp.
    if (dt === 'number' && typeof v === 'string') {
      const n = Number(v.trim());
      if (!Number.isNaN(n)) return n;
    }
    if (dt === 'boolean' && typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === 'true') return true;
      if (t === 'false') return false;
    }
    if (dt === 'timestamp') {
      const unix = coerceIsoLikeToUnixSeconds(v);
      if (unix !== null) return unix;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return v;
    }
    }
  }

  const fmts = p.property_data_formats ?? [];

  if (dt === 'object') {
    const nested = buildNestedObjectSampleFromSnapshots(p);
    if (nested !== undefined) {
      return nested;
    }
    return {};
  }

  if (dt === 'array') {
    // Array examples are derived from linked canonical element property identity.
    // The array builder persists object_child_property_refs_json = { "$items": "<id>" } and
    // event hydration resolves that into object_child_snapshots_by_field["$items"].
    const snaps = p.object_child_snapshots_by_field;
    const itemSnap = snaps ? snaps['$items'] : undefined;
    if (itemSnap && !itemSnap.missing && !itemSnap.cycle_break) {
      const ex = itemSnap.property_example_values_json;
      const v = Array.isArray(ex) && ex.length > 0 ? ex[0]?.value : undefined;
      if (typeof v === 'string' && v.trim()) return [v.trim()];
      const name = typeof itemSnap.property_name === 'string' ? itemSnap.property_name.trim() : '';
      if (name) return [name];
    }
    return [];
  }

  if (dt === 'number') return 123;
  if (dt === 'boolean') return true;
  if (dt === 'timestamp') {
    // Product contract: timestamps are unix seconds (number).
    return 1735689600; // 2025-01-01T00:00:00Z
  }

  if (dt === 'string') {
    if (hasFormat(fmts, 'email')) return 'user@example.com';
    if (hasFormat(fmts, 'uri')) return 'https://example.com';
    if (hasFormat(fmts, 'uuid')) return '00000000-0000-0000-0000-000000000000';
    if (hasFormat(fmts, 'iso8601_datetime')) return '2025-01-01T00:00:00.000Z';
    if (hasFormat(fmts, 'iso8601_date')) return '2025-01-01';
    if (hasFormat(fmts, 'unix_seconds')) return 1234567890;
    if (hasFormat(fmts, 'unix_milliseconds')) return 1234567890123;
    return 'string';
  }

  return 'string';
}

function buildNestedObjectSampleFromSnapshots(
  p: AttachedPropertyForCodegen
): Record<string, unknown> | undefined {
  const schema = p.property_value_schema_json;
  const snaps = p.object_child_snapshots_by_field;
  if (!schema || schema.type !== 'object' || !schema.properties || !snaps) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  const sortedKeys = Object.keys(schema.properties).sort(compareFieldKeys);
  for (const key of sortedKeys) {
    const snap = snaps[key];
    if (!snap) {
      continue;
    }
    if (snap.missing) {
      out[key] = null;
      continue;
    }
    if (snap.cycle_break) {
      out[key] = {};
      continue;
    }
    const childAttached: AttachedPropertyForCodegen = {
      property_name: key,
      required: true,
      property_id: snap.property_id,
      property_data_type: snap.property_data_type ?? null,
      property_data_formats: snap.property_data_formats ?? null,
      property_example_values_json: snap.property_example_values_json ?? null,
      property_value_schema_json: snap.property_value_schema_json ?? null,
      property_object_child_property_refs_json: snap.property_object_child_property_refs_json ?? null,
      object_child_snapshots_by_field: snap.object_child_snapshots_by_field ?? null,
    };
    out[key] = jsonSampleValueForProperty(childAttached);
  }
  return out;
}

const jsLiteralForSample = jsLiteral;

function formatJsObjectBodyFromSchema(
  schema: PropertyValueSchema,
  value: Record<string, unknown>,
  baseIndent: string
): string[] {
  const props = schema.properties ?? {};
  // Nested-schema fields no longer carry a `presence` concept (T-1-04 fix round LOW 10/presence
  // residue): every declared field is included, split into required/optional below by `required`.
  const includedKeys = Object.keys(props).sort(compareFieldKeys);
  // Match shared docs nested rows: `buildOnePropertyTableRow` uses `schemaNode.required !== false`.
  const requiredKeys = includedKeys.filter((k) => props[k]?.required !== false);
  const optionalKeys = includedKeys.filter((k) => props[k]?.required === false);

  const lines: string[] = [];
  const inner = `${baseIndent}  `;
  for (const k of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
    lines.push(`${inner}${k}: ${jsLiteralForSample(value[k], inner)},`);
  }
  if (optionalKeys.length > 0) {
    lines.push(`${inner}// Optional:`);
    for (const k of optionalKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      lines.push(`${inner}${k}: ${jsLiteralForSample(value[k], inner)},`);
    }
  }
  return lines;
}

/**
 * Property -> codegen-shape mapping (T-1-04, moved here from `export.service.ts` in T-2-08 to
 * break an import cycle with `document.service.ts`, which needs this same mapping for the event
 * card's `properties[].example` and `codegen` fields). Used by the docs export and the event card
 * for sample payloads and code snippets alike.
 */
export function toAttachedPropertyForCodegen(
  link: EventPropertyWithDetails | EventPropertyWithDetailsExtended
): AttachedPropertyForCodegen {
  // D-58: examples (and, when set, the format) come from the link's own definition, so codegen
  // shows the right sample per event (e.g. `accept`/`reject` on `consent`, `add`/`remove` on
  // `cart_update`) instead of one shared example for every event a property is attached to.
  const definition = 'definition' in link ? link.definition : null;
  const definitionExamples = Array.isArray(definition?.example_values_json)
    ? (definition!.example_values_json as PropertyExampleValue[])
    : null;
  // F2 (D-63): a discriminator with no example still needs a real value, not 'string': fall back to
  // its first allowed value (the variant-specific value is applied by `attachedPropertiesForVariant`).
  const allowedRaw = Array.isArray(definition?.allowed_values_json) && (definition!.allowed_values_json as unknown[]).length > 0
    ? (definition!.allowed_values_json as { value?: unknown }[])
    : Array.isArray(link.property.allowed_values_json)
      ? (link.property.allowed_values_json as { value?: unknown }[])
      : [];
  const firstAllowed = link.role === 'discriminator' ? allowedRaw.find((v) => typeof v?.value === 'string' && v.value !== '') : undefined;
  return {
    property_name: link.payload_key?.trim() || link.property.name,
    // D-16 dropped presence; codegen reads `EventProperty.required` directly (T-1-03/T-1-04
    // integration WARNING 4: this must stay `required`, never `presence`, or every property
    // silently renders as optional in the generated snippets/docs).
    required: link.required,
    kind: (link.property.kind as PropertyKind) ?? DEFAULT_PROPERTY_KIND,
    derivation: parseDerivation(link.property.derivation_json),
    role: link.role,
    property_data_type: link.property.data_type,
    // Fix round ERROR 1: the definition's whole formats_json list, not a single scalar.
    property_data_formats:
      Array.isArray(definition?.formats_json) && (definition!.formats_json as unknown[]).length > 0
        ? (definition!.formats_json as string[])
        : ((link.property.data_formats_json as string[] | null) ?? null),
    property_example_values_json:
      (definitionExamples && definitionExamples.length > 0 ? definitionExamples : null) ??
      ((link.property.example_values_json as AttachedPropertyForCodegen['property_example_values_json']) ?.length
        ? (link.property.example_values_json as AttachedPropertyForCodegen['property_example_values_json'])
        : null) ??
      (firstAllowed ? [{ value: firstAllowed.value as string }] : null),
    property_value_schema_json:
      (link.property.value_schema_json as AttachedPropertyForCodegen['property_value_schema_json']) ?? null,
  };
}

/**
 * Builds the attached-property list for a variant's codegen snippet, overriding each
 * discriminator property's example value with its condition's literal value (T-1-05 acceptance:
 * "codegen snippets for a variant include the discriminator values as literals"; moved here in
 * T-2-08 alongside `toAttachedPropertyForCodegen`, for the same reason). Used by the docs export's
 * per-variant codegen and the event card's `variants[].expected_payload` (T-2-08).
 */
export function attachedPropertiesForVariant(
  properties: EventPropertyWithDetails[],
  variant: VariantRow
): AttachedPropertyForCodegen[] {
  const conditionByProperty = new Map(
    (variant.conditions_json as VariantRow['conditions_json']).map((c) => [c.property_id, c])
  );
  return properties.map((link) => {
    const attached = toAttachedPropertyForCodegen(link);
    const condition = conditionByProperty.get(link.property_id);
    if (condition && condition.values.length > 0) {
      attached.property_example_values_json = [{ value: condition.values[0] }];
    }
    return attached;
  });
}

/**
 * Builds the three code snippets for an event.
 * @param canonicalEventName - Canonical platform event name (unchanged in DB).
 * @param attached - Attached properties (D-16: `required` drives the optional/required grouping;
 * there is no presence/never_sent concept — a property that is not attached is simply absent).
 * @param overrides - Optional per-method output names for generated snippets only.
 */
export function buildCodegenSnippets(
  canonicalEventName: string,
  attached: AttachedPropertyForCodegen[],
  overrides?: CodegenEventNameOverrides | null,
  projectConfig?: CodegenProjectConfig
): CodegenSnippets {
  const safeCanonical = canonicalEventName?.trim() || 'event_name';
  const props = orderCodegenPropsForSnippetDisplay(attached);

  const dataLayer = buildDataLayerSnippet(safeCanonical, props, overrides);
  const bloomreachSdk = buildBloomreachSdkSnippet(safeCanonical, props, overrides);
  const bloomreachApi = buildBloomreachApiSnippet(safeCanonical, props, overrides, projectConfig);

  return { dataLayer, bloomreachSdk, bloomreachApi };
}

/**
 * From a required/optional property name split (e.g. a Bloomreach export payload), build
 * snippets without full attached_properties (D-16: replaces the old presence-based helper).
 */
export function buildCodegenSnippetsFromRequired(
  eventName: string,
  requiredNames: string[],
  optionalNames: string[],
  overrides?: CodegenEventNameOverrides | null
): CodegenSnippets {
  const attached: AttachedPropertyForCodegen[] = [
    ...requiredNames.map((property_name) => ({
      property_name,
      required: true,
      property_data_type: null as string | null,
    })),
    ...optionalNames.map((property_name) => ({
      property_name,
      required: false,
      property_data_type: null as string | null,
    })),
  ];
  return buildCodegenSnippets(eventName, attached, overrides);
}

function formatPropLines(
  p: AttachedPropertyForCodegen,
  optional: boolean,
  /** When optional, set false for 2nd+ optional props so one `// Optional:` labels the whole optional group. */
  emitOptionalGroupHeader: boolean = true
): { comment?: string; lines: string[] } {
  const useNested =
    p.property_data_type === 'object' &&
    p.property_value_schema_json?.type === 'object' &&
    p.property_value_schema_json.properties &&
    p.object_child_snapshots_by_field &&
    Object.keys(p.object_child_snapshots_by_field).length > 0;

  if (useNested) {
    const sample = jsonSampleValueForProperty(p);
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      const bodyLines = formatJsObjectBodyFromSchema(
        p.property_value_schema_json!,
        sample as Record<string, unknown>,
        '  '
      );
      const lines: string[] = [];
      if (optional && emitOptionalGroupHeader) {
        lines.push('  // Optional:');
      }
      lines.push(`  ${p.property_name}: {`);
      lines.push(...bodyLines);
      lines.push(`  },`);
      return { lines };
    }
  }

  const sample = jsonSampleValueForProperty(p);
  const lit = jsLiteralForSample(sample);
  const line = `  ${p.property_name}: ${lit}`;
  if (optional) {
    if (emitOptionalGroupHeader) return { comment: '  // Optional:', lines: [line + ','] };
    return { lines: [line + ','] };
  }
  return { lines: [line + ','] };
}

function buildDataLayerSnippet(
  canonicalEventName: string,
  props: AttachedPropertyForCodegen[],
  overrides: CodegenEventNameOverrides | null | undefined
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'dataLayer', overrides);
  const lines: string[] = [
    'window.dataLayer = window.dataLayer || [];',
    'window.dataLayer.push({',
    `  event: '${eventName}',`,
  ];
  let optionalGroupHeaderEmitted = false;
  for (const p of props) {
    const optional = !isRequiredForCodegenSnippet(p);
    const emitOptionalGroupHeader = optional && !optionalGroupHeaderEmitted;
    if (optional) optionalGroupHeaderEmitted = true;
    const { comment, lines: propLines } = formatPropLines(p, optional, emitOptionalGroupHeader);
    if (comment) lines.push(comment);
    lines.push(...propLines);
  }
  lines.push('});');
  return lines.join('\n');
}

function buildBloomreachSdkSnippet(
  canonicalEventName: string,
  props: AttachedPropertyForCodegen[],
  overrides: CodegenEventNameOverrides | null | undefined
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'bloomreachSdk', overrides);
  const lines: string[] = [`exponea.track('${eventName}', {`];
  let optionalGroupHeaderEmitted = false;
  for (const p of props) {
    const optional = !isRequiredForCodegenSnippet(p);
    const emitOptionalGroupHeader = optional && !optionalGroupHeaderEmitted;
    if (optional) optionalGroupHeaderEmitted = true;
    const { comment, lines: propLines } = formatPropLines(p, optional, emitOptionalGroupHeader);
    if (comment) lines.push(comment);
    lines.push(...propLines);
  }
  lines.push('});');
  return lines.join('\n');
}

/**
 * Bloomreach Tracking API: POST /track/v2/projects/{project_token}/customers/events
 * Body: customer_ids, event_type, properties (optional), timestamp (optional).
 */
function buildBloomreachApiSnippet(
  canonicalEventName: string,
  props: AttachedPropertyForCodegen[],
  overrides: CodegenEventNameOverrides | null | undefined,
  projectConfig?: CodegenProjectConfig,
  /** D-63: the final payload (state lists computed from items); default is each property's own sample. */
  payload?: Record<string, unknown>
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'bloomreachApi', overrides);
  const rawKey =
    typeof projectConfig?.bloomreachApiCustomerIdKey === 'string'
      ? projectConfig.bloomreachApiCustomerIdKey.trim()
      : '';
  const customerIdKey = rawKey || '<hard_id>';
  const identifierKeys = (projectConfig?.identifierKeys ?? []).filter((k) => k.trim());
  const properties: Record<string, unknown> = {};
  for (const p of props) {
    properties[p.property_name] =
      payload && p.property_name in payload ? payload[p.property_name] : jsonSampleValueForProperty(p);
  }
  const body = {
    customer_ids:
      identifierKeys.length > 0
        ? Object.fromEntries(identifierKeys.map((k) => [k, `<${k}>`]))
        : { [customerIdKey]: '<customer_id>' },
    event_type: eventName,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
  const json = JSON.stringify(body, null, 2);
  const idComment = `// ${identifierKeys.length > 0 && projectConfig?.identifierHasSoft ? SOFT_CUSTOMER_IDS_COMMENT : CUSTOMER_IDS_COMMENT}\n`;
  const optionalProps = props.filter((p) => !isRequiredForCodegenSnippet(p));
  const curlExample =
    `curl -X POST "https://api.exponea.com/track/v2/projects/YOUR_PROJECT_TOKEN/customers/events" \\\n` +
    `  -H "Authorization: Basic YOUR_BASE64_API_KEY" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify(body)}'`;
  if (optionalProps.length > 0) {
    const optionalNames = optionalProps.map((p) => p.property_name).join(', ');
    return `${idComment}// Optional properties: ${optionalNames}\n\n${json}\n\n// cURL example:\n${curlExample}`;
  }
  return `${idComment}${json}\n\n// cURL example:\n${curlExample}`;
}

/* --------------------------------------------------------------------------------------------
 * Codegen v2 (D-63, T-4-17): snippets per implementation method. Additive to the three snippets
 * above: `gtm`, `web_sdk` and `tracking_api` keep their names, new keys are added.
 * ------------------------------------------------------------------------------------------ */

export interface CodegenV2 {
  /** `datalayer` + `gtm_template` together (the "GTM / dataLayer" tab). */
  gtm: string;
  datalayer: string;
  gtm_template: string;
  /** New Web SDK: `brweb.track(event, payload)`. */
  web_sdk: string;
  /** Legacy Web SDK: `exponea.track(event, payload)`. */
  web_sdk_legacy: string;
  tracking_api: string;
  /** `sdk_auto` only: which SDK call or lifecycle emits the event. */
  sdk_emits: string;
  /** `sdk_auto` only: snippet setting the always-tracked default properties. */
  sdk_default_properties: string;
  /** One line on why some tabs are absent (`server_api` / `sdk_auto`), else empty. */
  note: string;
}

export interface CodegenV2Options {
  method: ImplementationMethod;
  /** The site's dataLayer event carrying this Bloomreach event (`events.dl_event_name`). */
  dlEventName?: string | null;
  eventClass?: string | null;
  /** Project-wide context properties (kind `context`), for the SDK default properties snippet. */
  projectContext?: { name: string; sample: unknown }[];
  /** D-61 amendment: catalog-linked properties; each prints one comment line in the client snippets. */
  catalogLinks?: CatalogLinkForCodegen[];
  /** T-4-23: identifier_name of the project's hard identity rule, the Tracking API `customer_ids` key. */
  hardIdKey?: string | null;
  /** D-67 (T-4-28): the event's effective identifier names, the Tracking API `customer_ids` keys. */
  identifierKeys?: string[] | null;
  identifierHasSoft?: boolean;
}

export function toCodegenProperty(p: AttachedPropertyForCodegen): CodegenProperty {
  return {
    name: p.property_name,
    kind: p.kind ?? DEFAULT_PROPERTY_KIND,
    derivation: p.derivation ?? null,
    required: p.required,
    role: p.role,
    sample: jsonSampleValueForProperty(p),
  };
}

export function buildCodegenV2(
  canonicalEventName: string,
  attached: AttachedPropertyForCodegen[],
  options: CodegenV2Options,
  overrides?: CodegenEventNameOverrides | null,
  projectConfig?: CodegenProjectConfig
): CodegenV2 {
  const safeCanonical = canonicalEventName?.trim() || 'event_name';
  const props = orderCodegenPropsForSnippetDisplay(attached);
  const model = buildDataLayerModel(props.map(toCodegenProperty));
  const empty: CodegenV2 = {
    gtm: '',
    datalayer: '',
    gtm_template: '',
    web_sdk: '',
    web_sdk_legacy: '',
    tracking_api: '',
    sdk_emits: '',
    sdk_default_properties: '',
    note: '',
  };
  const comment = catalogLinkComment(options.catalogLinks);
  const trackingApi = () =>
    withCatalogComment(buildBloomreachApiSnippet(
      safeCanonical,
      props,
      overrides,
      projectConfig ?? { bloomreachApiCustomerIdKey: options.hardIdKey, identifierKeys: options.identifierKeys, identifierHasSoft: options.identifierHasSoft },
      model.payload
    ), comment);

  if (options.method === 'server_api') {
    return { ...empty, tracking_api: trackingApi(), note: SERVER_API_NOTE };
  }
  if (options.method === 'sdk_auto') {
    const context = new Map<string, unknown>();
    for (const c of options.projectContext ?? []) context.set(c.name, c.sample);
    for (const p of attached) {
      if (p.kind === 'context' || p.role === 'context') context.set(p.property_name, jsonSampleValueForProperty(p));
    }
    return {
      ...empty,
      sdk_emits: describeSdkEmits(safeCanonical, options.eventClass),
      sdk_default_properties: buildSdkDefaultProperties([...context].map(([name, sample]) => ({ name, sample }))),
      note: SDK_AUTO_NOTE,
    };
  }
  // The Bloomreach event name (bloomreach.event, the tag's track call) uses the SDK override; the
  // site's dataLayer event is dl_event_name (D-63), never the dataLayer name override.
  const sdkName = resolveOutputEventName(safeCanonical, 'bloomreachSdk', overrides);
  const names = { bloomreach: sdkName, dataLayer: options.dlEventName ?? null };
  const datalayer = withCatalogComment(buildDataLayerV2(names, model), comment);
  const gtm_template = buildGtmTemplate(names, model);
  return {
    ...empty,
    gtm: `${datalayer}\n\n${gtm_template}`,
    datalayer,
    gtm_template,
    web_sdk: withCatalogComment(buildWebSdkV2(sdkName, model), comment),
    web_sdk_legacy: withCatalogComment(buildWebSdkLegacy(sdkName, model), comment),
    tracking_api: trackingApi(),
  };
}

// Identity codegen (D-38, T-4-30) lives in the pure domain module; re-exported for existing callers.
export { buildIdentityCodegen } from '../../domain/codegen/identity';
export type { IdentityRuleForCodegen, CustomerPropertyForCodegen, IdentityCodegenSnippets, IdentityVariants } from '../../domain/codegen/identity';
