/**
 * CodeGen Service: generates implementation snippets for events in multiple styles.
 * - GTM dataLayer
 * - Bloomreach Web SDK (exponea.track)
 * - Bloomreach Tracking API (JSON body for /track/v2/projects/{token}/customers/events)
 *
 * Always-sent properties are included; sometimes-sent properties get a "// Optional:" comment above the line.
 */
import type { EventPropertyPresence } from '../../types/schema.js';

export interface AttachedPropertyForCodegen {
  property_name: string;
  presence: EventPropertyPresence;
}

export interface CodegenSnippets {
  dataLayer: string;
  bloomreachSdk: string;
  bloomreachApi: string;
}

const PLACEHOLDER = '<value>';

/**
 * Builds the three code snippets for an event.
 * @param eventName - Event name (e.g. "purchase", "page_view")
 * @param attached - Attached properties with presence (always_sent / sometimes_sent). Never_sent are omitted.
 */
export function buildCodegenSnippets(
  eventName: string,
  attached: AttachedPropertyForCodegen[]
): CodegenSnippets {
  const safeName = eventName?.trim() || 'event_name';
  const props = attached.filter(
    (p) => p.presence === 'always_sent' || p.presence === 'sometimes_sent'
  );

  const dataLayer = buildDataLayerSnippet(safeName, props);
  const bloomreachSdk = buildBloomreachSdkSnippet(safeName, props);
  const bloomreachApi = buildBloomreachApiSnippet(safeName, props);

  return { dataLayer, bloomreachSdk, bloomreachApi };
}

/**
 * From export-style payload (alwaysSent / sometimesSent arrays), build snippets.
 * Use when you don't have full attached_properties but have presence lists.
 */
export function buildCodegenSnippetsFromPresence(
  eventName: string,
  alwaysSent: string[],
  sometimesSent: string[]
): CodegenSnippets {
  const attached: AttachedPropertyForCodegen[] = [
    ...alwaysSent.map((property_name) => ({
      property_name,
      presence: 'always_sent' as EventPropertyPresence,
    })),
    ...sometimesSent.map((property_name) => ({
      property_name,
      presence: 'sometimes_sent' as EventPropertyPresence,
    })),
  ];
  return buildCodegenSnippets(eventName, attached);
}

function formatPropLine(
  name: string,
  optional: boolean
): { comment?: string; line: string } {
  const line = `  ${name}: ${PLACEHOLDER}`;
  if (optional) return { comment: '  // Optional:', line };
  return { line };
}

function buildDataLayerSnippet(
  eventName: string,
  props: AttachedPropertyForCodegen[]
): string {
  const lines: string[] = ['window.dataLayer.push({', `  event: '${eventName}',`];
  for (const p of props) {
    const { comment, line } = formatPropLine(
      p.property_name,
      p.presence === 'sometimes_sent'
    );
    if (comment) lines.push(comment);
    lines.push(line + ',');
  }
  lines.push('});');
  return lines.join('\n');
}

function buildBloomreachSdkSnippet(
  eventName: string,
  props: AttachedPropertyForCodegen[]
): string {
  const lines: string[] = [`exponea.track('${eventName}', {`];
  for (const p of props) {
    const { comment, line } = formatPropLine(
      p.property_name,
      p.presence === 'sometimes_sent'
    );
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
  eventName: string,
  props: AttachedPropertyForCodegen[]
): string {
  const properties: Record<string, string> = {};
  for (const p of props) {
    properties[p.property_name] = PLACEHOLDER;
  }
  const body = {
    customer_ids: { registered: '<customer_id>' },
    event_type: eventName,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
  const json = JSON.stringify(body, null, 2);
  // Add optional comments for sometimes_sent in a separate note; API body itself doesn't support comments.
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
