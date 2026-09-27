/**
 * `updateObservation`/`deleteObservation` DAL tests (D-52, T-3-07 fix round WARNING 2): validation
 * of the PATCH fields before anything is read/written, so a malformed body 400s (`ValidationError`)
 * instead of reaching SQLite raw (a stringified `properties`, a non-finite `timestamp`, a `NULL`
 * timestamp hitting the column's `NOT NULL` constraint, a non-string `page_url`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as QaRunDAL from './qa-run.dal';
import * as ObservationDAL from './observation.dal';
import { DuplicateObservationError, ValidationError } from '../errors';

let projectId: string;
let runId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  runId = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('updateObservation validation (fix round WARNING 2)', () => {
  it('rejects a non-object properties value', () => {
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: { a: 1 },
    })!;
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { properties: 'nope' as unknown as Record<string, unknown> })).toThrow(
      ValidationError
    );
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { properties: [1, 2] as unknown as Record<string, unknown> })).toThrow(
      ValidationError
    );
    // Untouched by the rejected attempts.
    const stillThere = ObservationDAL.getObservationOrThrow(projectId, obs.id);
    expect(stillThere.properties_json).toEqual({ a: 1 });
  });

  it('rejects a non-finite or missing-type timestamp', () => {
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: {},
    })!;
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { timestamp: 'abc' as unknown as number })).toThrow(
      ValidationError
    );
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { timestamp: NaN })).toThrow(ValidationError);
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { timestamp: null as unknown as number })).toThrow(
      ValidationError
    );
  });

  it('rejects a non-string, non-null page_url', () => {
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: {},
    })!;
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { page_url: 123 as unknown as string })).toThrow(
      ValidationError
    );
    // null is allowed (clears the field).
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { page_url: null })).not.toThrow();
  });

  it('rejects a non-object, non-null context_values_json', () => {
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: {},
    })!;
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { context_values_json: 'nope' })).toThrow(ValidationError);
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { context_values_json: { a: 1 } })).not.toThrow();
  });

  it('recomputes raw_hash and 409s DUPLICATE_OBSERVATION on a same-run collision, but allows the identical hash in a different run', () => {
    const other = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 2,
      properties: { action: 'remove' },
    })!;
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: { action: 'add' },
    })!;
    expect(() => ObservationDAL.updateObservation(projectId, obs.id, { timestamp: 2, properties: { action: 'remove' } })).toThrow(
      DuplicateObservationError
    );

    const otherRunId = QaRunDAL.createQaRun(projectId, { kind: 'export_paste' }).id;
    const inOtherRun = ObservationDAL.createObservation(projectId, otherRunId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 5,
      properties: { action: 'x' },
    })!;
    const updated = ObservationDAL.updateObservation(projectId, inOtherRun.id, { timestamp: 2, properties: { action: 'remove' } });
    expect(updated.raw_hash).toBe(other.raw_hash);
  });
});

describe('deleteObservation', () => {
  it('hard-deletes the row and 404s for an unknown id', () => {
    const obs = ObservationDAL.createObservation(projectId, runId, {
      source: 'export_paste',
      event_type: 'cart_update',
      timestamp: 1,
      properties: {},
    })!;
    ObservationDAL.deleteObservation(projectId, obs.id);
    expect(() => ObservationDAL.getObservationOrThrow(projectId, obs.id)).toThrow();
    expect(() => ObservationDAL.deleteObservation(projectId, 'does-not-exist')).toThrow();
  });
});
