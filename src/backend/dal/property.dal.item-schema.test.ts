/**
 * `Property.item_schema_json` DAL tests (D-30 ItemSchema, T-2-06). Named separately from a
 * hypothetical full `property.dal.test.ts` (which does not exist yet) to avoid colliding with
 * another task adding one; scoped to only what T-2-06 owns.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as PropertyDAL from './property.dal';
import { BadRequestError, ItemSchemaRequiresArrayError } from '../errors';

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

const SCHEMA = [
  { field: 'product_id', data_type: 'string', required: true },
  { field: 'price', data_type: 'number', data_formats: ['money'], required: true },
];

describe('property.dal: item_schema_json', () => {
  it('accepts item_schema_json on an array property and round-trips it', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'product_list',
      data_type: 'array',
      item_schema_json: SCHEMA,
    });
    expect(property.item_schema_json).toEqual(SCHEMA);
    const fetched = PropertyDAL.getPropertyOrThrow(projectId, property.id);
    expect(fetched.item_schema_json).toEqual(SCHEMA);
  });

  it('rejects item_schema_json on a non-array property (400 ITEM_SCHEMA_REQUIRES_ARRAY)', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'total_price',
        data_type: 'number',
        item_schema_json: SCHEMA,
      })
    ).toThrow(ItemSchemaRequiresArrayError);
  });

  it('rejects a malformed item_schema_json shape', () => {
    expect(() =>
      PropertyDAL.createProperty(projectId, {
        scope: 'event',
        name: 'product_list',
        data_type: 'array',
        item_schema_json: [{ data_type: 'string' }],
      })
    ).toThrow(BadRequestError);
  });

  it('rejects setting item_schema_json via update when data_type stays non-array', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'total_price',
      data_type: 'number',
    });
    expect(() => PropertyDAL.updateProperty(projectId, property.id, { item_schema_json: SCHEMA })).toThrow(
      ItemSchemaRequiresArrayError
    );
  });

  it('allows setting data_type and item_schema_json together in one update', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'product_list',
      data_type: 'string',
    });
    const updated = PropertyDAL.updateProperty(projectId, property.id, {
      data_type: 'array',
      item_schema_json: SCHEMA,
    });
    expect(updated.data_type).toBe('array');
    expect(updated.item_schema_json).toEqual(SCHEMA);
  });

  it('null clears item_schema_json', () => {
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'product_list',
      data_type: 'array',
      item_schema_json: SCHEMA,
    });
    const updated = PropertyDAL.updateProperty(projectId, property.id, { item_schema_json: null });
    expect(updated.item_schema_json).toBeNull();
  });
});
