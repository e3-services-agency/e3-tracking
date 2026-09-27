/**
 * ChangeLog DAL tests (D-44, T-3-01): `recordChange`/`listChanges` themselves, the actor context
 * propagating through a `db.transaction`, the atomic rollback guarantee, and one test per wired
 * DAL (event, event_property, property, variant) asserting the exact row count a mutation writes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as SourceDAL from './source.dal';
import * as ChangeLogDAL from './change-log.dal';
import { runWithActor } from '../context/actor';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
  delete process.env.E3_DB_PATH;
});

function changesFor(entityType: string, entityId: string) {
  return ChangeLogDAL.listChanges(projectId, { entity_type: entityType, entity_id: entityId });
}

describe('change-log.dal: recordChange / listChanges primitives', () => {
  it('writes one row per create with before:null and every field having after set', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const rows = changesFor('event', event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('create');
    expect(rows[0].entity_label).toBe('cart_update');
    const nameDiff = rows[0].diff_json.find((d) => d.field === 'name');
    expect(nameDiff).toEqual({ field: 'name', before: null, after: 'cart_update' });
  });

  it('writes one row per update with before/after actual values; an update with no real change writes nothing', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    EventDAL.updateEvent(projectId, event.id, { description: 'Fired when the cart changes.' });

    const rows = changesFor('event', event.id).filter((r) => r.action === 'update');
    expect(rows).toHaveLength(1);
    expect(rows[0].diff_json).toEqual([
      { field: 'description', before: null, after: 'Fired when the cart changes.' },
    ]);

    // A no-op update (same description) must not write a second row (D-44).
    EventDAL.updateEvent(projectId, event.id, { description: 'Fired when the cart changes.' });
    expect(changesFor('event', event.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });

  it('writes one row per delete with after:null; deleted_at/created_at/updated_at are excluded from the diff', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    EventDAL.deleteEvent(projectId, event.id);

    const rows = changesFor('event', event.id).filter((r) => r.action === 'delete');
    expect(rows).toHaveLength(1);
    const fields = rows[0].diff_json.map((d) => d.field);
    expect(fields).not.toContain('deleted_at');
    expect(fields).not.toContain('created_at');
    expect(fields).not.toContain('updated_at');
    expect(rows[0].diff_json.find((d) => d.field === 'name')).toEqual({
      field: 'name',
      before: 'cart_update',
      after: null,
    });
  });

  it('fix round INFO 5: create/delete diffs drop project_id/event_id/property_id identity columns but keep id', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });

    const eventFields = changesFor('event', event.id)[0].diff_json.map((d) => d.field);
    expect(eventFields).toContain('id');
    expect(eventFields).not.toContain('project_id');

    const linkFields = changesFor('event_property', `${event.id}:${property.id}`)[0].diff_json.map((d) => d.field);
    expect(linkFields).not.toContain('event_id');
    expect(linkFields).not.toContain('property_id');
  });

  it('actor/source/batch_id come from the actor context (runWithActor), not a hardcoded default', () => {
    const event = runWithActor({ actor: 'Ján Pan', source: 'ui' }, () =>
      EventDAL.createEvent(projectId, { name: 'cart_update' })
    );
    const rows = changesFor('event', event.id);
    expect(rows[0].actor).toBe('Ján Pan');
    expect(rows[0].source).toBe('ui');

    const event2 = runWithActor({ actor: 'agent-1', source: 'mcp', batch_id: 'batch-1' }, () =>
      EventDAL.createEvent(projectId, { name: 'checkout' })
    );
    const rows2 = changesFor('event', event2.id);
    expect(rows2[0].actor).toBe('agent-1');
    expect(rows2[0].source).toBe('mcp');
    expect(rows2[0].batch_id).toBe('batch-1');
  });

  it('outside any runWithActor call, actor/source default to system/system', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const rows = changesFor('event', event.id);
    expect(rows[0].actor).toBe('system');
    expect(rows[0].source).toBe('system');
  });

  it('the whole mutation rolls back when recordChange throws (transaction guarantee)', () => {
    vi.spyOn(ChangeLogDAL, 'recordChange').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => EventDAL.createEvent(projectId, { name: 'cart_update' })).toThrow('boom');

    // Restore the real implementation to inspect the database: the event insert must not have
    // survived even though it ran before the mocked recordChange call raised.
    vi.restoreAllMocks();
    expect(EventDAL.listEvents(projectId)).toHaveLength(0);
  });

  it('listChanges filters by entity_type/entity_id/actor/source/batch_id/since/before and paginates newest-first with a limit', () => {
    const a = EventDAL.createEvent(projectId, { name: 'event_a' });
    const b = EventDAL.createEvent(projectId, { name: 'event_b' });
    EventDAL.updateEvent(projectId, a.id, { description: 'x' });

    const all = ChangeLogDAL.listChanges(projectId);
    expect(all.length).toBeGreaterThanOrEqual(3);
    // Newest first.
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].changed_at >= all[i].changed_at).toBe(true);
    }

    expect(ChangeLogDAL.listChanges(projectId, { entity_id: a.id })).toHaveLength(2);
    expect(ChangeLogDAL.listChanges(projectId, { entity_id: b.id })).toHaveLength(1);
    expect(ChangeLogDAL.listChanges(projectId, { entity_type: 'event' }).length).toBe(all.length);

    const limited = ChangeLogDAL.listChanges(projectId, { limit: 1 });
    expect(limited).toHaveLength(1);

    // Keyset paging: `before` excludes rows at or after the given changed_at.
    const first = ChangeLogDAL.listChanges(projectId, { limit: 1 })[0];
    const rest = ChangeLogDAL.listChanges(projectId, { before: first.changed_at });
    expect(rest.find((r) => r.id === first.id)).toBeUndefined();
  });

  it('fix round ERROR 1: composite keyset paging (changed_at, id) visits 60 same-millisecond-batch rows exactly once with limit smaller than the batch', () => {
    // Insert directly so several rows can share one changed_at value, the way an import batch does.
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO change_log (
        id, project_id, entity_type, entity_id, entity_label, parent_entity_id, action, actor,
        source, batch_id, changed_at, diff_json
      ) VALUES (?, ?, 'event', 'batch-entity', 'batch-entity', NULL, 'update', 'system', 'system', NULL, ?, '[]')`
    );
    const timestamps = Array.from({ length: 14 }, (_, i) => `2030-06-01T00:00:00.${String(i).padStart(3, '0')}Z`);
    const insertedIds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const id = `batch-row-${i}`;
      insert.run(id, projectId, timestamps[i % 14]);
      insertedIds.add(id);
    }

    const seen = new Set<string>();
    let before: string | undefined;
    let beforeId: string | undefined;
    let guard = 0;
    for (;;) {
      const page = ChangeLogDAL.listChanges(projectId, {
        entity_id: 'batch-entity',
        limit: 7,
        before,
        beforeId,
      });
      if (page.length === 0) break;
      for (const row of page) {
        expect(seen.has(row.id)).toBe(false); // no duplicates across pages
        seen.add(row.id);
      }
      const last = page[page.length - 1];
      before = last.changed_at;
      beforeId = last.id;
      guard += 1;
      if (guard > 20) throw new Error('paging loop did not terminate');
    }

    expect(seen.size).toBe(60); // no gaps: every inserted row was visited
    expect(seen).toEqual(insertedIds);
  });

  it('getChangeOrThrow 404s for an id from a different project', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const rows = changesFor('event', event.id);
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-p', name: 'Other' }).id;
    expect(() => ChangeLogDAL.getChangeOrThrow(otherProjectId, rows[0].id)).toThrow();
  });
});

describe('change-log.dal: one row per mutation on event.dal.ts', () => {
  it('createEvent writes 1 create row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    expect(changesFor('event', event.id)).toHaveLength(1);
  });

  it('updateEvent writes 1 update row (plus one per variant renamed by the rename cascade)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const discriminator = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: discriminator.id, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });

    EventDAL.updateEvent(projectId, event.id, { name: 'cart_updated' });

    expect(changesFor('event', event.id).filter((r) => r.action === 'update')).toHaveLength(1);
    // The rename cascade regenerates the variant's name/conditions_key -> one variant update row.
    expect(changesFor('variant', variant.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });

  it('deleteEvent writes 1 delete row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    EventDAL.deleteEvent(projectId, event.id);
    expect(changesFor('event', event.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('fix round WARNING 3: deleteEvent logs one variant delete row per cascaded variant, parented under the event', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const discriminator = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: discriminator.id, role: 'discriminator' });
    const v1 = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });
    const v2 = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['remove'] }],
    });

    EventDAL.deleteEvent(projectId, event.id);

    const v1Deletes = changesFor('variant', v1.id).filter((r) => r.action === 'delete');
    const v2Deletes = changesFor('variant', v2.id).filter((r) => r.action === 'delete');
    expect(v1Deletes).toHaveLength(1);
    expect(v2Deletes).toHaveLength(1);
    expect(v1Deletes[0].parent_entity_id).toBe(event.id);
    expect(v1Deletes[0].diff_json.find((d) => d.field === 'name')?.before).toBe(v1.name);
  });

  it('fix round WARNING 4: a source-only updateEvent (source_ids changed, nothing else) logs an update row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const source = SourceDAL.createSource(projectId, { name: 'Website' });

    EventDAL.updateEvent(projectId, event.id, { source_ids: [source.id] });

    const rows = changesFor('event', event.id).filter((r) => r.action === 'update');
    expect(rows).toHaveLength(1);
    expect(rows[0].diff_json.find((d) => d.field === 'source_ids')).toEqual({
      field: 'source_ids',
      before: [],
      after: [source.id],
    });
  });

  it('attachPropertyToEvent writes 1 create row for the event_property link', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });
    expect(changesFor('event_property', `${event.id}:${property.id}`)).toHaveLength(1);
  });

  it('updateEventProperty writes 1 update row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });
    EventDAL.updateEventProperty(projectId, event.id, property.id, { required: true });
    const rows = changesFor('event_property', `${event.id}:${property.id}`);
    expect(rows.filter((r) => r.action === 'update')).toHaveLength(1);
  });

  it('detachPropertyFromEvent writes 1 delete row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id });
    EventDAL.detachPropertyFromEvent(projectId, event.id, property.id);
    const rows = changesFor('event_property', `${event.id}:${property.id}`);
    expect(rows.filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('replaceEventProperties writes exactly two update rows when reordering two links (sort_order diffs)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const p1 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const p2 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'currency', data_type: 'string' });
    EventDAL.replaceEventProperties(projectId, event.id, [
      { property_id: p1.id, sort_order: 0 },
      { property_id: p2.id, sort_order: 1 },
    ]);

    EventDAL.replaceEventProperties(projectId, event.id, [
      { property_id: p1.id, sort_order: 1 },
      { property_id: p2.id, sort_order: 0 },
    ]);

    const p1Updates = changesFor('event_property', `${event.id}:${p1.id}`).filter((r) => r.action === 'update');
    const p2Updates = changesFor('event_property', `${event.id}:${p2.id}`).filter((r) => r.action === 'update');
    expect(p1Updates).toHaveLength(1);
    expect(p2Updates).toHaveLength(1);
    expect(p1Updates[0].diff_json.find((d) => d.field === 'sort_order')).toEqual({
      field: 'sort_order',
      before: 0,
      after: 1,
    });
  });

  it('replaceEventProperties writes a create row for a newly added link and a delete row for a dropped one', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const p1 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const p2 = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'currency', data_type: 'string' });
    EventDAL.replaceEventProperties(projectId, event.id, [{ property_id: p1.id }]);
    EventDAL.replaceEventProperties(projectId, event.id, [{ property_id: p2.id }]);

    expect(changesFor('event_property', `${event.id}:${p1.id}`).filter((r) => r.action === 'delete')).toHaveLength(1);
    expect(changesFor('event_property', `${event.id}:${p2.id}`).filter((r) => r.action === 'create')).toHaveLength(1);
  });
});

describe('change-log.dal: one row per mutation on property.dal.ts', () => {
  it('createProperty writes 1 create row', () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    expect(changesFor('property', property.id)).toHaveLength(1);
  });

  it('updateProperty writes 1 update row (plus one per variant renamed by a discriminator rename cascade)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const discriminator = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: discriminator.id, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });

    PropertyDAL.updateProperty(projectId, discriminator.id, { name: 'cart_action' });

    expect(changesFor('property', discriminator.id).filter((r) => r.action === 'update')).toHaveLength(1);
    expect(changesFor('variant', variant.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });

  it('deleteProperty writes 1 delete row', () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });
    PropertyDAL.deleteProperty(projectId, property.id);
    expect(changesFor('property', property.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: one row per mutation on variant.dal.ts', () => {
  function setUpDiscriminator() {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const discriminator = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: discriminator.id, role: 'discriminator' });
    return { event, discriminator };
  }

  it('createVariant writes 1 create row with parent_entity_id = event id', () => {
    const { event, discriminator } = setUpDiscriminator();
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });
    const rows = changesFor('variant', variant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].parent_entity_id).toBe(event.id);
  });

  it('updateVariant writes 1 update row', () => {
    const { event, discriminator } = setUpDiscriminator();
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });
    VariantDAL.updateVariant(projectId, event.id, variant.id, { description: 'Item added to cart.' });
    const rows = changesFor('variant', variant.id).filter((r) => r.action === 'update');
    expect(rows).toHaveLength(1);
  });

  it('deleteVariant writes 1 delete row', () => {
    const { event, discriminator } = setUpDiscriminator();
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });
    VariantDAL.deleteVariant(projectId, event.id, variant.id);
    expect(changesFor('variant', variant.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: migration sanity', () => {
  it('change_log rows carry a real changed_at and a NOT NULL project_id FK to the project', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const row = getDb().prepare('SELECT * FROM change_log WHERE entity_id = ?').get(event.id) as {
      project_id: string;
      changed_at: string;
    };
    expect(row.project_id).toBe(projectId);
    expect(() => new Date(row.changed_at).toISOString()).not.toThrow();
  });
});
