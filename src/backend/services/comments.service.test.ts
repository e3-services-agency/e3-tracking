/**
 * comments.service tests (D-49, T-4-02): entity_label resolution for each entity type, including
 * the "removed requirement" fallback (via change_log's parent_entity_id) once a requirement's
 * target has genuinely been swapped out from under a comment.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as UseCaseDAL from '../dal/use-case.dal';
import * as RequirementDAL from '../dal/requirement.dal';
import * as CommentDAL from '../dal/comment.dal';
import { resolveCommentEntityLabel, withEntityLabels } from './comments.service';

let projectId: string;
let eventId: string;
let customerPropertyId: string;
let useCaseId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' }).id;
  customerPropertyId = PropertyDAL.createProperty(projectId, { scope: 'customer', name: 'email', data_type: 'string' }).id;
  useCaseId = UseCaseDAL.createUseCase(projectId, { name: 'Abandoned cart', code: 'UC-01' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('comments.service: resolveCommentEntityLabel', () => {
  it('resolves event, property and use_case labels by current name', () => {
    const onEvent = CommentDAL.createComment(projectId, {
      entity_type: 'event',
      entity_id: eventId,
      author_name: 'Jan',
      body: 'x',
    });
    expect(resolveCommentEntityLabel(projectId, onEvent)).toBe('cart_update');

    const onProperty = CommentDAL.createComment(projectId, {
      entity_type: 'property',
      entity_id: customerPropertyId,
      author_name: 'Jan',
      body: 'x',
    });
    expect(resolveCommentEntityLabel(projectId, onProperty)).toBe('email');

    const onUseCase = CommentDAL.createComment(projectId, {
      entity_type: 'use_case',
      entity_id: useCaseId,
      author_name: 'Jan',
      body: 'x',
    });
    expect(resolveCommentEntityLabel(projectId, onUseCase)).toBe('UC-01 Abandoned cart');
  });

  it('resolves a live requirement to its target label via buildTargetLabelResolver', () => {
    const [req] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
    ]);
    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'requirement',
      entity_id: req.id,
      author_name: 'Jan',
      body: 'x',
    });
    expect(resolveCommentEntityLabel(projectId, comment)).toBe('cart_update');
  });

  it('falls back to "removed requirement (<use case>)" once the target is genuinely swapped out', () => {
    const [req] = RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'event', event_id: eventId, level: 'R' },
    ]);
    const comment = CommentDAL.createComment(projectId, {
      entity_type: 'requirement',
      entity_id: req.id,
      author_name: 'Jan',
      body: 'x',
    });

    // Swap to an unrelated target: the old row is genuinely deleted (new id for the new target).
    RequirementDAL.replaceRequirements(projectId, useCaseId, [
      { target_kind: 'customer_property', property_id: customerPropertyId, level: 'R' },
    ]);

    expect(resolveCommentEntityLabel(projectId, comment)).toBe('removed requirement (UC-01)');
  });

  it('withEntityLabels attaches entity_label to every row in one call', () => {
    CommentDAL.createComment(projectId, { entity_type: 'event', entity_id: eventId, author_name: 'Jan', body: 'x' });
    CommentDAL.createComment(projectId, { entity_type: 'property', entity_id: customerPropertyId, author_name: 'Jan', body: 'y' });
    const rows = withEntityLabels(projectId, CommentDAL.listComments(projectId));
    expect(rows.map((r) => r.entity_label).sort()).toEqual(['cart_update', 'email']);
  });
});
