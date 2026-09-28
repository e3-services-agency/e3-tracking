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
import type { PropertyDataFormat, IdentityTransformation } from '../../domain/enums';
import { IDENTITY_TRANSFORMATIONS } from '../../domain/enums';
import { BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES } from '../../domain/bloomreach';
import type { EventPropertyWithDetails } from '../dal/event.dal';
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
   * Default (back-compat): "registered"
   */
  bloomreachApiCustomerIdKey?: string | null;
};

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

/**
 * JS/TS literal text for object property values in dataLayer / SDK snippets.
 */
function jsLiteralForSample(value: unknown, indent: string = '  '): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    // JS snippets: enforce single-quote string literals consistently.
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
    const parts = value.map((v) => jsLiteralForSample(v, innerIndent));
    return `[${parts.join(', ')}]`;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort(compareFieldKeys);
    if (keys.length === 0) return '{}';
    const innerIndent = indent + '  ';
    const lines = keys.map(
      (k) => `${innerIndent}${k}: ${jsLiteralForSample(o[k], innerIndent)}`
    );
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(String(value));
}

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
export function toAttachedPropertyForCodegen(link: EventPropertyWithDetails): AttachedPropertyForCodegen {
  return {
    property_name: link.payload_key?.trim() || link.property.name,
    // D-16 dropped presence; codegen reads `EventProperty.required` directly (T-1-03/T-1-04
    // integration WARNING 4: this must stay `required`, never `presence`, or every property
    // silently renders as optional in the generated snippets/docs).
    required: link.required,
    property_data_type: link.property.data_type,
    property_data_formats: (link.property.data_formats_json as string[] | null) ?? null,
    property_example_values_json:
      (link.property.example_values_json as AttachedPropertyForCodegen['property_example_values_json']) ?? null,
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
  projectConfig?: CodegenProjectConfig
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'bloomreachApi', overrides);
  const rawKey =
    typeof projectConfig?.bloomreachApiCustomerIdKey === 'string'
      ? projectConfig.bloomreachApiCustomerIdKey.trim()
      : '';
  const customerIdKey = rawKey || 'registered';
  const properties: Record<string, unknown> = {};
  for (const p of props) {
    properties[p.property_name] = jsonSampleValueForProperty(p);
  }
  const body = {
    customer_ids: { [customerIdKey]: '<customer_id>' },
    event_type: eventName,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
  const json = JSON.stringify(body, null, 2);
  const optionalProps = props.filter((p) => !isRequiredForCodegenSnippet(p));
  const curlExample =
    `curl -X POST "https://api.exponea.com/track/v2/projects/YOUR_PROJECT_TOKEN/customers/events" \\\n` +
    `  -H "Authorization: Basic YOUR_BASE64_API_KEY" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify(body)}'`;
  if (optionalProps.length > 0) {
    const optionalNames = optionalProps.map((p) => p.property_name).join(', ');
    return `// Optional properties: ${optionalNames}\n\n${json}\n\n// cURL example:\n${curlExample}`;
  }
  return `${json}\n\n// cURL example:\n${curlExample}`;
}

/* --------------------------------------------------------------------------------------------
 * Identity codegen (D-38, T-2-12): identify/update/anonymize snippets built from a project's
 * IdentityRule rows and its customer-scope properties. Pure — takes already-fetched DAL rows, no
 * DB access, so it is unit-testable without `:memory:` SQLite (`buildIdentityCodegen.test.ts`).
 * ------------------------------------------------------------------------------------------ */

/** Minimal shape `buildIdentityCodegen` needs from `identity_rules` (`IdentityRuleDAL.IdentityRuleRow`). */
export interface IdentityRuleForCodegen {
  identifier_name: string;
  identity_type: string;
  transformations_json: string[];
  sdk_call: string | null;
  trigger_text?: string | null;
  name?: string;
}

/** Minimal shape `buildIdentityCodegen` needs from customer-scope `properties` rows. */
export interface CustomerPropertyForCodegen {
  name: string;
  bloomreach_customer_property?: string | null;
}

export interface IdentityCodegenSnippets {
  identify: string;
  update: string;
  anonymize: string;
}

/**
 * Reserved words that are syntax errors (or `strict`-mode errors) as a JS variable name; a
 * camelCased raw-value variable that collides with one of these gets a trailing underscore.
 */
const JS_RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'let', 'static', 'enum', 'await', 'implements', 'package', 'protected',
  'interface', 'private', 'public', 'null', 'true', 'false',
]);

/** Valid JS identifier from an arbitrary identifier name, for the snippet's raw-value variable. */
function toCamelCaseVariable(name: string): string {
  const parts = name
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'value';
  const [first, ...rest] = parts;
  const head = /^[0-9]/.test(first) ? `_${first}` : first;
  const camel =
    head.toLowerCase() +
    rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
  return JS_RESERVED_WORDS.has(camel) ? `${camel}_` : camel;
}

/** Whether `name` can be written as a bare JS object key (no quotes needed). */
function isValidJsIdentifierName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/** Object-literal key text: bare when it's a valid identifier, quoted otherwise (e.g. "email-id"). */
function formatObjectKey(name: string): string {
  return isValidJsIdentifierName(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Canonical-order (per `IDENTITY_TRANSFORMATIONS`, not storage order) JS expression wrapping a raw
 * value variable, e.g. `String(email).trim().toLowerCase()` for `['lowercase', 'trim']` stored.
 */
function wrapWithTransformations(rawVar: string, transformations: string[]): string {
  let expr = `String(${rawVar})`;
  for (const t of IDENTITY_TRANSFORMATIONS as readonly IdentityTransformation[]) {
    if (!transformations.includes(t)) continue;
    if (t === 'trim') expr += '.trim()';
    if (t === 'lowercase') expr += '.toLowerCase()';
  }
  return expr;
}

/**
 * `identify` snippet (D-38): every hard identifier of the project passed in one call (the
 * re-identification rule enforced by construction, not modelled as data); soft ids (`cookie`) are
 * never passed. A single hard id named `registered` uses the SDK's plain string form; any other
 * shape (a custom identifier, or two or more hard ids) uses the object form.
 */
function buildIdentifySnippet(hardRules: IdentityRuleForCodegen[]): string {
  if (hardRules.length === 0) {
    return '// No hard identity rules configured; exponea.identify() has nothing to send yet.';
  }
  if (hardRules.length === 1 && hardRules[0].identifier_name === 'registered') {
    const rule = hardRules[0];
    const rawVar = toCamelCaseVariable(rule.identifier_name);
    const lines = [`// ${rawVar}: raw value for the hard identifier "registered"`];
    lines.push(`exponea.identify(${wrapWithTransformations(rawVar, rule.transformations_json)});`);
    return lines.join('\n');
  }
  const lines: string[] = [];
  for (const rule of hardRules) {
    const rawVar = toCamelCaseVariable(rule.identifier_name);
    lines.push(`// ${rawVar}: raw value for the hard identifier "${rule.identifier_name}"`);
  }
  lines.push('exponea.identify({');
  for (const rule of hardRules) {
    const rawVar = toCamelCaseVariable(rule.identifier_name);
    lines.push(
      `  ${formatObjectKey(rule.identifier_name)}: ${wrapWithTransformations(rawVar, rule.transformations_json)},`
    );
  }
  lines.push('});');
  return lines.join('\n');
}

/**
 * `update` snippet (D-38): one entry per customer property mapped to a Bloomreach customer
 * attribute (`bloomreach_customer_property`); attributes the identity reference calls out as
 * special (email, phone in E.164, ...) get a comment.
 */
function buildUpdateSnippet(customerProperties: CustomerPropertyForCodegen[]): string {
  const mapped = customerProperties.filter((p) => p.bloomreach_customer_property?.trim());
  if (mapped.length === 0) {
    return '// No customer properties mapped to a Bloomreach customer attribute yet.';
  }
  const sorted = [...mapped].sort((a, b) =>
    (a.bloomreach_customer_property ?? '').localeCompare(b.bloomreach_customer_property ?? '', undefined, {
      sensitivity: 'base',
    })
  );
  const lines = ['exponea.update({'];
  for (const p of sorted) {
    const key = p.bloomreach_customer_property!.trim();
    const rawVar = toCamelCaseVariable(p.name);
    const special = BLOOMREACH_SPECIAL_CUSTOMER_ATTRIBUTES.includes(key);
    const comment =
      key === 'phone' ? ' // special attribute, E.164 format (e.g. +14155550123)' : special ? ' // special attribute' : '';
    lines.push(`  ${formatObjectKey(key)}: ${rawVar},${comment}`);
  }
  lines.push('});');
  return lines.join('\n');
}

/**
 * `anonymize` snippet (D-38): one call per logout rule (`sdk_call = 'anonymize'`), its
 * `trigger_text` noted as a comment. Bloomreach's `anonymize()` takes no arguments, so multiple
 * logout rules still produce one call with every trigger listed above it.
 */
function buildAnonymizeSnippet(anonymizeRules: IdentityRuleForCodegen[]): string {
  if (anonymizeRules.length === 0) {
    return '// No logout (anonymize) rule configured.';
  }
  const lines = anonymizeRules.map(
    (rule) => `// Logout: ${rule.trigger_text?.trim() || rule.name || rule.identifier_name}`
  );
  lines.push('exponea.anonymize();');
  return lines.join('\n');
}

/**
 * Builds the three identity Web SDK snippets for a project (D-38, T-2-12): `identify` from every
 * hard `IdentityRule`, `update` from customer properties mapped to a Bloomreach customer
 * attribute, `anonymize` from rules with `sdk_call = 'anonymize'`.
 */
export function buildIdentityCodegen(
  rules: IdentityRuleForCodegen[],
  customerProperties: CustomerPropertyForCodegen[]
): IdentityCodegenSnippets {
  const hardRules = dedupeHardRulesByIdentifierName(rules.filter((r) => r.identity_type === 'hard'));
  const anonymizeRules = rules.filter((r) => r.sdk_call === 'anonymize');
  return {
    identify: buildIdentifySnippet(hardRules),
    update: buildUpdateSnippet(customerProperties),
    anonymize: buildAnonymizeSnippet(anonymizeRules),
  };
}

/**
 * A project can hold more than one hard-identity rule for the same `identifier_name` (e.g. an
 * "identify" rule and a separate "anonymize" rule both scoped to "registered"): `exponea.identify()`
 * sends one value per identifier, so duplicates are collapsed to a single entry per name (T-3-07
 * follow-up on T-2-12 review). The entry with `sdk_call === 'identify'` is preferred as the base
 * rule (falling back to the first occurrence when none is an identify rule), and its
 * `transformations_json` is the union of every duplicate's transformations, so a transformation
 * declared only on the non-identify duplicate is not silently dropped.
 */
function dedupeHardRulesByIdentifierName(hardRules: IdentityRuleForCodegen[]): IdentityRuleForCodegen[] {
  const groups = new Map<string, IdentityRuleForCodegen[]>();
  for (const rule of hardRules) {
    const group = groups.get(rule.identifier_name);
    if (group) group.push(rule);
    else groups.set(rule.identifier_name, [rule]);
  }
  const out: IdentityRuleForCodegen[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const preferred = group.find((r) => r.sdk_call === 'identify') ?? group[0];
    const transformations_json = Array.from(new Set(group.flatMap((r) => r.transformations_json)));
    out.push({ ...preferred, transformations_json });
  }
  return out;
}
