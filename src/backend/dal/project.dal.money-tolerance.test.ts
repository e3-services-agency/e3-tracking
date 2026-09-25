/**
 * `Project.money_tolerance_percent`/`money_tolerance_floor` DAL tests (D-30, T-2-06). Named
 * separately from a hypothetical full `project.dal.test.ts` (which does not exist yet).
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

describe('project.dal: money tolerance (D-30)', () => {
  it('defaults to 1 percent / 0.01 floor on create', () => {
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.money_tolerance_percent).toBe(1);
    expect(project.money_tolerance_floor).toBe(0.01);
  });

  it('updates both fields', () => {
    const updated = ProjectDAL.updateProject(projectId, { money_tolerance_percent: 2.5, money_tolerance_floor: 0.5 });
    expect(updated.money_tolerance_percent).toBe(2.5);
    expect(updated.money_tolerance_floor).toBe(0.5);
  });

  it('rejects a percent outside 0-100', () => {
    expect(() => ProjectDAL.updateProject(projectId, { money_tolerance_percent: 150 })).toThrow(ValidationError);
    expect(() => ProjectDAL.updateProject(projectId, { money_tolerance_percent: -1 })).toThrow(ValidationError);
  });

  it('rejects a negative floor', () => {
    expect(() => ProjectDAL.updateProject(projectId, { money_tolerance_floor: -0.01 })).toThrow(ValidationError);
  });
});
