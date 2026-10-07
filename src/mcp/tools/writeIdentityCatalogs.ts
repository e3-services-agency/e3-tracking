/**
 * `create_identity_rule`, `create_catalog_field` (T-5-01): same DAL calls as `routes/identity-rules.ts`
 * and `routes/catalogs.ts`. A D-69 type conflict surfaces as the DAL's 409 `IDENTIFIER_TYPE_MISMATCH`
 * tool error, whose message names the registry type.
 */
import { z } from 'zod';
import * as IdentityRuleDAL from '../../backend/dal/identity-rule.dal';
import * as CatalogDAL from '../../backend/dal/catalog.dal';
import { McpToolError } from '../errors';
import { resolveEvent } from '../resolve';
import { applyAliases, pick } from './writeCore';
import type { WriteTool } from './writeCore';

const asRecord = (row: unknown) => row as Record<string, unknown>;
const nullableStr = z.string().nullable().optional();

const RULE_KEYS = [
  'identifier_id', 'identifier_name', 'identity_type', 'name', 'description', 'trigger_event_id', 'trigger_text', 'value_rule',
  'example', 'owner', 'source_id', 'tracker', 'priority', 'status', 'sort_order', 'transformations_json', 'sdk_call',
] as const;

export const createIdentityRuleTool: WriteTool = {
  name: 'create_identity_rule',
  description:
    'Creates an identity rule (an identification act): name plus identifier_name (or identifier_id). identity_type (hard|soft) is honoured only when the identifier name is new to the registry; an existing identifier of another type is a 409 IDENTIFIER_TYPE_MISMATCH tool error naming the registry type (D-69). trigger_event (name or id) sets the trigger event. Dry run by default.',
  shape: {
    name: z.string(),
    identifier_name: z.string().optional(),
    identifier_id: nullableStr,
    identity_type: z.string().optional(),
    description: nullableStr,
    trigger_event: z.string().optional(),
    trigger_event_id: nullableStr,
    trigger_text: nullableStr,
    value_rule: nullableStr,
    example: nullableStr,
    owner: nullableStr,
    source_id: nullableStr,
    tracker: nullableStr,
    priority: nullableStr,
    status: nullableStr,
    sort_order: z.number().optional(),
    transformations_json: z.array(z.string()).nullable().optional(),
    sdk_call: nullableStr,
  },
  prepare(projectId, args) {
    const name = String(args.name ?? '').trim();
    const input = pick(args, RULE_KEYS);
    if (typeof args.trigger_event === 'string' && args.trigger_event.trim()) {
      input.trigger_event_id = resolveEvent(projectId, args.trigger_event).id;
    }
    return {
      entityType: 'identity_rule',
      label: name,
      before: null,
      run() {
        const row = IdentityRuleDAL.createIdentityRule(projectId, {
          ...input,
          name,
          identifier_name: typeof input.identifier_name === 'string' ? input.identifier_name.trim() : '',
        } as IdentityRuleDAL.IdentityRuleInput);
        return { row: asRecord(row), entityId: row.id };
      },
    };
  },
};

const FIELD_KEYS = [
  'description', 'data_type', 'is_lookup_key', 'is_searchable', 'is_required', 'client_field_name', 'bloomreach_column',
  'purpose', 'priority', 'status', 'field_family', 'item_level', 'source_mapping_json',
] as const;

function resolveCatalog(projectId: string, ref: string): CatalogDAL.CatalogRow {
  const all = CatalogDAL.listCatalogs(projectId);
  const found = all.find((c) => c.id === ref) ?? all.find((c) => c.name === ref);
  if (!found) throw new McpToolError('CATALOG_NOT_FOUND', `No catalog named or with id "${ref}".`);
  return found;
}

export const createCatalogFieldTool: WriteTool = {
  name: 'create_catalog_field',
  description:
    'Adds a field to a catalog (catalog by name or id): name, data_type, is_searchable (alias searchable), is_required (alias required), is_lookup_key (alias lookup_key), plus the other REST body fields. Dry run by default; the searchable limit and uniqueness checks come from the DAL.',
  shape: {
    catalog: z.string(),
    name: z.string(),
    data_type: nullableStr,
    description: nullableStr,
    is_searchable: z.boolean().optional(),
    is_required: z.boolean().optional(),
    is_lookup_key: z.boolean().optional(),
    searchable: z.boolean().optional(),
    required: z.boolean().optional(),
    lookup_key: z.boolean().optional(),
    client_field_name: nullableStr,
    bloomreach_column: nullableStr,
    purpose: nullableStr,
    priority: nullableStr,
    status: nullableStr,
    field_family: nullableStr,
    item_level: nullableStr,
    source_mapping_json: z.any().optional(),
  },
  prepare(projectId, args) {
    const catalog = resolveCatalog(projectId, String(args.catalog));
    const name = String(args.name ?? '').trim();
    const input = pick(applyAliases(args, { searchable: 'is_searchable', required: 'is_required', lookup_key: 'is_lookup_key' }), FIELD_KEYS);
    return {
      entityType: 'catalog_field',
      label: `${catalog.name} / ${name}`,
      before: null,
      run() {
        const row = CatalogDAL.createCatalogField(projectId, catalog.id, { ...input, name } as CatalogDAL.CatalogFieldInput);
        return { row: asRecord(row), entityId: row.id };
      },
    };
  },
};
