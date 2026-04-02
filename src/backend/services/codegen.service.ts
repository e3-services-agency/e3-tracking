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
  EventPropertyPresence,
  ObjectChildFieldSnapshot,
  PropertyDataFormat,
  PropertyExampleValue,
  PropertyValueSchema,
} from '../../types/schema';
import { isAttachedPropertyRequiredForTrigger } from '../../lib/effectiveEventSchema';

export interface AttachedPropertyForCodegen {
  property_name: string;
  presence: EventPropertyPresence;
  /** event_property_definitions.required (nullable). */
  property_required_override?: boolean | null;
  /**
   * When set to a boolean, snippet optional/required grouping uses this instead of
   * `isAttachedPropertyRequiredForTrigger(presence, property_required_override)`.
   * Shared journey snippets set this to a boolean for every attached row (never undefined).
   */
  required_for_trigger?: boolean;
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

export type CodegenWorkspaceConfig = {
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
  if (typeof p.required_for_trigger === 'boolean') {
    return p.required_for_trigger;
  }
  return isAttachedPropertyRequiredForTrigger(p.presence, p.property_required_override);
}

/**
 * Required properties first, then optional — stable within each group.
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
  for (const [key] of Object.entries(schema.properties)) {
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
      presence: 'always_sent',
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
    const keys = Object.keys(o);
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
  const keys = Object.keys(props);
  const includedKeys = keys.filter((k) => props[k]?.presence !== 'never_sent');
  // Match shared docs nested rows: `buildOnePropertyTableRow` uses `schemaNode.required !== false`
  // for nested fields (not presence-based splitting), so codegen must not classify a field as both
  // required and optional when presence is `sometimes_sent` but `required` is still true/undefined.
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
 * Builds the three code snippets for an event.
 * @param canonicalEventName - Canonical platform event name (unchanged in DB).
 * @param attached - Attached properties with presence (always_sent / sometimes_sent). Never_sent are omitted.
 * @param overrides - Optional per-method output names for generated snippets only.
 */
export function buildCodegenSnippets(
  canonicalEventName: string,
  attached: AttachedPropertyForCodegen[],
  overrides?: CodegenEventNameOverrides | null,
  workspaceConfig?: CodegenWorkspaceConfig
): CodegenSnippets {
  const safeCanonical = canonicalEventName?.trim() || 'event_name';
  const props = orderCodegenPropsForSnippetDisplay(
    attached.filter((p) => p.presence === 'always_sent' || p.presence === 'sometimes_sent')
  );

  const dataLayer = buildDataLayerSnippet(safeCanonical, props, overrides);
  const bloomreachSdk = buildBloomreachSdkSnippet(safeCanonical, props, overrides);
  const bloomreachApi = buildBloomreachApiSnippet(safeCanonical, props, overrides, workspaceConfig);

  return { dataLayer, bloomreachSdk, bloomreachApi };
}

/**
 * From export-style payload (alwaysSent / sometimesSent arrays), build snippets.
 * Use when you don't have full attached_properties but have presence lists.
 */
export function buildCodegenSnippetsFromPresence(
  eventName: string,
  alwaysSent: string[],
  sometimesSent: string[],
  overrides?: CodegenEventNameOverrides | null
): CodegenSnippets {
  const attached: AttachedPropertyForCodegen[] = [
    ...alwaysSent.map((property_name) => ({
      property_name,
      presence: 'always_sent' as EventPropertyPresence,
      property_data_type: null as string | null,
    })),
    ...sometimesSent.map((property_name) => ({
      property_name,
      presence: 'sometimes_sent' as EventPropertyPresence,
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
  workspaceConfig?: CodegenWorkspaceConfig
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'bloomreachApi', overrides);
  const rawKey =
    typeof workspaceConfig?.bloomreachApiCustomerIdKey === 'string'
      ? workspaceConfig.bloomreachApiCustomerIdKey.trim()
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
