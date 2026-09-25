/**
 * IdentityRule and ConsentCategory DAL tests (T-1-06): uniqueness, reorder, ON DELETE SET NULL
 * for `identity_rules.source_id`/`identity_rules.trigger_event_id`, and `standard_key`
 * validation against the bloomreach.ts seed plus project additions (D-26).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as SourceDAL from './source.dal';
import * as EventDAL from './event.dal';
import * as IdentityRuleDAL from './identity-rule.dal';
import * as ConsentCategoryDAL from './consent-category.dal';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../errors';

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

describe('identity-rule.dal', () => {
  it('creates, lists in sort_order, updates and deletes a rule', () => {
    const a = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration email',
    });
    const b = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'cookie',
      identity_type: 'soft',
      name: 'Anonymous cookie',
    });
    expect(IdentityRuleDAL.listIdentityRules(projectId).map((r) => r.id)).toEqual([a.id, b.id]);

    const updated = IdentityRuleDAL.updateIdentityRule(projectId, a.id, { owner: 'Jane' });
    expect(updated.owner).toBe('Jane');

    IdentityRuleDAL.deleteIdentityRule(projectId, a.id);
    expect(() => IdentityRuleDAL.getIdentityRuleOrThrow(projectId, a.id)).toThrow(NotFoundError);
  });

  it('rejects an unknown identity_type with a ValidationError', () => {
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, {
        identifier_name: 'registered',
        identity_type: 'weak',
        name: 'Bad rule',
      })
    ).toThrow(ValidationError);
  });

  it('rejects a blank name or identifier_name', () => {
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'registered', identity_type: 'hard', name: '  ' })
    ).toThrow(ValidationError);
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: '  ', identity_type: 'hard', name: 'Rule' })
    ).toThrow(ValidationError);
  });

  it('rejects a trigger_event_id or source_id from another project', () => {
    const otherClient = ClientDAL.createClient({ key: 'other', name: 'Other' });
    const otherProjectId = ProjectDAL.createProject({ client_id: otherClient.id, key: 'other-p', name: 'Other' }).id;
    const otherEvent = EventDAL.createEvent(otherProjectId, { name: 'other_event' });
    const otherSource = SourceDAL.createSource(otherProjectId, { name: 'Other source' });

    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, {
        identifier_name: 'registered',
        identity_type: 'hard',
        name: 'Rule',
        trigger_event_id: otherEvent.id,
      })
    ).toThrow(BadRequestError);
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, {
        identifier_name: 'registered',
        identity_type: 'hard',
        name: 'Rule',
        source_id: otherSource.id,
      })
    ).toThrow(BadRequestError);
  });

  it('reorders rules; sort_order becomes the index in the given order', () => {
    const a = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'a', identity_type: 'hard', name: 'A' });
    const b = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'b', identity_type: 'hard', name: 'B' });
    const c = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'c', identity_type: 'hard', name: 'C' });
    expect(IdentityRuleDAL.listIdentityRules(projectId).map((r) => r.id)).toEqual([a.id, b.id, c.id]);

    IdentityRuleDAL.reorderIdentityRules(projectId, [c.id, a.id, b.id]);
    expect(IdentityRuleDAL.listIdentityRules(projectId).map((r) => r.id)).toEqual([c.id, a.id, b.id]);
  });

  it('rejects a reorder whose ids do not match the project’s full rule set', () => {
    const a = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'a', identity_type: 'hard', name: 'A' });
    IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'b', identity_type: 'hard', name: 'B' });
    expect(() => IdentityRuleDAL.reorderIdentityRules(projectId, [a.id])).toThrow(BadRequestError);
  });

  it('clears trigger_event_id and source_id to NULL when the referenced event/source is deleted (0005 migration, T-1-06 delta)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'account_created' });
    const source = SourceDAL.createSource(projectId, { name: 'Website' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration email',
      trigger_event_id: event.id,
      source_id: source.id,
    });
    expect(rule.trigger_event_id).toBe(event.id);
    expect(rule.source_id).toBe(source.id);

    // Hard-delete the event and source rows directly (event/source DAL soft-deletes/guards deletes;
    // this test exercises the FK's ON DELETE action itself, which is what the 0005 migration changed).
    getDb().prepare('DELETE FROM events WHERE id = ?').run(event.id);
    getDb().prepare('DELETE FROM sources WHERE id = ?').run(source.id);

    const reloaded = IdentityRuleDAL.getIdentityRuleOrThrow(projectId, rule.id);
    expect(reloaded.trigger_event_id).toBeNull();
    expect(reloaded.source_id).toBeNull();
  });

  it('nulls trigger_event_id when the event is soft-deleted (T-1-06 integration fix, reviewer WARNING)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'account_created' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration email',
      trigger_event_id: event.id,
    });
    expect(rule.trigger_event_id).toBe(event.id);

    EventDAL.deleteEvent(projectId, event.id); // soft delete (sets deleted_at), not a hard DELETE

    const reloaded = IdentityRuleDAL.getIdentityRuleOrThrow(projectId, rule.id);
    expect(reloaded.trigger_event_id).toBeNull();

    // The stale-reference guard is now moot in the normal flow, but the defensive fallback still
    // lets a save that doesn't touch trigger_event_id go through even if it were still stale.
    const updated = IdentityRuleDAL.updateIdentityRule(projectId, rule.id, { owner: 'Jane' });
    expect(updated.owner).toBe('Jane');
  });

  it('does not re-validate an unchanged trigger_event_id even if it pointed at a since soft-deleted event (defensive)', () => {
    const db = getDb();
    const event = EventDAL.createEvent(projectId, { name: 'account_created' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Registration email',
      trigger_event_id: event.id,
    });
    // Simulate a stale reference slipping through some other path: soft-delete the event directly
    // without going through EventDAL.deleteEvent, so trigger_event_id is left pointing at it.
    db.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), event.id);

    // A PATCH that repeats the same trigger_event_id (unchanged) must not fail even though the
    // event is now soft-deleted.
    const updated = IdentityRuleDAL.updateIdentityRule(projectId, rule.id, {
      trigger_event_id: event.id,
      owner: 'Jane',
    });
    expect(updated.owner).toBe('Jane');
    expect(updated.trigger_event_id).toBe(event.id);

    // But changing it to a *different* soft-deleted (or otherwise invalid) event still fails.
    const other = EventDAL.createEvent(projectId, { name: 'other_event' });
    db.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), other.id);
    expect(() =>
      IdentityRuleDAL.updateIdentityRule(projectId, rule.id, { trigger_event_id: other.id })
    ).toThrow(BadRequestError);
  });

  it('validates priority and status against enums.ts (LOW 3)', () => {
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, {
        identifier_name: 'registered',
        identity_type: 'hard',
        name: 'Rule',
        priority: 'urgent',
      })
    ).toThrow(ValidationError);
    expect(() =>
      IdentityRuleDAL.createIdentityRule(projectId, {
        identifier_name: 'registered',
        identity_type: 'hard',
        name: 'Rule',
        status: 'done',
      })
    ).toThrow(ValidationError);
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'registered',
      identity_type: 'hard',
      name: 'Rule',
      priority: 'high',
      status: 'planned',
    });
    expect(rule.priority).toBe('high');
    expect(rule.status).toBe('planned');
    expect(() => IdentityRuleDAL.updateIdentityRule(projectId, rule.id, { priority: 'urgent' })).toThrow(
      ValidationError
    );
    expect(() => IdentityRuleDAL.updateIdentityRule(projectId, rule.id, { status: 'done' })).toThrow(
      ValidationError
    );
  });
});

describe('consent-category.dal', () => {
  it('creates, lists in sort_order, updates and deletes a category', () => {
    const a = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'brand_consent', standard_key: 'newsletter' });
    const b = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'sms_consent', standard_key: 'sms' });
    expect(ConsentCategoryDAL.listConsentCategories(projectId).map((c) => c.id)).toEqual([a.id, b.id]);

    const updated = ConsentCategoryDAL.updateConsentCategory(projectId, a.id, { description: 'Marketing emails' });
    expect(updated.description).toBe('Marketing emails');

    ConsentCategoryDAL.deleteConsentCategory(projectId, a.id);
    expect(() => ConsentCategoryDAL.getConsentCategoryOrThrow(projectId, a.id)).toThrow(NotFoundError);
  });

  it('enforces a unique name per project (409 CONFLICT)', () => {
    ConsentCategoryDAL.createConsentCategory(projectId, { name: 'brand_consent' });
    expect(() => ConsentCategoryDAL.createConsentCategory(projectId, { name: 'brand_consent' })).toThrow(
      ConflictError
    );
  });

  it('accepts a seed standard_key and rejects an unknown one', () => {
    expect(
      ConsentCategoryDAL.createConsentCategory(projectId, { name: 'brand_consent', standard_key: 'newsletter' })
        .standard_key
    ).toBe('newsletter');
    expect(() =>
      ConsentCategoryDAL.createConsentCategory(projectId, { name: 'other', standard_key: 'not_a_real_key' })
    ).toThrow(ValidationError);
  });

  it('accepts a standard_key from the project’s consent_key_additions_json (D-26)', () => {
    ProjectDAL.updateProject(projectId, { consent_key_additions_json: ['vip_club'] });
    const category = ConsentCategoryDAL.createConsentCategory(projectId, {
      name: 'vip_consent',
      standard_key: 'vip_club',
    });
    expect(category.standard_key).toBe('vip_club');
    // Still rejects a key that is neither the seed nor this project's additions.
    expect(() =>
      ConsentCategoryDAL.createConsentCategory(projectId, { name: 'other', standard_key: 'other_project_key' })
    ).toThrow(ValidationError);
  });

  it('trims standard_key before validating (LOW 5)', () => {
    const category = ConsentCategoryDAL.createConsentCategory(projectId, {
      name: 'brand_consent',
      standard_key: '  newsletter  ',
    });
    expect(category.standard_key).toBe('newsletter');
  });

  it('validates status against enums.ts (LOW 3)', () => {
    expect(() =>
      ConsentCategoryDAL.createConsentCategory(projectId, { name: 'brand_consent', status: 'done' })
    ).toThrow(ValidationError);
    const category = ConsentCategoryDAL.createConsentCategory(projectId, {
      name: 'brand_consent',
      status: 'planned',
    });
    expect(category.status).toBe('planned');
    expect(() =>
      ConsentCategoryDAL.updateConsentCategory(projectId, category.id, { status: 'done' })
    ).toThrow(ValidationError);
  });

  it('reorders categories; sort_order becomes the index in the given order', () => {
    const a = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'A' });
    const b = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'B' });
    const c = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'C' });
    ConsentCategoryDAL.reorderConsentCategories(projectId, [c.id, a.id, b.id]);
    expect(ConsentCategoryDAL.listConsentCategories(projectId).map((cat) => cat.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('project.dal consent_key_additions_json', () => {
  it('normalizes, trims and de-duplicates the additions array', () => {
    const updated = ProjectDAL.updateProject(projectId, {
      consent_key_additions_json: [' vip_club ', 'vip_club', 'loyalty', ''],
    });
    expect(updated.consent_key_additions_json).toEqual(['vip_club', 'loyalty']);
  });

  it('rejects a non-array value', () => {
    expect(() =>
      ProjectDAL.updateProject(projectId, { consent_key_additions_json: 'vip_club' as unknown as string[] })
    ).toThrow(ValidationError);
  });
});
