/**
 * Comment DAL tests (D-49, T-4-02): create on each entity type, 404 for an unknown entity id,
 * resolve toggle, delete, list filters.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as UseCaseDAL from './use-case.dal';
import * as RequirementDAL from './requirement.dal';
import * as CommentDAL from './comment.dal';
import { resolveCommentEntityLabel } from '../services/comments.service';
import { NotFoundError, ValidationError } from '../errors';

let projectId: string;
let eventId: string;
let propertyId: string;
let useCaseId: string;
let requirementId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
  propertyId = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' }).id;
  useCaseId = UseCaseDAL.createUseCase(projectId, { name: 'Abandoned cart' }).id;
  const [req] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
    { target_kind: 'event', event_id: eventId, level: 'R' },
  ]);
  requirementId = req.id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('comment.dal: createComment', () => {
  it('creates a comment on each supported entity type', () => {
    const onEvent = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'Looks good.',
    });
    expect(onEvent.entity_type).toBe('event');
    expect(onEvent.via_share).toBe(false);

    const onProperty = CommentDAL.createComment(projectId, {
      entity_type: 'property',
      entity_id: propertyId,
      author_name: 'Jan',
      body: 'What format is this?',
    });
    expect(onProperty.entity_type).toBe('property');

    const onUseCase = CommentDAL.createComment(projectId, {
      entity_type: 'use_case',
      entity_id: useCaseId,
      author_name: 'Jan',
      body: 'Ready for QA.',
    });
    expect(onUseCase.entity_type).toBe('use_case');

    const onRequirement = CommentDAL.createComment(projectId, {
      entity_type: 'requirement',
      entity_id: requirementId,
      author_name: 'Jan',
      body: 'Need the mapping for this.',
    });
    expect(onRequirement.entity_type).toBe('requirement');
  });

  it('404s for an unknown entity id', () => {
    expect(() =>
      CommentDAL.createComment(projectId, {
        entity_type: 'event',
        entity_id: 'bogus-id',
        author_name: 'Jan',
        body: 'Hello',
      })
    ).toThrow(NotFoundError);
  });

  it('rejects an unknown entity_type', () => {
    expect(() =>
      CommentDAL.createComment(projectId, {
        entity_type: 'bogus',
        entity_id: eventId,
        author_name: 'Jan',
        body: 'Hello',
      })
    ).toThrow(ValidationError);
  });

  it('rejects a blank author_name or body', () => {
    expect(() =>
      CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: '', body: 'Hi' })
    ).toThrow(ValidationError);
    expect(() =>
      CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: '' })
    ).toThrow(ValidationError);
  });

  it('accepts a body of exactly 10000 characters, stored as-is', () => {
    const body = '**bold** <b>x</b> ' + 'y'.repeat(9982);
    const c = CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body });
    expect(c.body).toBe(body);
  });

  it('rejects a body over 10000 characters', () => {
    expect(() =>
      CommentDAL.createComment(projectId, {
        entity_type: 'event',
        entity_id: eventId,
        author_name: 'Jan',
        body: 'x'.repeat(10001),
      })
    ).toThrow(ValidationError);
    expect(
      CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'x'.repeat(10000) }).body.length
    ).toBe(10000);
  });
});

describe('comment.dal: listComments filters', () => {
  it('filters by entity_type, entity_id and resolved', () => {
    const a = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'First',
    });
    CommentDAL.createComment(projectId, {
      entity_type: 'property',
      entity_id: propertyId,
      author_name: 'Jan',
      body: 'Second',
    });
    CommentDAL.setCommentResolved(projectId, a.id, true, 'Jan');

    expect(CommentDAL.listComments(projectId, { entity_type: 'event' })).toHaveLength(1);
    expect(CommentDAL.listComments(projectId, { entity_id: eventId })).toHaveLength(1);
    expect(CommentDAL.listComments(projectId, { resolved: true })).toHaveLength(1);
    expect(CommentDAL.listComments(projectId, { resolved: false })).toHaveLength(1);
    expect(CommentDAL.listComments(projectId)).toHaveLength(2);
  });
});

describe('comment.dal: resolve and delete', () => {
  it('toggles resolved on and off', () => {
    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'Hello',
    });
    expect(comment.resolved_at).toBeNull();

    const resolved = CommentDAL.setCommentResolved(projectId, comment.id, true, 'Jan');
    expect(resolved.resolved_at).not.toBeNull();
    expect(resolved.resolved_by).toBe('Jan');

    const reopened = CommentDAL.setCommentResolved(projectId, comment.id, false, 'Jan');
    expect(reopened.resolved_at).toBeNull();
    expect(reopened.resolved_by).toBeNull();
  });

  it('deletes a comment', () => {
    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'Hello',
    });
    CommentDAL.deleteComment(projectId, comment.id);
    expect(() => CommentDAL.getCommentOrThrow(projectId, comment.id)).toThrow(NotFoundError);
  });

  it('404s resolving or deleting an unknown comment', () => {
    expect(() => CommentDAL.setCommentResolved(projectId, 'bogus', true, 'Jan')).toThrow(NotFoundError);
    expect(() => CommentDAL.deleteComment(projectId, 'bogus')).toThrow(NotFoundError);
  });
});

describe('comment.dal: comments on a requirement whose target is replaced', () => {
  it('survives a plain reorder (id kept) but orphans on a genuine target swap', () => {
    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'requirement',
      entity_id: requirementId,
      author_name: 'Jan',
      body: 'Please confirm this is required.',
    });

    // Reorder/edit with the same target: the requirement keeps its id (T-4-02), so the comment's
    // entity_id still resolves.
    const [stillThere] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'O' },
    ]);
    expect(stillThere.id).toBe(requirementId);
    expect(CommentDAL.listComments(projectId, { entity_id: comment.entity_id })).toHaveLength(1);

    // Swapping to a different target entirely deletes the old row (new id for the new target); the
    // comment's entity_id now points nowhere in the requirements table.
    const property2 = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'phone', data_type: 'string' }).id;
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: property2, level: 'R' },
    ]);
    // The comment row itself is untouched (not a foreign key) -- it just no longer resolves to a
    // live requirement; comments.service.ts is responsible for the "removed requirement" fallback.
    expect(CommentDAL.listComments(projectId, { entity_id: comment.entity_id })).toHaveLength(1);
  });

  it('a gap row (target nulled by markRequirementsGap*) keeps its id and its comment across a reorder (fix round WARNING 1)', () => {
    const eventPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: eventPropertyId, role: 'normal' });

    // Two requirements on this use case: the event_property one (which will become a gap row) and
    // the pre-existing `event` one from beforeEach, so there is something real to reorder against.
    const [firstEventProperty] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event_property', event_id: eventId, property_id: eventPropertyId, level: 'R' },
      { target_kind: 'event', event_id: eventId, level: 'O' },
    ]);
    const eventPropertyReqId = firstEventProperty.id;

    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'requirement',
      entity_id: eventPropertyReqId,
      author_name: 'Jan',
      body: 'Confirm this stays required.',
    });

    // Detaching the property nulls property_id and forces status='gap' on the event_property row
    // (its id is unchanged by this step -- markRequirementsGap* updates in place).
    EventDAL.detachPropertyFromEvent(projectId, eventId, eventPropertyId);
    const gapRow = RequirementDAL.getRequirementInProject(projectId, eventPropertyReqId);
    expect(gapRow?.status).toBe('gap');
    expect(gapRow?.property_id).toBeNull();

    // Reorder (same two rows, reversed): before the fix, the gap row's ambiguous key was skipped
    // entirely, deleting it and inserting a fresh id (silently orphaning the comment). It must now
    // keep its id, and comments.service.ts's label must still resolve through it (not the "removed
    // requirement" fallback).
    const reordered = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'O' },
      { target_kind: 'event_property', event_id: eventId, level: 'R', status: 'gap' },
    ]);
    const reorderedGapRow = reordered.find((r) => r.target_kind === 'event_property')!;
    expect(reorderedGapRow.id).toBe(eventPropertyReqId);

    expect(CommentDAL.listComments(projectId, { entity_id: comment.entity_id })).toHaveLength(1);
    // Label still resolves through the live (gap) row -- "cart_update.(removed)" -- not the
    // "removed requirement" fallback a lost id would produce.
    expect(resolveCommentEntityLabel(projectId, comment)).toBe('cart_update.(removed)');
  });
});
