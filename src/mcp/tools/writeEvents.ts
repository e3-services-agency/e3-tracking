/** `create_event`, `update_event`, `set_event_identifiers` (T-5-01): same DAL calls as `routes/events.ts`. */
import { z } from 'zod';
import * as EventDAL from '../../backend/dal/event.dal';
import { resolveEvent } from '../resolve';
import { pick } from './writeCore';
import type { WriteTool } from './writeCore';

const EVENT_KEYS = [
  'business_name', 'description', 'purpose', 'page', 'trigger_text', 'grain', 'identity_note', 'triggers_json', 'class',
  'implementation_method', 'dl_event_name', 'identifiers_json', 'owner_business', 'owner_technical', 'priority', 'status',
  'expiration_json', 'not_suitable_for', 'agent_instructions', 'derived_metrics_json', 'tags_json', 'source_ids',
] as const;

const nullableStr = z.string().nullable().optional();
const eventFieldsShape = {
  business_name: nullableStr,
  description: nullableStr,
  purpose: nullableStr,
  page: nullableStr,
  trigger_text: nullableStr,
  grain: nullableStr,
  identity_note: nullableStr,
  triggers_json: z.any().optional(),
  class: z.string().optional(),
  implementation_method: z.string().optional(),
  dl_event_name: nullableStr,
  identifiers_json: z.array(z.string()).nullable().optional(),
  owner_business: nullableStr,
  owner_technical: nullableStr,
  priority: nullableStr,
  status: z.string().optional(),
  expiration_json: z.any().optional(),
  not_suitable_for: nullableStr,
  agent_instructions: nullableStr,
  derived_metrics_json: z.any().optional(),
  tags_json: z.any().optional(),
  source_ids: z.array(z.string()).nullable().optional(),
};

function eventInput(args: Record<string, unknown>): Partial<EventDAL.EventInput> {
  const input = pick(args, EVENT_KEYS);
  // REST: only a string implementation_method is applied; omitted = Automatic (the DAL derives it).
  if (typeof input.implementation_method !== 'string') delete input.implementation_method;
  return input as Partial<EventDAL.EventInput>;
}

const asRecord = (row: unknown) => row as Record<string, unknown>;

export const createEventTool: WriteTool = {
  name: 'create_event',
  description:
    'Creates an event (name plus any REST body field: class, implementation_method, dl_event_name, identifiers_json, description, ...). Dry run by default: returns the planned row as {action, before, after, differences, warnings} and writes nothing; pass dry_run:false to apply.',
  shape: { name: z.string(), ...eventFieldsShape },
  prepare(projectId, args) {
    const name = String(args.name ?? '').trim();
    return {
      entityType: 'event',
      label: name,
      before: null,
      run() {
        const row = EventDAL.createEvent(projectId, { ...eventInput(args), name }, { applyDefaultSource: true });
        return { row: asRecord(row), entityId: row.id };
      },
    };
  },
};

export const updateEventTool: WriteTool = {
  name: 'update_event',
  description:
    'Updates an event found by name or id; any REST body field (implementation_method, identifiers_json, dl_event_name, status, ...); new_name renames it. Dry run by default, returns {action: update|unchanged, before, after, differences}.',
  shape: { event: z.string(), new_name: z.string().optional(), ...eventFieldsShape },
  prepare(projectId, args) {
    const found = resolveEvent(projectId, String(args.event));
    const before = EventDAL.getEventOrThrow(projectId, found.id);
    return {
      entityType: 'event',
      label: before.name,
      before: asRecord(before),
      run() {
        const input = eventInput(args);
        if (typeof args.new_name === 'string') input.name = args.new_name;
        const row = EventDAL.updateEvent(projectId, before.id, input);
        return { row: asRecord(row), entityId: row.id };
      },
    };
  },
};

export const setEventIdentifiersTool: WriteTool = {
  name: 'set_event_identifiers',
  description:
    "Sets which registry identifiers an event carries (D-67): a list of identifier names (validated against the project's identifier registry), [] = carries nothing, null = derived default. Dry run by default.",
  shape: { event: z.string(), identifiers: z.array(z.string()).nullable() },
  prepare(projectId, args) {
    const found = resolveEvent(projectId, String(args.event));
    const before = EventDAL.getEventOrThrow(projectId, found.id);
    return {
      entityType: 'event',
      label: before.name,
      before: asRecord(before),
      run() {
        const row = EventDAL.updateEvent(projectId, before.id, { identifiers_json: args.identifiers as string[] | null });
        return { row: asRecord(row), entityId: row.id };
      },
    };
  },
};
