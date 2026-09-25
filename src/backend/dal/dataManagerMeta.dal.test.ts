/**
 * DAL round-trip tests for the T-2-02 (D-28, D-35) Data Manager meta columns: migration 0010 adds
 * `properties.bloomreach_meta_json`, `events.category`/`events.bloomreach_meta_json`,
 * `event_properties.bloomreach_meta_json`, and `projects.data_manager_meta_json`/
 * `data_manager_customers_json`/`data_manager_events_json`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('property.dal: bloomreach_meta_json round trip', () => {
  it('defaults to null and round-trips an arbitrary object through create and update', () => {
    const created = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' });
    expect(created.bloomreach_meta_json).toBeNull();

    const meta = { source: 'user', used: true, deleting: false, locked_for_contact_migration: false, dm_index: 0, raw: {} };
    const updated = PropertyDAL.updateProperty(projectId, created.id, { bloomreach_meta_json: meta });
    expect(updated.bloomreach_meta_json).toEqual(meta);

    const fetched = PropertyDAL.getPropertyOrThrow(projectId, created.id);
    expect(fetched.bloomreach_meta_json).toEqual(meta);
  });
});

describe('event.dal: category and bloomreach_meta_json round trip', () => {
  it('defaults to null and round-trips through create and update', () => {
    const created = EventDAL.createEvent(projectId, { name: 'purchase' });
    expect(created.category).toBeNull();
    expect(created.bloomreach_meta_json).toBeNull();

    const meta = { source: 'user', used: true, forbidden: false, deleting: false, real_time_analytics: true, dm_index: 0, raw: {} };
    const updated = EventDAL.updateEvent(projectId, created.id, { category: 'MentionMe', bloomreach_meta_json: meta });
    expect(updated.category).toBe('MentionMe');
    expect(updated.bloomreach_meta_json).toEqual(meta);
  });
});

describe('event.dal: event_properties.bloomreach_meta_json round trip', () => {
  it('is set on attach and updated via updateEventProperty', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const meta = { dm_type: 'number', private: false, source: 'user', used: true, deleting: false, group: null, dm_index: 3, raw: {} };
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, bloomreach_meta_json: meta });

    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(properties[0].bloomreach_meta_json).toEqual(meta);

    const meta2 = { ...meta, used: false };
    EventDAL.updateEventProperty(projectId, event.id, property.id, { bloomreach_meta_json: meta2 });
    const { properties: after } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(after[0].bloomreach_meta_json).toEqual(meta2);
  });

  it('preserves an existing link meta through replaceEventProperties when the caller omits bloomreach_meta_json', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const meta = { dm_type: 'number', private: false, source: 'user', used: true, deleting: false, group: null, dm_index: 3, raw: {} };
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, bloomreach_meta_json: meta });

    // Whole-list replace (as the Edit Event panel does), without mentioning bloomreach_meta_json.
    EventDAL.replaceEventProperties(projectId, event.id, [{ property_id: property.id, required: true }]);

    const { properties } = EventDAL.getEventWithProperties(projectId, event.id);
    expect(properties[0].bloomreach_meta_json).toEqual(meta);
    expect(properties[0].required).toBe(true);
  });
});

describe('project.dal: data_manager_* columns round trip', () => {
  it('defaults to null and round-trips through updateProject', () => {
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.data_manager_meta_json).toBeNull();
    expect(project.data_manager_customers_json).toBeNull();
    expect(project.data_manager_events_json).toBeNull();

    const meta = { customers: { are_all_used: false, default_private: false, group_order: ['Personal Data'] } };
    const customersPayload = { payload: { are_all_used: false }, applied_at: '2026-09-25T00:00:00.000Z' };
    const updated = ProjectDAL.updateProject(projectId, {
      data_manager_meta_json: meta,
      data_manager_customers_json: customersPayload,
    });
    expect(updated.data_manager_meta_json).toEqual(meta);
    expect(updated.data_manager_customers_json).toEqual(customersPayload);
  });
});
