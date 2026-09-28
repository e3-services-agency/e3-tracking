/**
 * `Project.industry` DAL test (T-3-10, D-57): optional free text, used as the templates page's
 * default facet filter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import { ValidationError } from '../errors';

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

describe('project.dal: industry (T-3-10, D-57)', () => {
  it('defaults to null on create', () => {
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.industry).toBeNull();
  });

  it('updates and trims, and null clears it', () => {
    const updated = ProjectDAL.updateProject(projectId, { industry: '  ecommerce  ' });
    expect(updated.industry).toBe('ecommerce');
    const cleared = ProjectDAL.updateProject(projectId, { industry: null });
    expect(cleared.industry).toBeNull();
  });

  it('accepts a value outside the suggested LIBRARY_INDUSTRIES vocabulary (free text, not a closed enum)', () => {
    const updated = ProjectDAL.updateProject(projectId, { industry: 'aerospace' });
    expect(updated.industry).toBe('aerospace');
  });

  it('fix round LOW 4 (2026-09-28): rejects a non-string, non-null industry with a 400 ValidationError, not a raw 500', () => {
    // @ts-expect-error -- deliberately wrong type, reproducing a client sending PATCH {industry: 42}
    expect(() => ProjectDAL.updateProject(projectId, { industry: 42 })).toThrow(ValidationError);
    // @ts-expect-error
    expect(() => ProjectDAL.updateProject(projectId, { industry: { nested: true } })).toThrow(ValidationError);
  });
});
