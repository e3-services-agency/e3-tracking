/**
 * UseCase DAL tests (T-1-07): CRUD, code auto-generation/uniqueness, enum validation, and the
 * event editor's read-only "use cases referencing this event" list.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as UseCaseDAL from './use-case.dal';
import * as RequirementDAL from './requirement.dal';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

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

describe('use-case.dal', () => {
  it('creates a use case with an auto-generated UC-01 code, lists, updates and soft-deletes it', () => {
    const a = UseCaseDAL.createUseCase(projectId, { name: 'Welcome flow', type: 'marketing' });
    expect(a.code).toBe('UC-01');
    const b = UseCaseDAL.createUseCase(projectId, { name: 'Order confirmation', type: 'transactional' });
    expect(b.code).toBe('UC-02');

    expect(UseCaseDAL.listUseCases(projectId).map((u) => u.id)).toEqual([a.id, b.id]);

    const updated = UseCaseDAL.updateUseCase(projectId, a.id, { status: 'approved', narrative: 'Sends a welcome email.' });
    expect(updated.status).toBe('approved');
    expect(updated.narrative).toBe('Sends a welcome email.');
    // T-2-11 / D-32: a manual PATCH is an edit, not a regeneration -- it records narrative_edited_at.
    expect(updated.narrative_edited_at).not.toBeNull();
    expect(updated.narrative_generated_at).toBeNull();

    UseCaseDAL.deleteUseCase(projectId, a.id);
    expect(() => UseCaseDAL.getUseCaseOrThrow(projectId, a.id)).toThrow(NotFoundError);
    expect(UseCaseDAL.listUseCases(projectId).map((u) => u.id)).toEqual([b.id]);
  });

  it('rejects a blank name', () => {
    expect(() => UseCaseDAL.createUseCase(projectId, { name: '  ' })).toThrow(ValidationError);
  });

  it('rejects an unknown type, status or priority', () => {
    expect(() => UseCaseDAL.createUseCase(projectId, { name: 'X', type: 'bogus' })).toThrow(ValidationError);
    expect(() => UseCaseDAL.createUseCase(projectId, { name: 'X', status: 'bogus' })).toThrow(ValidationError);
    expect(() => UseCaseDAL.createUseCase(projectId, { name: 'X', priority: 'bogus' })).toThrow(ValidationError);
  });

  it('enforces a unique code per project (409 CONFLICT)', () => {
    UseCaseDAL.createUseCase(projectId, { name: 'A', code: 'UC-01' });
    expect(() => UseCaseDAL.createUseCase(projectId, { name: 'B', code: 'UC-01' })).toThrow(ConflictError);
  });

  it('continues the code sequence after a manually-coded use case, skipping gaps only when they collide', () => {
    UseCaseDAL.createUseCase(projectId, { name: 'A', code: 'UC-05' });
    const next = UseCaseDAL.createUseCase(projectId, { name: 'B' });
    expect(next.code).toBe('UC-06');
  });

  it('lists use cases referencing an event directly and via one of its variants', () => {
    const otherEvent = EventDAL.createEvent(projectId, { name: 'other_event' }).id;
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
    const actionProperty = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, event, { property_id: actionProperty, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, event, {
      conditions: [{ property_id: actionProperty, operator: 'equals', values: ['add'] }],
    }).id;

    const directUseCase = UseCaseDAL.createUseCase(projectId, { name: 'Direct' });
    RequirementDAL.replaceRequirements(projectId, directUseCase.id, [
      { target_kind: 'event', event_id: event, level: 'R' },
    ]);

    const variantUseCase = UseCaseDAL.createUseCase(projectId, { name: 'Via variant' });
    RequirementDAL.replaceRequirements(projectId, variantUseCase.id, [
      { target_kind: 'variant', variant_id: variant, level: 'R' },
    ]);

    const unrelatedUseCase = UseCaseDAL.createUseCase(projectId, { name: 'Unrelated' });
    RequirementDAL.replaceRequirements(projectId, unrelatedUseCase.id, [
      { target_kind: 'event', event_id: otherEvent, level: 'O' },
    ]);

    const referencing = UseCaseDAL.listUseCasesReferencingEvent(projectId, event).map((u) => u.id);
    expect(referencing).toContain(directUseCase.id);
    expect(referencing).toContain(variantUseCase.id);
    expect(referencing).not.toContain(unrelatedUseCase.id);
  });

  it('normalises a code to trimmed upper case on create and update (fix round LOW 7)', () => {
    const a = UseCaseDAL.createUseCase(projectId, { name: 'A', code: '  uc-01 ' });
    expect(a.code).toBe('UC-01');
    // A second use case cannot reuse the same code under a different casing/whitespace.
    expect(() => UseCaseDAL.createUseCase(projectId, { name: 'B', code: 'UC-01' })).toThrow(ConflictError);

    const b = UseCaseDAL.createUseCase(projectId, { name: 'B', code: 'UC-02' });
    const updated = UseCaseDAL.updateUseCase(projectId, b.id, { code: ' uc-03 ' });
    expect(updated.code).toBe('UC-03');
  });

  it('allows a soft-deleted use case\'s code to be reused (fix round WARNING 4, 0007 migration)', () => {
    const a = UseCaseDAL.createUseCase(projectId, { name: 'A', code: 'UC-77' });
    UseCaseDAL.deleteUseCase(projectId, a.id);
    // The old UNIQUE(project_id, code) inline constraint applied to soft-deleted rows too; this
    // used to throw ConflictError even though no live use case holds "UC-77" any more.
    const b = UseCaseDAL.createUseCase(projectId, { name: 'B', code: 'UC-77' });
    expect(b.code).toBe('UC-77');
    expect(UseCaseDAL.listUseCases(projectId).map((u) => u.id)).toEqual([b.id]);
  });

  it('PATCH with an unknown template_id is 404, not a raw FK 500 (fix round LOW 5)', () => {
    const a = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    expect(() => UseCaseDAL.updateUseCase(projectId, a.id, { template_id: 'does-not-exist' })).toThrow(
      NotFoundError
    );
    // The failed PATCH must not have partially applied.
    expect(UseCaseDAL.getUseCaseOrThrow(projectId, a.id).template_id).toBeNull();
  });

  it('regenerateUseCaseNarrative sets narrative_generated_at and clears a prior manual edit (T-2-11, D-32)', () => {
    const a = UseCaseDAL.createUseCase(projectId, { name: 'A' });
    const edited = UseCaseDAL.updateUseCase(projectId, a.id, { narrative: 'Hand-written text.' });
    expect(edited.narrative_edited_at).not.toBeNull();

    const regenerated = UseCaseDAL.regenerateUseCaseNarrative(projectId, a.id, 'Generated text.');
    expect(regenerated.narrative).toBe('Generated text.');
    expect(regenerated.narrative_generated_at).not.toBeNull();
    expect(regenerated.narrative_edited_at).toBeNull();
  });
});
