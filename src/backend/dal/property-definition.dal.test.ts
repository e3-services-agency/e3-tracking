/**
 * property-definition.dal tests (T-4-00, D-58): seeding a `general` definition at property
 * creation, sync from `updateProperty`, create/update/delete guards (409 while linked, refuses
 * deleting the last definition), and the `definition_id` validation on event links.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import * as EventDAL from './event.dal';
import * as PropertyDefinitionDAL from './property-definition.dal';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';

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

describe('property-definition.dal: seeding and sync', () => {
  it('createProperty seeds one "general" definition from the property\'s own fields', () => {
    const prop = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      description: 'The action taken',
      data_formats_json: ['email'],
      allowed_values_json: [{ value: 'add' }],
      example_values_json: [{ value: 'add' }],
    });
    const defs = PropertyDefinitionDAL.listDefinitions(projectId, prop.id);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('general');
    expect(defs[0].description).toBe('The action taken');
    expect(defs[0].format).toBe('email');
    expect(defs[0].allowed_values_json).toEqual([{ value: 'add' }]);
    expect(defs[0].example_values_json).toEqual([{ value: 'add' }]);
  });

  it('updateProperty keeps the "general" definition in sync', () => {
    const prop = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' });
    PropertyDAL.updateProperty(projectId, prop.id, { description: 'Updated description' });
    const defs = PropertyDefinitionDAL.listDefinitions(projectId, prop.id);
    expect(defs[0].description).toBe('Updated description');
  });
});

describe('property-definition.dal: create/update/delete', () => {
  let propertyId: string;

  beforeEach(() => {
    propertyId = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'action', data_type: 'string' }).id;
  });

  it('creates a second named definition and rejects a duplicate name', () => {
    const consent = PropertyDefinitionDAL.createDefinition(projectId, propertyId, {
      name: 'consent_action',
      description: 'accept or reject',
      allowed_values_json: [{ value: 'accept' }, { value: 'reject' }],
    });
    expect(consent.name).toBe('consent_action');
    expect(PropertyDefinitionDAL.listDefinitions(projectId, propertyId)).toHaveLength(2);

    expect(() =>
      PropertyDefinitionDAL.createDefinition(projectId, propertyId, { name: 'consent_action' })
    ).toThrow(ConflictError);
  });

  it('refuses to delete a definition while an event link uses it', () => {
    const consent = PropertyDefinitionDAL.createDefinition(projectId, propertyId, { name: 'consent_action' });
    const event = EventDAL.createEvent(projectId, { name: 'consent' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propertyId, definition_id: consent.id });

    expect(() => PropertyDefinitionDAL.deleteDefinition(projectId, propertyId, consent.id)).toThrow(ConflictError);

    EventDAL.detachPropertyFromEvent(projectId, event.id, propertyId);
    PropertyDefinitionDAL.deleteDefinition(projectId, propertyId, consent.id); // now fine
    expect(PropertyDefinitionDAL.listDefinitions(projectId, propertyId)).toHaveLength(1);
  });

  it('refuses to delete a property\'s last remaining definition', () => {
    const [only] = PropertyDefinitionDAL.listDefinitions(projectId, propertyId);
    expect(() => PropertyDefinitionDAL.deleteDefinition(projectId, propertyId, only.id)).toThrow(ConflictError);
  });

  it('event links validate definition_id belongs to the same property', () => {
    const otherProperty = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'other', data_type: 'string' });
    const otherDefs = PropertyDefinitionDAL.listDefinitions(projectId, otherProperty.id);
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    expect(() =>
      EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propertyId, definition_id: otherDefs[0].id })
    ).toThrow(BadRequestError);
  });

  it('a link with no definition_id falls back to the property\'s default (general) definition', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const link = EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: propertyId });
    const [general] = PropertyDefinitionDAL.listDefinitions(projectId, propertyId);
    expect(link.definition_id).toBe(general.id);
  });

  it('reorderDefinitions persists sort_order and rejects a set that does not match exactly', () => {
    const second = PropertyDefinitionDAL.createDefinition(projectId, propertyId, { name: 'second' });
    const [first] = PropertyDefinitionDAL.listDefinitions(projectId, propertyId);
    const reordered = PropertyDefinitionDAL.reorderDefinitions(projectId, propertyId, [second.id, first.id]);
    expect(reordered.map((d) => d.id)).toEqual([second.id, first.id]);

    expect(() => PropertyDefinitionDAL.reorderDefinitions(projectId, propertyId, [second.id])).toThrow(BadRequestError);
  });

  it('getDefinitionOrThrow 404s on an unknown id', () => {
    expect(() => PropertyDefinitionDAL.getDefinitionOrThrow(projectId, 'nope')).toThrow(NotFoundError);
  });
});
