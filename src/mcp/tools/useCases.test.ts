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
import * as UseCaseDAL from '../../backend/dal/use-case.dal';
import * as StandardEventMappingDAL from '../../backend/dal/standard-event-mapping.dal';
import { McpToolError } from '../errors';
import { listUseCaseTemplates, instantiateUseCaseTemplate, listUseCases, getUseCase } from './useCases';

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
  it('fix round LOW 6 (2026-09-28): template_code lookup is case-insensitive', async () => {
    UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-CASE', name: 'Case test', type: 'marketing' });
    const preview = (await instantiateUseCaseTemplate({
      project_key: projectKey,
      template_code: 'uc-case',
      dry_run: true,
    })) as { unresolved: unknown[] };
    expect(preview.unresolved).toEqual([]);
  });

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

describe('D-59 fix round ERROR 2: internal_notes/internal_url never leak through MCP', () => {
  const SECRET_NOTE = 'SECRET-TPL-NOTE';
  const SECRET_URL = 'https://internal.example.com/SECRET-TPL-URL';

  it('list_use_cases, get_use_case and instantiate_use_case_template all strip internal_notes/internal_url', async () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-SECRET',
      name: 'Secret template',
      type: 'marketing',
      internal_notes: SECRET_NOTE,
      internal_url: SECRET_URL,
    });

    const instantiateResult = (await instantiateUseCaseTemplate({
      project_key: projectKey,
      template_code: 'UC-SECRET',
    })) as Record<string, unknown>;
    expect(JSON.stringify(instantiateResult)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(instantiateResult)).not.toContain(SECRET_URL);

    // The template's own internal fields copy onto the use case row (DAL behaviour, not an MCP
    // leak by themselves); plant a second secret directly on the use case to prove list_use_cases
    // and get_use_case also strip it.
    const useCase = UseCaseDAL.listUseCases(projectId)[0];
    UseCaseDAL.updateUseCase(projectId, useCase.id, {
      name: useCase.name,
      internal_notes: 'SECRET-UC-NOTE',
      internal_url: 'https://internal.example.com/SECRET-UC-URL',
    });

    const list = await listUseCases({ project_key: projectKey });
    expect(JSON.stringify(list)).not.toContain('SECRET-UC-NOTE');
    expect(JSON.stringify(list)).not.toContain('SECRET-UC-URL');

    const got = await getUseCase({ project_key: projectKey, use_case: useCase.code! });
    expect(JSON.stringify(got)).not.toContain('SECRET-UC-NOTE');
    expect(JSON.stringify(got)).not.toContain('SECRET-UC-URL');
    void template;
  });
});
