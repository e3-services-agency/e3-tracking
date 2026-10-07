/**
 * `create_property`, `update_property`, `link_event_property`, `unlink_event_property` (T-5-01):
 * same DAL calls as `routes/properties.ts` and `routes/events.ts`; a link's optional definition name
 * resolves or creates a named definition (D-58).
 */
import { z } from 'zod';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as PropertyDefinitionDAL from '../../backend/dal/property-definition.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import { exampleWarnings } from '../../domain/examples';
import { McpToolError } from '../errors';
import { resolveEvent } from '../resolve';
import { applyAliases, pick } from './writeCore';
import type { WriteTool } from './writeCore';

const PROPERTY_KEYS = [
  'description', 'category', 'category_override', 'notes', 'data_type', 'data_formats_json', 'pii', 'property_type',
  'allowed_values_json', 'example_values_json', 'value_schema_json', 'object_child_property_refs_json', 'item_schema_json',
  'kind', 'derivation_json', 'bloomreach_customer_property', 'priority', 'status', 'mapped_catalog_id',
  'mapped_catalog_field_id', 'mapping_type', 'bundle_ids',
] as const;

const ALIASES = {
  allowed_values: 'allowed_values_json',
  data_formats: 'data_formats_json',
  example_values: 'example_values_json',
};

const nullableStr = z.string().nullable().optional();
const propertyFieldsShape = {
  description: nullableStr,
  category: nullableStr,
  category_override: nullableStr,
  notes: nullableStr,
  data_formats_json: z.any().optional(),
  pii: z.boolean().optional(),
  property_type: z.string().optional(),
  allowed_values_json: z.any().optional(),
  example_values_json: z.any().optional(),
  value_schema_json: z.any().optional(),
  object_child_property_refs_json: z.any().optional(),
  item_schema_json: z.any().optional(),
  kind: z.string().optional(),
  derivation_json: z.any().optional(),
  bloomreach_customer_property: nullableStr,
  priority: nullableStr,
  status: nullableStr,
  mapped_catalog_id: nullableStr,
  mapped_catalog_field_id: nullableStr,
  mapping_type: nullableStr,
  bundle_ids: z.array(z.string()).nullable().optional(),
  // Aliases for the REST `*_json` names.
  allowed_values: z.any().optional(),
  data_formats: z.any().optional(),
  example_values: z.any().optional(),
};

const asRecord = (row: unknown) => row as Record<string, unknown>;

function propertyInput(args: Record<string, unknown>): Record<string, unknown> {
  return pick(applyAliases(args, ALIASES), PROPERTY_KEYS);
}

/** Finds a property by id or exact name; a name shared by an event and a customer property needs `scope`. */
export function resolveProperty(projectId: string, ref: string, scope?: string): PropertyDAL.PropertyRow {
  const all = PropertyDAL.listProperties(projectId, {});
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const named = all.filter((p) => p.name === ref && (!scope || p.scope === scope));
  if (named.length === 0) throw new McpToolError('PROPERTY_NOT_FOUND', `No property named or with id "${ref}"${scope ? ` in scope ${scope}` : ''}.`);
  if (named.length > 1) {
    throw new McpToolError('AMBIGUOUS_PROPERTY', `"${ref}" is both an event and a customer property; pass scope ("event" or "customer").`);
  }
  return named[0];
}

export const createPropertyTool: WriteTool = {
  name: 'create_property',
  description:
    'Creates a property (scope event|customer, name, data_type plus any REST body field; allowed_values, data_formats, example_values are accepted as aliases of the *_json fields). Dry run by default: returns {action, after, differences, warnings}.',
  shape: { scope: z.enum(['event', 'customer']), name: z.string(), data_type: z.string(), ...propertyFieldsShape },
  prepare(projectId, args) {
    const name = String(args.name ?? '').trim();
    return {
      entityType: 'property',
      label: name,
      before: null,
      run() {
        const row = PropertyDAL.createProperty(projectId, {
          ...propertyInput(args),
          scope: args.scope as 'event' | 'customer',
          name,
          data_type: String(args.data_type),
        } as PropertyDAL.PropertyInput);
        return { row: asRecord(row), entityId: row.id };
      },
      warnings: (row) => (row ? exampleWarnings(row as { allowed_values_json?: unknown; example_values_json?: unknown }) : []),
    };
  },
};

export const updatePropertyTool: WriteTool = {
  name: 'update_property',
  description:
    'Updates a property found by name or id (scope disambiguates a name used by both an event and a customer property): allowed_values, data_formats, data_type, kind, category_override, and the other REST body fields. new_name renames it. Dry run by default.',
  shape: {
    property: z.string(),
    scope: z.enum(['event', 'customer']).optional(),
    new_name: z.string().optional(),
    data_type: z.string().optional(),
    ...propertyFieldsShape,
  },
  prepare(projectId, args) {
    const before = resolveProperty(projectId, String(args.property), args.scope as string | undefined);
    return {
      entityType: 'property',
      label: before.name,
      before: asRecord(before),
      run() {
        const input = propertyInput(args);
        if (typeof args.data_type === 'string') input.data_type = args.data_type;
        if (typeof args.new_name === 'string') input.name = args.new_name;
        const row = PropertyDAL.updateProperty(projectId, before.id, input as Partial<PropertyDAL.PropertyInput>);
        return { row: asRecord(row), entityId: row.id };
      },
      warnings: (row) => (row ? exampleWarnings(row as { allowed_values_json?: unknown; example_values_json?: unknown }) : []),
    };
  },
};

function findLink(projectId: string, eventId: string, propertyId: string): EventDAL.EventPropertyRow | null {
  const { properties } = EventDAL.getEventWithProperties(projectId, eventId);
  const link = properties.find((p) => p.property_id === propertyId);
  if (!link) return null;
  const { property: _p, definition: _d, ...row } = link;
  return row;
}

export const linkEventPropertyTool: WriteTool = {
  name: 'link_event_property',
  description:
    'Links a property to an event (both by name or id), or updates the link when it already exists: role normal|discriminator|context, required, priority, status, payload_key, sort_order. `definition` is the name of one of the property\'s named definitions (D-58); it is created when missing (definition_description optional). Dry run by default.',
  shape: {
    event: z.string(),
    property: z.string(),
    property_scope: z.enum(['event', 'customer']).optional(),
    role: z.string().optional(),
    required: z.boolean().optional(),
    definition: z.string().optional(),
    definition_description: z.string().optional(),
    priority: nullableStr,
    status: nullableStr,
    source_id: nullableStr,
    payload_key: nullableStr,
    sort_order: z.number().optional(),
  },
  prepare(projectId, args) {
    const event = resolveEvent(projectId, String(args.event));
    const property = resolveProperty(projectId, String(args.property), (args.property_scope as string | undefined) ?? 'event');
    const before = findLink(projectId, event.id, property.id);
    return {
      entityType: 'event_property',
      label: `${event.name} / ${property.name}`,
      before: before as unknown as Record<string, unknown> | null,
      run() {
        let definitionId: string | undefined;
        if (typeof args.definition === 'string' && args.definition.trim()) {
          const wanted = args.definition.trim().toLowerCase();
          const existing = PropertyDefinitionDAL.listDefinitions(projectId, property.id).find((d) => d.name.toLowerCase() === wanted);
          definitionId =
            existing?.id ??
            PropertyDefinitionDAL.createDefinition(projectId, property.id, {
              name: args.definition.trim(),
              description: typeof args.definition_description === 'string' ? args.definition_description : undefined,
            } as PropertyDefinitionDAL.PropertyDefinitionInput).id;
        }
        const input: EventDAL.EventPropertyInput = {
          property_id: property.id,
          ...(pick(args, ['required', 'role', 'priority', 'status', 'source_id', 'payload_key', 'sort_order']) as Partial<EventDAL.EventPropertyInput>),
        };
        if (definitionId) input.definition_id = definitionId;
        const row = before
          ? EventDAL.updateEventProperty(projectId, event.id, property.id, input)
          : EventDAL.attachPropertyToEvent(projectId, event.id, input);
        return { row: asRecord(row), entityId: event.id };
      },
    };
  },
};

export const unlinkEventPropertyTool: WriteTool = {
  name: 'unlink_event_property',
  description: 'Removes the link between an event and a property (both by name or id). Dry run by default; the diff has action delete.',
  shape: { event: z.string(), property: z.string(), property_scope: z.enum(['event', 'customer']).optional() },
  prepare(projectId, args) {
    const event = resolveEvent(projectId, String(args.event));
    const property = resolveProperty(projectId, String(args.property), (args.property_scope as string | undefined) ?? 'event');
    const before = findLink(projectId, event.id, property.id);
    if (!before) throw new McpToolError('LINK_NOT_FOUND', `Event "${event.name}" has no link to property "${property.name}".`);
    return {
      entityType: 'event_property',
      label: `${event.name} / ${property.name}`,
      before: asRecord(before),
      run() {
        EventDAL.detachPropertyFromEvent(projectId, event.id, property.id);
        return { row: null, entityId: event.id };
      },
    };
  },
};
