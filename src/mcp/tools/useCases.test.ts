/**
 * MCP `list_use_case_templates`/`instantiate_use_case_template` handler tests (T-3-10, D-55).
 * Called directly against `:memory:`, same pattern as `tools.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../backend/db';
import * as ClientDAL from '../../backend/dal/client.dal';
import * as ProjectDAL from '../../backend/dal/project.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as UseCaseTemplateDAL from '../../backend/dal/use-case-template.dal';
import * as StandardEventMappingDAL from '../../backend/dal/standard-event-mapping.dal';
import { McpToolError } from '../errors';
import { listUseCaseTemplates, instantiateUseCaseTemplate } from './useCases';

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

describe('list_use_case_templates', () => {
  it('lists the global library with requirement counts', async () => {
    UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-MCP',
      name: 'MCP test template',
      type: 'marketing',
      default_requirements_json: [{ target_kind: 'customer_property', property_name: 'email', level: 'R' }],
    });
    const rows = await listUseCaseTemplates();
    expect(rows).toEqual([{ code: 'UC-MCP', name: 'MCP test template', type: 'marketing', requirement_count: 1 }]);
  });
});

describe('instantiate_use_case_template', () => {
  it('TEMPLATE_NOT_FOUND for an unknown template_code', async () => {
    let caught: unknown;
    try {
      await instantiateUseCaseTemplate({ project_key: projectKey, template_code: 'NOPE' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(McpToolError);
    expect((caught as McpToolError).code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('dry_run returns the resolve preview without creating a use case', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 'transactions', class: 'custom' }).id;
    const propertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'order_total',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyId, role: 'normal' });
    UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-MCP2',
      name: 'Dry run test',
      type: 'transactional',
      default_requirements_json: [
        { target_kind: 'event_property', standard_event: 'purchase', property_name: 'total_price', level: 'R' },
      ],
    });

    const preview = (await instantiateUseCaseTemplate({
      project_key: projectKey,
      template_code: 'UC-MCP2',
      dry_run: true,
    })) as { resolved: unknown[]; unresolved: { candidates: { id: string; name: string }[] }[] };

    expect(preview.resolved).toEqual([]);
    expect(preview.unresolved).toHaveLength(1);
    expect(preview.unresolved[0].candidates.some((c) => c.name === 'transactions')).toBe(true);
    expect(UseCaseTemplateDAL.listUseCaseTemplates().length).toBe(1); // no side effect
  });

  it('applies with mappings, creating the standard event mapping and resolving the requirement', async () => {
    const eventId = EventDAL.createEvent(projectId, { name: 'transactions', class: 'custom' }).id;
    const propertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'order_total',
      data_type: 'number',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: propertyId, role: 'normal' });
    UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-MCP3',
      name: 'Apply test',
      type: 'transactional',
      default_requirements_json: [
        { target_kind: 'event_property', standard_event: 'purchase', property_name: 'total_price', level: 'R' },
      ],
    });

    const result = (await instantiateUseCaseTemplate({
      project_key: projectKey,
      template_code: 'UC-MCP3',
      mappings: [{ index: 0, event_id: eventId, property_id: propertyId }],
    })) as { unresolved_count: number };

    expect(result.unresolved_count).toBe(0);
    const mapping = StandardEventMappingDAL.getStandardEventMappingByKey(projectId, 'purchase')!;
    expect(mapping.event_id).toBe(eventId);
    expect(mapping.field_map_json.total_price).toBe(propertyId);
  });
});
