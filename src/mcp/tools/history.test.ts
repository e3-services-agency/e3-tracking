/**
 * `get_history` MCP tool handler test (T-3-02, D-44): calls the handler directly against
 * `:memory:`, same pattern as `tools.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../backend/db';
import * as ClientDAL from '../../backend/dal/client.dal';
import * as ProjectDAL from '../../backend/dal/project.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import { McpToolError } from '../errors';
import { getHistory } from './history';

let projectId: string;
let projectKey: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  const project = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' });
  projectId = project.id;
  projectKey = project.key;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('get_history', () => {
  it('returns change_log rows for an entity, newest first', async () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' });
    EventDAL.updateEvent(projectId, event.id, { description: 'Fires on cart change.' });

    const rows = await getHistory({
      project_key: projectKey,
      entity_type: 'event',
      entity_id: event.id,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe('update');
    expect(rows[1].action).toBe('create');
    expect(rows.every((r) => r.entity_id === event.id)).toBe(true);
  });

  it('rejects an unknown entity_type', async () => {
    await expect(
      getHistory({ project_key: projectKey, entity_type: 'not_a_kind', entity_id: 'x' })
    ).rejects.toThrow(McpToolError);
  });

  it('rejects a blank entity_id', async () => {
    await expect(
      getHistory({ project_key: projectKey, entity_type: 'event', entity_id: '' })
    ).rejects.toThrow(McpToolError);
  });
});
