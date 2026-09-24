import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import { ConflictError, NotFoundError } from '../errors';

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('client.dal', () => {
  it('creates and lists clients', () => {
    ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    const list = ClientDAL.listClients();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: 'acme', name: 'Acme' });
  });

  it('rejects a duplicate client key', () => {
    ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    expect(() => ClientDAL.createClient({ key: 'acme', name: 'Acme 2' })).toThrow(ConflictError);
  });

  it('deletes a client with no projects', () => {
    const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    ClientDAL.deleteClient(client.id);
    expect(ClientDAL.listClients()).toHaveLength(0);
  });

  it('refuses to delete a client that owns a project', () => {
    const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
    expect(() => ClientDAL.deleteClient(client.id)).toThrow(ConflictError);
  });
});

describe('project.dal', () => {
  it('creates a project under a client and lists it with the client embedded', () => {
    const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
    expect(project.client_id).toBe(client.id);

    const list = ProjectDAL.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].client).toMatchObject({ id: client.id, key: 'acme' });
  });

  it('rejects create with an unknown client_id', () => {
    expect(() =>
      ProjectDAL.createProject({ client_id: 'missing', key: 'x', name: 'X' })
    ).toThrow(NotFoundError);
  });

  it('two projects under one client stay independent (qa-tester scenario)', () => {
    const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    const a = ProjectDAL.createProject({ client_id: client.id, key: 'acme-a', name: 'Acme A' });
    const b = ProjectDAL.createProject({ client_id: client.id, key: 'acme-b', name: 'Acme B' });
    expect(a.id).not.toBe(b.id);
    expect(ProjectDAL.listProjects().map((p) => p.key).sort()).toEqual(['acme-a', 'acme-b']);
  });

  it('updates project settings including the Bloomreach identifiers', () => {
    const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
    const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
    const updated = ProjectDAL.updateProject(project.id, {
      bloomreach_project_token: 'tok',
      bloomreach_api_base_url: 'https://api.example.com',
      bloomreach_project_url: 'https://app.example.com',
      default_expiration_json: { enabled: true, count: 3, units: 'months' },
    });
    expect(updated.bloomreach_project_token).toBe('tok');
    expect(updated.default_expiration_json).toEqual({ enabled: true, count: 3, units: 'months' });
  });
});
