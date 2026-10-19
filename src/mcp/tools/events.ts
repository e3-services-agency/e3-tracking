/**
 * `list_events`, `get_event_card`, `get_expected_payload` (T-2-10, plan MCP table). All three build
 * on `document.service.ts#buildEventCard` (D-05/D-21/D-34) -- the same builder the in-app card page,
 * the HTML documentation and `GET /export/tracking-document.json` use, so an agent sees exactly the
 * certification/coverage/rules the app shows, never a second, drifting computation.
 */
import * as EventDAL from '../../backend/dal/event.dal';
import { buildEventCard, buildEventCardContext } from '../../backend/services/document.service';
import { EVENT_CLASSES } from '../../domain/enums';
import { resolveEvent, resolveProject, resolveVariant } from '../resolve';
import { McpToolError } from '../errors';
import type { EventCard, EventCardRule } from '../../domain/document/trackingDocument';
import { conditionalRead, paginate, readSnapshot, type ConditionalInput, type ListOptions } from '../readOptions';

export interface ListEventsInput extends ListOptions {
  project_key?: string;
  class?: string;
  status?: string;
}

export interface ListEventsRow {
  id: string;
  name: string;
  class: string;
  status: string;
  priority: string | null;
  created_at: string;
  updated_at: string;
  certification?: EventCard['certification'];
  variants?: { id: string; name: string }[];
  discriminators?: string[];
  contexts?: string[];
  required_properties?: string[];
}

/** Default `class` filter is `custom` (plan table, T-2-10 acceptance "list_events default class filter"): an agent asking "what events are there" almost always means the client's own tracking, not Bloomreach's SDK/platform noise. Pass `class: 'all'` (or any explicit `EVENT_CLASSES` value) to see the rest. */
export async function listEvents(input: ListEventsInput) {
  return readSnapshot(() => {
  const project = resolveProject(input.project_key);
  const classFilter = input.class ?? 'custom';
  if (classFilter !== 'all' && !(EVENT_CLASSES as readonly string[]).includes(classFilter)) {
    throw new McpToolError('VALIDATION_ERROR', `class must be one of: all, ${EVENT_CLASSES.join(', ')}.`);
  }
  const events = EventDAL.listEvents(project.id).filter((e) => {
    if (classFilter !== 'all' && e.class !== classFilter) return false;
    if (input.status && e.status !== input.status) return false;
    return true;
  });

  const detailFields = ['certification', 'variants', 'discriminators', 'contexts', 'required_properties'];
  const needsDetail = input.fields ? input.fields.some(f => detailFields.includes(f)) : !!input.include;
  const ctx = needsDetail ? buildEventCardContext(project.id) : undefined;
  const rows = events.map((event) => {
    const card = ctx ? buildEventCard(project.id, event.id, ctx) : undefined;
    return {
      id: event.id, name: event.name, class: event.class, status: event.status,
      priority: event.priority, created_at: event.created_at, updated_at: event.updated_at,
      ...(card ? {
        certification: card.certification,
        variants: card.variants.map((v) => ({ id: v.id, name: v.name })),
        discriminators: card.properties.filter((p) => p.role === 'discriminator').map((p) => p.payload_key),
        contexts: card.contexts.map((c) => c.payload_key),
        required_properties: card.properties.filter((p) => p.required).map((p) => p.payload_key),
      } : {}),
    };
  });
  const compact = ['id', 'name', 'class', 'status', 'priority', 'created_at', 'updated_at'];
  return paginate(rows, input, compact, [...compact, ...detailFields], { project_id: project.id, collection: 'events', filters: { class: classFilter, status: input.status }, default_limit: 100 });
  });
}

export interface GetEventCardInput extends ConditionalInput {
  project_key?: string;
  event: string;
}

export async function getEventCard(input: GetEventCardInput) {
  const project = resolveProject(input.project_key);
  const event = resolveEvent(project.id, input.event);
  return conditionalRead(event.id, buildEventCard(project.id, event.id), input);
}

export interface GetExpectedPayloadInput {
  project_key?: string;
  event: string;
  variant?: string;
}

export interface ExpectedPayloadField {
  data_type: string;
  formats: string[];
  allowed_values?: string[];
  /** D-58: which of the property's named definitions this event uses; `null` only when the link
   * carries no definition (defensive, every link resolves to one). */
  definition_id: string | null;
  definition_name: string | null;
}

export interface ExpectedPayload {
  event: string;
  variant: string | null;
  required: Record<string, ExpectedPayloadField>;
  optional: Record<string, ExpectedPayloadField>;
  discriminators: Record<string, string[]>;
  contexts: Record<string, string[]>;
  item_schemas: Record<string, unknown>;
  rules: { name: string; kind: string; message: string; expression_text: string }[];
  sdk_default_properties: string[];
  example: Record<string, unknown>;
}

export async function getExpectedPayload(input: GetExpectedPayloadInput): Promise<ExpectedPayload> {
  const project = resolveProject(input.project_key);
  const event = resolveEvent(project.id, input.event);
  const card = buildEventCard(project.id, event.id);
  const variant = input.variant ? resolveVariant(card.variants, input.variant) : null;

  const required: Record<string, ExpectedPayloadField> = {};
  const optional: Record<string, ExpectedPayloadField> = {};
  const discriminators: Record<string, string[]> = {};
  const item_schemas: Record<string, unknown> = {};

  for (const property of card.properties) {
    const field: ExpectedPayloadField = {
      data_type: property.data_type,
      formats: property.data_formats,
      ...(property.allowed_values ? { allowed_values: property.allowed_values.map((v) => v.value) } : {}),
      definition_id: property.definition_id,
      definition_name: property.definition_name,
    };
    if (property.role === 'discriminator') {
      discriminators[property.payload_key] = property.allowed_values?.map((v) => v.value) ?? [];
    } else if (property.role === 'normal') {
      if (property.required) required[property.payload_key] = field;
      else optional[property.payload_key] = field;
    }
    if (property.item_schema) item_schemas[property.payload_key] = property.item_schema;
  }

  const contexts: Record<string, string[]> = {};
  for (const context of card.contexts) contexts[context.payload_key] = context.values;

  const rulesInScope: EventCardRule[] = variant ? card.rules.filter((r) => !r.variant_id || r.variant_id === variant.id) : card.rules;
  const rules = rulesInScope.map((r) => ({ name: r.name, kind: r.kind, message: r.message, expression_text: r.expression_text }));

  const example: Record<string, unknown> =
    variant?.expected_payload ??
    Object.fromEntries(card.properties.filter((p) => p.example != null).map((p) => [p.payload_key, p.example]));

  return {
    event: card.name,
    variant: variant?.name ?? null,
    required,
    optional,
    discriminators,
    contexts,
    item_schemas,
    rules,
    sdk_default_properties: card.sdk_default_properties,
    example,
  };
}
