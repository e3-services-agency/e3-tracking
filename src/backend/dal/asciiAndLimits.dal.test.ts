/**
 * T-2-12 (D-38): ASCII name validation and the Bloomreach 255 event-type / 255
 * properties-per-event limits. `NAME_NOT_ASCII`, `LIMIT_EVENT_TYPES`, `LIMIT_EVENT_PROPERTIES`
 * are all `BadRequestError` subclasses (400); `limits.service.ts` is exercised read-only against
 * the same fixtures.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import { NameNotAsciiError, LimitEventTypesError, LimitEventPropertiesError } from '../errors';
import { getEventTypeLimitSummary, getEventPropertyLimitSummaries } from '../services/limits.service';

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

describe('ASCII name validation', () => {
  it('rejects an event name with a diacritic (NAME_NOT_ASCII, 400)', () => {
    expect(() => EventDAL.createEvent(projectId, { name: 'inscription_é' })).toThrow(NameNotAsciiError);
    try {
      EventDAL.createEvent(projectId, { name: 'inscription_é' });
    } catch (err) {
      expect((err as NameNotAsciiError).code).toBe('NAME_NOT_ASCII');
      expect((err as NameNotAsciiError).field).toBe('name');
    }
  });

  it('rejects a property name with a diacritic on create and on rename', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, { scope: 'event', name: 'préférence', data_type: 'string' })
    ).toThrow(NameNotAsciiError);
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'preference', data_type: 'string' });
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { name: 'préférence' })).toThrow(
      NameNotAsciiError
    );
  });

  it('accepts a plain ASCII name', () => {
    expect(EventDAL.createEvent(projectId, { name: 'purchase' }).name).toBe('purchase');
  });
});

describe('the 255 event-types-per-project limit', () => {
  it('rejects creating the 256th event with LIMIT_EVENT_TYPES (400)', () => {
    const db = getDb();
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO events (id, project_id, name, class, status, created_at, updated_at)
       VALUES (?, ?, ?, 'custom', 'planned', ?, ?)`
    );
    for (let i = 0; i < 255; i++) {
      insert.run(`seed-${i}`, projectId, `event_${i}`, now, now);
    }
    expect(getEventTypeLimitSummary(projectId)).toEqual({ count: 255, limit: 255, overLimit: false });
    expect(() => EventDAL.createEvent(projectId, { name: 'one_too_many' })).toThrow(LimitEventTypesError);
  });
});

describe('the 255 properties-per-event limit', () => {
  it('rejects attaching the 256th property to an event with LIMIT_EVENT_PROPERTIES (400)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const db = getDb();
    const now = new Date().toISOString();
    const insertProperty = db.prepare(
      `INSERT INTO properties (id, project_id, scope, name, data_type, pii, property_type, created_at, updated_at)
       VALUES (?, ?, 'event', ?, 'string', 0, 'custom', ?, ?)`
    );
    const insertLink = db.prepare(
      `INSERT INTO event_properties (event_id, property_id, required, role, sort_order, created_at, updated_at)
       VALUES (?, ?, 0, 'normal', ?, ?, ?)`
    );
    const propertyIds: string[] = [];
    for (let i = 0; i < 255; i++) {
      const id = `prop-${i}`;
      insertProperty.run(id, projectId, `prop_${i}`, now, now);
      insertLink.run(event.id, id, i, now, now);
      propertyIds.push(id);
    }
    expect(getEventPropertyLimitSummaries(projectId)[0]).toMatchObject({
      event_id: event.id,
      count: 255,
      limit: 255,
      overLimit: false,
    });

    const overflow = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'one_too_many', data_type: 'string' });
    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: overflow.id })
    ).toThrow(LimitEventPropertiesError);
  });
});
