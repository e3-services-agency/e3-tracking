/**
 * `Project.naming_convention` (D-65, T-4-22): default, update, validation, and the comparison-1
 * `naming_violation` finding it drives through `runComparison`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as FindingDAL from './finding.dal';
import { runComparison } from '../services/comparison.service';
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

describe('project.dal: naming_convention', () => {
  it('defaults to snake_case, updates, and rejects an unknown value', () => {
    expect(ProjectDAL.getProjectOrThrow(projectId).naming_convention).toBe('snake_case');
    expect(ProjectDAL.updateProject(projectId, { naming_convention: 'camel_case' }).naming_convention).toBe('camel_case');
    expect(() => ProjectDAL.updateProject(projectId, { naming_convention: 'PascalCase' })).toThrow(ValidationError);
    expect(() => ProjectDAL.updateProject(projectId, { naming_convention: 7 })).toThrow(ValidationError);
    expect(ProjectDAL.getProjectOrThrow(projectId).naming_convention).toBe('camel_case');
  });
});

describe('runComparison: naming_violation', () => {
  function seed() {
    const ev = EventDAL.createEvent(projectId, { name: 'orderPlaced', class: 'custom' });
    EventDAL.createEvent(projectId, { name: 'sessionStart', class: 'sdk' });
    const bad = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'orderTotal', data_type: 'number' });
    const ok = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'order_id', data_type: 'string' });
    EventDAL.attachPropertyToEvent(projectId, ev.id, { property_id: bad.id, role: 'normal' });
    EventDAL.attachPropertyToEvent(projectId, ev.id, { property_id: ok.id, role: 'normal' });
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'loyalty-tier', data_type: 'string' });
    PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'first_name', data_type: 'string' });
    return { ev, bad };
  }
  const open = () => FindingDAL.listFindings(projectId, { comparison: 'definition_vs_mapping', status: 'open' }).filter((f) => f.kind === 'naming_violation');

  it('flags nonconforming custom names, skips system items, and resolves when the convention changes', () => {
    seed();
    runComparison(projectId);
    const messages = open().map((f) => f.message).sort();
    expect(messages).toHaveLength(3);
    expect(messages.join('\n')).toContain('Event "orderPlaced"');
    expect(messages.join('\n')).toContain('Property "orderTotal"');
    expect(messages.join('\n')).toContain('Customer property "loyalty-tier"');
    expect(open().every((f) => f.severity === 'warning')).toBe(true);

    ProjectDAL.updateProject(projectId, { naming_convention: 'camel_case' });
    runComparison(projectId);
    // camelCase: orderPlaced/orderTotal conform; order_id and loyalty-tier do not.
    expect(open().map((f) => f.message).join('\n')).toContain('"order_id"');
    expect(open()).toHaveLength(2);
  });
});
