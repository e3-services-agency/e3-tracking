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
  PropertyDataFormat,
  PropertyExampleValue,
} from '../../types/schema';

export interface AttachedPropertyForCodegen {
  property_name: string;
  presence: EventPropertyPresence;
  property_data_type?: string | null;
  property_data_formats?: string[] | null;
  property_example_values_json?: PropertyExampleValue[] | null;
}

export interface CodegenSnippets {
  dataLayer: string;
  bloomreachSdk: string;
  bloomreachApi: string;
}

type CodegenMethodKey = keyof CodegenEventNameOverrides;

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

/**
 * Sample JSON value for a property (codegen / export examples only).
 */
export function jsonSampleValueForProperty(p: AttachedPropertyForCodegen): unknown {
  const ex = p.property_example_values_json;
  if (Array.isArray(ex) && ex.length > 0) {
    const v = ex[0]?.value;
    if (v === null) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      return v;
    }
  }

  const dt = (p.property_data_type || 'string').toLowerCase();
  const fmts = p.property_data_formats ?? [];

  if (dt === 'number') return 123;
  if (dt === 'boolean') return true;
  if (dt === 'array') return [];
  if (dt === 'object') return {};
  if (dt === 'timestamp') {
    return '2025-01-01T00:00:00.000Z';
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

/**
 * JS/TS literal text for object property values in dataLayer / SDK snippets.
 */
function jsLiteralForSample(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object') return '{}';
  return JSON.stringify(String(value));
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
  overrides?: CodegenEventNameOverrides | null
): CodegenSnippets {
  const safeCanonical = canonicalEventName?.trim() || 'event_name';
  const props = attached.filter(
    (p) => p.presence === 'always_sent' || p.presence === 'sometimes_sent'
  );

  const dataLayer = buildDataLayerSnippet(safeCanonical, props, overrides);
  const bloomreachSdk = buildBloomreachSdkSnippet(safeCanonical, props, overrides);
  const bloomreachApi = buildBloomreachApiSnippet(safeCanonical, props, overrides);

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

function formatPropLine(
  p: AttachedPropertyForCodegen,
  optional: boolean
): { comment?: string; line: string } {
  const sample = jsonSampleValueForProperty(p);
  const lit = jsLiteralForSample(sample);
  const line = `  ${p.property_name}: ${lit}`;
  if (optional) return { comment: '  // Optional:', line };
  return { line };
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
  for (const p of props) {
    const { comment, line } = formatPropLine(p, p.presence === 'sometimes_sent');
    if (comment) lines.push(comment);
    lines.push(line + ',');
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
  for (const p of props) {
    const { comment, line } = formatPropLine(p, p.presence === 'sometimes_sent');
    if (comment) lines.push(comment);
    lines.push(line + ',');
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
  overrides: CodegenEventNameOverrides | null | undefined
): string {
  const eventName = resolveOutputEventName(canonicalEventName, 'bloomreachApi', overrides);
  const properties: Record<string, unknown> = {};
  for (const p of props) {
    properties[p.property_name] = jsonSampleValueForProperty(p);
  }
  const body = {
    customer_ids: { registered: '<customer_id>' },
    event_type: eventName,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
  const json = JSON.stringify(body, null, 2);
  const optionalProps = props.filter((p) => p.presence === 'sometimes_sent');
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
