/**
 * MCP write tool tests (T-5-01): events, properties/links, identity rules, catalog fields and
 * `batch_apply`, driven through the registered handlers against `:memory:`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../backend/db';
import * as ClientDAL from '../../backend/dal/client.dal';
import * as ProjectDAL from '../../backend/dal/project.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as CatalogDAL from '../../backend/dal/catalog.dal';
import * as IdentifierDAL from '../../backend/dal/identifier.dal';
import * as ChangeLogDAL from '../../backend/dal/change-log.dal';
import { executeOp } from './writeCore';
import { runWithActor } from '../../backend/context/actor';
import { callTool, countRows, toolNames } from './writeTestUtil';

let projectId: string;
let key: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
  projectId = project.id;
  key = project.key;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('registration', () => {
  it('registers the ten write tools', () => {
    const names = toolNames();
    for (const n of [
      'create_event', 'update_event', 'create_property', 'update_property', 'link_event_property',
      'unlink_event_property', 'create_identity_rule', 'set_event_identifiers', 'create_catalog_field', 'batch_apply',
    ]) expect(names).toContain(n);
  });
});

describe('events', () => {
  it('create_event dry run (default) returns a create diff and writes nothing', async () => {
    const before = { events: countRows('events'), log: countRows('change_log') };
    const r = await callTool('create_event', { project_key: key, name: 'page_view', description: 'A view' });
    expect(r.isError).toBe(false);
    expect(r.data.dry_run).toBe(true);
    expect(r.data.action).toBe('create');
    expect(r.data.before).toBeNull();
    expect(r.data.after.name).toBe('page_view');
    expect(r.data.change_log_id).toBeNull();
    expect({ events: countRows('events'), log: countRows('change_log') }).toEqual(before);
  });

  it('create_event apply writes and attributes change_log to agent_name', async () => {
    const r = await callTool('create_event', { project_key: key, name: 'page_view', dry_run: false, agent_name: 'agent-x' });
    expect(r.data.dry_run).toBe(false);
    expect(EventDAL.listEvents(projectId).map((e) => e.name)).toContain('page_view');
    expect(r.data.change_log_id).toBeTruthy();
    const row = ChangeLogDAL.getChangeOrThrow(projectId, r.data.change_log_id);
    expect(row.actor).toBe('agent-x');
    expect(row.source).toBe('mcp');
    expect(row.action).toBe('create');
  });

  it('update_event dry run shows the field diff; apply writes it; no-op is unchanged', async () => {
    EventDAL.createEvent(projectId, { name: 'cart_update' });
    const dry = await callTool('update_event', { project_key: key, event: 'cart_update', description: 'Cart changed' });
    expect(dry.data.action).toBe('update');
    expect(dry.data.differences.map((d: any) => d.field)).toEqual(['description']);
    expect(EventDAL.listEvents(projectId)[0].description).not.toBe('Cart changed');

    await callTool('update_event', { project_key: key, event: 'cart_update', description: 'Cart changed', dry_run: false, agent_name: 'a' });
    expect(EventDAL.listEvents(projectId)[0].description).toBe('Cart changed');

    const again = await callTool('update_event', { project_key: key, event: 'cart_update', description: 'Cart changed' });
    expect(again.data.action).toBe('unchanged');
  });

  it('errors surface as tool errors with the code', async () => {
    EventDAL.createEvent(projectId, { name: 'dup' });
    const dup = await callTool('create_event', { project_key: key, name: 'dup' });
    expect(dup.isError).toBe(true);
    expect(dup.text).toMatch(/^[A-Z_]+: /);
    const missing = await callTool('update_event', { project_key: key, event: 'nope', status: 'draft' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/^EVENT_NOT_FOUND: /);
    const noProject = await callTool('create_event', { project_key: 'zzz', name: 'x' });
    expect(noProject.text).toMatch(/^PROJECT_NOT_FOUND: /);
  });

  it('set_event_identifiers validates names against the registry; [] and null are accepted', async () => {
    EventDAL.createEvent(projectId, { name: 'login' });
    IdentifierDAL.createIdentifier(projectId, { name: 'registered', type: 'hard' });
    const bad = await callTool('set_event_identifiers', { project_key: key, event: 'login', identifiers: ['ghost'], dry_run: false });
    expect(bad.isError).toBe(true);
    const ok = await callTool('set_event_identifiers', { project_key: key, event: 'login', identifiers: ['registered'], dry_run: false });
    expect(ok.data.after.identifiers_json).toEqual(['registered']);
    const none = await callTool('set_event_identifiers', { project_key: key, event: 'login', identifiers: [], dry_run: false });
    expect(none.data.after.identifiers_json).toEqual([]);
    const derived = await callTool('set_event_identifiers', { project_key: key, event: 'login', identifiers: null });
    expect(derived.data.after.identifiers_json).toBeNull();
    expect(derived.data.dry_run).toBe(true);
  });
});

describe('properties and links', () => {
  it('create_property / update_property with aliases; dry run writes nothing', async () => {
    const dry = await callTool('create_property', {
      project_key: key, scope: 'event', name: 'currency', data_type: 'string', allowed_values: [{ value: 'EUR' }],
    });
    expect(dry.isError).toBe(false);
    expect(PropertyDAL.listProperties(projectId, {})).toHaveLength(0);
    expect(dry.data.after.allowed_values_json).toBeTruthy();

    await callTool('create_property', { project_key: key, scope: 'event', name: 'currency', data_type: 'string', dry_run: false });
    const upd = await callTool('update_property', { project_key: key, property: 'currency', kind: 'context', category_override: 'event', dry_run: false, agent_name: 'bot' });
    expect(upd.data.action).toBe('update');
    const fields = upd.data.differences.map((d: any) => d.field);
    expect(fields).toContain('kind');
    const log = ChangeLogDAL.getChangeOrThrow(projectId, upd.data.change_log_id);
    expect(log.actor).toBe('bot');
  });

  it('link_event_property creates a named definition, updates an existing link, and unlink deletes', async () => {
    EventDAL.createEvent(projectId, { name: 'purchase' });
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total', data_type: 'number' });

    const dry = await callTool('link_event_property', { project_key: key, event: 'purchase', property: 'total', definition: 'Order total' });
    expect(dry.data.action).toBe('create');
    expect(countRows('event_properties')).toBe(0);
    expect(countRows('property_definitions')).toBe(1); // only the general one; the dry run rolled back

    const applied = await callTool('link_event_property', {
      project_key: key, event: 'purchase', property: 'total', required: true, role: 'normal', definition: 'Order total', dry_run: false, agent_name: 'bot',
    });
    expect(applied.data.action).toBe('create');
    expect(applied.data.change_log_ids.length).toBeGreaterThanOrEqual(1);
    expect(countRows('property_definitions')).toBe(2);

    const upd = await callTool('link_event_property', { project_key: key, event: 'purchase', property: 'total', required: false, dry_run: false });
    expect(upd.data.action).toBe('update');
    expect(upd.data.differences.map((d: any) => d.field)).toContain('required');
    expect(countRows('property_definitions')).toBe(2);

    const unDry = await callTool('unlink_event_property', { project_key: key, event: 'purchase', property: 'total' });
    expect(unDry.data.action).toBe('delete');
    expect(countRows('event_properties')).toBe(1);
    await callTool('unlink_event_property', { project_key: key, event: 'purchase', property: 'total', dry_run: false });
    expect(countRows('event_properties')).toBe(0);
    const again = await callTool('unlink_event_property', { project_key: key, event: 'purchase', property: 'total', dry_run: false });
    expect(again.isError).toBe(true);
    expect(again.text).toMatch(/^LINK_NOT_FOUND/);
  });

  it('an invalid role is a tool error, not a crash', async () => {
    EventDAL.createEvent(projectId, { name: 'e1' });
    PropertyDAL.createProperty(projectId, { scope: 'event', name: 'p1', data_type: 'string' });
    const r = await callTool('link_event_property', { project_key: key, event: 'e1', property: 'p1', role: 'bogus' });
    expect(r.isError).toBe(true);
  });
});

describe('identity rules and catalog fields', () => {
  it('create_identity_rule: new identifier honoured, type conflict is a 409 tool error naming the registry type', async () => {
    const ok = await callTool('create_identity_rule', {
      project_key: key, name: 'Login', identifier_name: 'registered', identity_type: 'hard', dry_run: false, agent_name: 'bot',
    });
    expect(ok.isError).toBe(false);
    expect(IdentifierDAL.listIdentifiers(projectId)[0].type).toBe('hard');

    const clash = await callTool('create_identity_rule', { project_key: key, name: 'Login 2', identifier_name: 'registered', identity_type: 'soft' });
    expect(clash.isError).toBe(true);
    expect(clash.text).toMatch(/^IDENTIFIER_TYPE_MISMATCH: .*hard/);

    const same = await callTool('create_identity_rule', { project_key: key, name: 'Login 3', identifier_name: 'registered' });
    expect(same.data.action).toBe('create');
    expect(countRows('identity_rules')).toBe(1);
  });

  it('create_identity_rule resolves trigger_event by name', async () => {
    const ev = EventDAL.createEvent(projectId, { name: 'login' });
    const r = await callTool('create_identity_rule', {
      project_key: key, name: 'Login', identifier_name: 'registered', identity_type: 'hard', trigger_event: 'login', dry_run: false,
    });
    expect(r.data.after.trigger_event_id).toBe(ev.id);
  });

  it('create_catalog_field by catalog name with aliases', async () => {
    CatalogDAL.createCatalog(projectId, { name: 'products' });
    const dry = await callTool('create_catalog_field', { project_key: key, catalog: 'products', name: 'sku', data_type: 'string', lookup_key: true, searchable: true });
    expect(dry.data.action).toBe('create');
    expect(dry.data.after.is_lookup_key).toBe(true);
    expect(countRows('catalog_fields')).toBe(0);
    const applied = await callTool('create_catalog_field', { project_key: key, catalog: 'products', name: 'sku', data_type: 'string', lookup_key: true, dry_run: false, agent_name: 'bot' });
    expect(countRows('catalog_fields')).toBe(1);
    expect(ChangeLogDAL.getChangeOrThrow(projectId, applied.data.change_log_id).actor).toBe('bot');
    const nope = await callTool('create_catalog_field', { project_key: key, catalog: 'ghost', name: 'x' });
    expect(nope.text).toMatch(/^CATALOG_NOT_FOUND/);
  });
});

describe('batch_apply', () => {
  const ops = [
    { op: 'create_event', name: 'purchase' },
    { op: 'create_property', scope: 'event', name: 'total', data_type: 'number' },
    { op: 'link_event_property', event: 'purchase', property: 'total', required: true },
  ];

  it('dry run executes in order (later ops see earlier ones) and writes nothing', async () => {
    const r = await callTool('batch_apply', { project_key: key, operations: ops });
    expect(r.data.dry_run).toBe(true);
    expect(r.data.applied).toBe(3);
    expect(r.data.failed).toBe(0);
    expect(r.data.batch_id).toBeNull();
    expect(countRows('events')).toBe(0);
    expect(countRows('change_log')).toBe(0);
  });

  it('apply shares one batch_id across all change_log rows and attributes the agent', async () => {
    const r = await callTool('batch_apply', { project_key: key, operations: ops, dry_run: false, agent_name: 'sheet-bot' });
    expect(r.data.applied).toBe(3);
    expect(r.data.batch_id).toBeTruthy();
    const rows = ChangeLogDAL.listChanges(projectId, { batch_id: r.data.batch_id });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.map((x) => x.batch_id))).toEqual(new Set([r.data.batch_id]));
    expect(new Set(rows.map((x) => x.actor))).toEqual(new Set(['sheet-bot']));
    expect(countRows('event_properties')).toBe(1);
  });

  it('stops at the first failure and reports counts', async () => {
    const r = await callTool('batch_apply', {
      project_key: key,
      dry_run: false,
      operations: [
        { op: 'create_event', name: 'a' },
        { op: 'update_event', event: 'missing', status: 'draft' },
        { op: 'create_event', name: 'c' },
      ],
    });
    expect(r.isError).toBe(false);
    expect(r.data.applied).toBe(1);
    expect(r.data.failed).toBe(1);
    expect(r.data.not_run).toBe(1);
    expect(r.data.results[1].error.code).toBe('EVENT_NOT_FOUND');
    expect(EventDAL.listEvents(projectId).map((e) => e.name)).toEqual(['a']);
  });

  it('reports unknown operations and invalid arguments as failures', async () => {
    const unknown = await callTool('batch_apply', { project_key: key, operations: [{ op: 'drop_everything' }] });
    expect(unknown.data.results[0].error.code).toBe('UNKNOWN_OPERATION');
    const invalid = await callTool('batch_apply', { project_key: key, operations: [{ op: 'create_property', name: 'x' }] });
    expect(invalid.data.results[0].error.code).toBe('VALIDATION_ERROR');
  });
});

describe('polish', () => {
  it('rejects unknown keys for single tools and batch operations', async () => {
    const r = await callTool('create_event', { project_key: key, name: 'x', descripton: 'typo' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('descripton');
    const b = await callTool('batch_apply', { project_key: key, operations: [{ op: 'create_event', name: 'x', nme: 'y' }] });
    expect(b.data.results[0].error.code).toBe('VALIDATION_ERROR');
    expect(b.data.results[0].error.message).toContain('nme');
  });

  it('change_log_ids only include rows written by this call, not another actor', () => {
    const op = {
      entityType: 'event', label: 'e', before: null,
      run() {
        const row = EventDAL.createEvent(projectId, { name: 'mine' });
        runWithActor({ actor: 'someone-else', source: 'ui' }, () => EventDAL.createEvent(projectId, { name: 'theirs' }));
        return { row: row as unknown as Record<string, unknown>, entityId: row.id };
      },
    };
    const res = runWithActor({ actor: 'me', source: 'mcp' }, () => executeOp(op, true));
    expect(res.change_log_ids).toHaveLength(1);
    expect(ChangeLogDAL.getChangeOrThrow(projectId, res.change_log_ids[0]).actor).toBe('me');
  });
});
