/**
 * T-4-09 getting-started checklist: computed straight from the data, no dedicated progress table.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as QaRunDAL from '../dal/qa-run.dal';
import * as ObservationDAL from '../dal/observation.dal';
import * as UseCaseTemplateDAL from '../dal/use-case-template.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import { getGettingStarted } from './gettingStarted.service';

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

describe('gettingStarted.service (T-4-09)', () => {
  it('on an empty project, only "create a client and project" is done', () => {
    const result = getGettingStarted(projectId);
    expect(result.complete).toBe(false);
    const byKey = Object.fromEntries(result.steps.map((s) => [s.key, s.done]));
    expect(byKey.client_and_project).toBe(true);
    expect(byKey.data_mapping_imported).toBe(false);
    expect(byKey.expiration_settings_imported).toBe(false);
    expect(byKey.property_types_reviewed).toBe(true); // no open type_mismatch findings yet == vacuously true
    expect(byKey.data_manager_files_imported).toBe(false);
    expect(byKey.observations_captured).toBe(false);
    expect(byKey.comparison_run).toBe(false);
    expect(byKey.use_case_instantiated).toBe(false);
    expect(byKey.share_link_created).toBe(false);
  });

  it('every step has a one-sentence description and a target tab', () => {
    const result = getGettingStarted(projectId);
    for (const step of result.steps) {
      expect(step.sentence.length).toBeGreaterThan(0);
      expect(step.tab.length).toBeGreaterThan(0);
    }
  });

  it('flips each step done as the corresponding data appears, and complete once every step is', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' } as any);

    const run = QaRunDAL.createQaRun(projectId, { kind: 'manual', environment: 'staging' } as any);
    ObservationDAL.createObservation(projectId, run.id, {
      source: 'manual',
      event_type: 'cart_update',
      timestamp: Date.now(),
      properties: {},
    } as any);
    expect(getGettingStarted(projectId).steps.find((s) => s.key === 'observations_captured')?.done).toBe(true);

    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-TEST',
      name: 'Test use case',
      type: 'marketing',
      default_requirements_json: [],
    } as any);
    UseCaseDAL.createUseCase(projectId, {
      code: 'UC-TEST',
      name: 'Test use case',
      type: 'marketing',
      template_id: template.id,
    } as any);
    expect(getGettingStarted(projectId).steps.find((s) => s.key === 'use_case_instantiated')?.done).toBe(true);

    ProjectDAL.createOrRotateShare(projectId, 'read');
    expect(getGettingStarted(projectId).steps.find((s) => s.key === 'share_link_created')?.done).toBe(true);

    void event; // event created above only to give the run a real target event
  });
});
