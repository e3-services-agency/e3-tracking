/**
 * UseCaseTemplate DAL tests (T-1-07 acceptance: "`POST /use-cases/from-template/:id` implemented
 * against an empty table (tested with a unit-test template)"): global table, and
 * `instantiateUseCaseTemplate`'s resolution of each `default_requirements_json` entry, including
 * the unresolvable case (note + status `gap`, fix round ERROR 1 — was the out-of-enum literal
 * `ignored`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as RequirementDAL from './requirement.dal';
import * as UseCaseTemplateDAL from './use-case-template.dal';
import { NotFoundError, TemplateInUseError } from '../errors';
import { previewDataMapping, applyDataMapping } from '../services/dataMappingImport.service';
import { parseUseCaseLibrary } from '../../domain/import/useCaseLibrary';

const dataMappingFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json');
const dataMappingFixture = JSON.parse(fs.readFileSync(dataMappingFixturePath, 'utf-8'));
const libraryFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/use-case-library-sample.json');
const libraryFixture = JSON.parse(fs.readFileSync(libraryFixturePath, 'utf-8'));

let projectId: string;
let eventId: string;
let discriminatorPropertyId: string;
let normalPropertyId: string;
let customerPropertyId: string;
let variantId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update' }).id;
  discriminatorPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'action',
    data_type: 'string',
    allowed_values_json: [{ value: 'add' }, { value: 'remove' }],
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, {
    property_id: discriminatorPropertyId,
    role: 'discriminator',
  });
  normalPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'event',
    name: 'total_price',
    data_type: 'number',
  }).id;
  EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: normalPropertyId, role: 'normal' });
  customerPropertyId = PropertyDAL.createProperty(projectId, {
    scope: 'customer',
    name: 'email',
    data_type: 'string',
  }).id;
  variantId = VariantDAL.createVariant(projectId, eventId, {
    conditions: [{ property_id: discriminatorPropertyId, operator: 'equals', values: ['add'] }],
  }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('use-case-template.dal', () => {
  it('lists templates globally (not project-scoped)', () => {
    expect(UseCaseTemplateDAL.listUseCaseTemplates()).toEqual([]);
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T1',
      name: 'Cart abandonment',
      type: 'marketing',
    });
    expect(UseCaseTemplateDAL.listUseCaseTemplates().map((t) => t.id)).toEqual([template.id]);
  });

  it('404s for an unknown template id', () => {
    expect(() => UseCaseTemplateDAL.getUseCaseTemplateOrThrow('missing')).toThrow(NotFoundError);
  });

  it('instantiates a use case copying name/type/description and resolving every requirement kind', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T1',
      name: 'Cart abandonment recovery',
      type: 'marketing',
      description: 'Recovers abandoned carts by email.',
      default_requirements_json: [
        { target_kind: 'customer_property', property_name: 'email', level: 'R' },
        { target_kind: 'event', event_name: 'cart_update', level: 'R' },
        { target_kind: 'event_property', event_name: 'cart_update', property_name: 'total_price', level: 'O' },
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'action', value: 'add' },
          level: 'R',
        },
        {
          target_kind: 'variant_property',
          event_name: 'cart_update',
          property_name: 'total_price',
          condition: { property_name: 'action', value: 'add' },
          level: 'O',
        },
      ],
    });

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(useCase.name).toBe('Cart abandonment recovery');
    expect(useCase.type).toBe('marketing');
    expect(useCase.description).toBe('Recovers abandoned carts by email.');
    expect(useCase.template_id).toBe(template.id);

    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirements).toHaveLength(5);
    expect(requirements[0]).toMatchObject({ target_kind: 'customer_property', property_id: customerPropertyId });
    expect(requirements[1]).toMatchObject({ target_kind: 'event', event_id: eventId });
    expect(requirements[2]).toMatchObject({
      target_kind: 'event_property',
      event_id: eventId,
      property_id: normalPropertyId,
    });
    expect(requirements[3]).toMatchObject({ target_kind: 'variant', variant_id: variantId });
    expect(requirements[4]).toMatchObject({
      target_kind: 'variant_property',
      variant_id: variantId,
      property_id: normalPropertyId,
    });
    expect(requirements.every((r) => r.status !== 'gap')).toBe(true);

    // Fix round ERROR 2 acceptance: a fully-resolved instantiation is immediately re-saveable
    // unchanged through the normal PUT path.
    const resaved = RequirementDAL.replaceRequirements(
      projectId,
      useCase.id,
      requirements.map((r) => ({
        target_kind: r.target_kind,
        property_id: r.property_id,
        event_id: r.event_id,
        variant_id: r.variant_id,
        level: r.level,
        status: r.status,
        note: r.note,
      }))
    );
    expect(resaved).toHaveLength(5);
  });

  it('creates unresolvable requirements with a note and status "gap" instead of dropping them', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T2',
      name: 'Unresolvable template',
      type: 'transactional',
      default_requirements_json: [
        { target_kind: 'event', event_name: 'does_not_exist', level: 'R' },
        { target_kind: 'customer_property', property_name: 'does_not_exist', level: 'O' },
        {
          target_kind: 'event_property',
          event_name: 'cart_update',
          property_name: 'does_not_exist',
          level: 'R',
        },
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'action', value: 'no_such_value' },
          level: 'R',
        },
      ],
    });

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirements).toHaveLength(4);
    for (const req of requirements) {
      expect(req.status).toBe('gap');
      expect(req.property_id).toBeNull();
      expect(req.event_id).toBeNull();
      expect(req.variant_id).toBeNull();
      expect(req.note).toBeTruthy();
    }

    // Fix round ERROR 1 acceptance: the use case must be immediately re-saveable unchanged, not
    // rejected by `validateStatus`/`validateTarget` for the very rows the template itself produced.
    const resaved = RequirementDAL.replaceRequirements(
      projectId,
      useCase.id,
      requirements.map((r) => ({
        target_kind: r.target_kind,
        property_id: r.property_id,
        event_id: r.event_id,
        variant_id: r.variant_id,
        level: r.level,
        status: r.status,
        note: r.note,
      }))
    );
    expect(resaved.every((r) => r.status === 'gap')).toBe(true);
  });

  it('rolls back the whole instantiation if the template does not exist', () => {
    expect(() => UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, 'missing')).toThrow(NotFoundError);
    expect(getDb().prepare('SELECT COUNT(*) as c FROM use_cases WHERE project_id = ?').get(projectId)).toEqual({
      c: 0,
    });
  });

  it('rolls back a partially-inserted use case if a later requirement insert throws mid-transaction (fix round LOW 8)', () => {
    // Strengthened: the test above only proved atomicity for a failure *before* any write (an
    // unknown template id). This forces a real mid-transaction failure after the use case row and
    // the first requirement have already been written, and checks the whole thing is undone.
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T3',
      name: 'Two requirements',
      type: 'marketing',
      default_requirements_json: [
        { target_kind: 'event', event_name: 'cart_update', level: 'R' },
        { target_kind: 'customer_property', property_name: 'email', level: 'R' },
      ],
    });
    const original = RequirementDAL.insertResolvedRequirement;
    let calls = 0;
    const spy = vi
      .spyOn(RequirementDAL, 'insertResolvedRequirement')
      .mockImplementation((...args: Parameters<typeof RequirementDAL.insertResolvedRequirement>) => {
        calls += 1;
        // Let the first insert really happen (so there is something written to roll back), then
        // fail the second one to simulate a real mid-transaction error.
        if (calls === 1) return original(...args);
        throw new Error('simulated mid-transaction failure');
      });

    try {
      expect(() => UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id)).toThrow(
        'simulated mid-transaction failure'
      );
      expect(getDb().prepare('SELECT COUNT(*) as c FROM use_cases WHERE project_id = ?').get(projectId)).toEqual({
        c: 0,
      });
      expect(getDb().prepare('SELECT COUNT(*) as c FROM requirements').get()).toEqual({ c: 0 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('use-case-template.dal: variant resolution requires an exact condition match (fix round WARNING 3)', () => {
  it('does not over-match a two-discriminator variant for a template naming only one discriminator', () => {
    const channelPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }, { value: 'app' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: channelPropertyId, role: 'discriminator' });
    // Two-discriminator variant created first, so an "any condition matches" resolver would find it
    // before ever considering the exact one-discriminator variant below.
    const twoConditionVariantId = VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: discriminatorPropertyId, operator: 'equals', values: ['add'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    }).id;

    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T4',
      name: 'Exact match',
      type: 'marketing',
      default_requirements_json: [
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'action', value: 'add' },
          level: 'R',
        },
      ],
    });

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const [requirement] = RequirementDAL.listRequirements(projectId, useCase.id);
    // The pre-existing single-discriminator variant from `beforeEach` (`variantId`,
    // `cart_update[action=add]`) is the exact match; the two-discriminator variant must not win.
    expect(requirement.variant_id).toBe(variantId);
    expect(requirement.variant_id).not.toBe(twoConditionVariantId);
    expect(requirement.status).not.toBe('gap');
  });

  it('resolves unambiguously when the template names the second discriminator instead', () => {
    const channelPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }, { value: 'app' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: channelPropertyId, role: 'discriminator' });
    const channelOnlyVariantId = VariantDAL.createVariant(projectId, eventId, {
      conditions: [{ property_id: channelPropertyId, operator: 'equals', values: ['web'] }],
    }).id;
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: discriminatorPropertyId, operator: 'equals', values: ['add'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    });

    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T5',
      name: 'Exact match 2',
      type: 'marketing',
      default_requirements_json: [
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'channel', value: 'web' },
          level: 'R',
        },
      ],
    });

    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const [requirement] = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirement.variant_id).toBe(channelOnlyVariantId);
  });

  it('leaves the requirement unresolved (gap) when no variant has exactly that one condition', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T6',
      name: 'No exact match',
      type: 'marketing',
      default_requirements_json: [
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'action', value: 'remove' },
          level: 'R',
        },
      ],
    });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const [requirement] = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirement.status).toBe('gap');
    expect(requirement.variant_id).toBeNull();
    expect(requirement.note).toContain('action=remove');
  });

  it('LOW D (second fix round): the "candidates" note lists variant names, not raw conditions_key JSON', () => {
    const channelPropertyId = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'web' }, { value: 'app' }],
    }).id;
    EventDAL.attachPropertyToEvent(projectId, eventId, { property_id: channelPropertyId, role: 'discriminator' });
    // Neither variant matches "action=remove" exactly (both also condition on channel; the
    // beforeEach variant `variantId` is the only exact single-condition match and it is for
    // action=add), so both two-discriminator variants below are "candidates on the same property"
    // for the unresolved note.
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: discriminatorPropertyId, operator: 'equals', values: ['remove'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['web'] },
      ],
    });
    VariantDAL.createVariant(projectId, eventId, {
      conditions: [
        { property_id: discriminatorPropertyId, operator: 'equals', values: ['remove'] },
        { property_id: channelPropertyId, operator: 'equals', values: ['app'] },
      ],
    });

    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-T7',
      name: 'Candidates note',
      type: 'marketing',
      default_requirements_json: [
        {
          target_kind: 'variant',
          event_name: 'cart_update',
          condition: { property_name: 'action', value: 'remove' },
          level: 'R',
        },
      ],
    });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const [requirement] = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirement.status).toBe('gap');
    expect(requirement.note).toContain('Candidates on the same property:');
    expect(requirement.note).toContain('cart_update[action=remove,channel=web]');
    expect(requirement.note).toContain('cart_update[action=remove,channel=app]');
    expect(requirement.note).not.toMatch(/property_id/);
    expect(requirement.note).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  });
});

describe('T-3-06: instantiate code suffixing, tags/flags, catalog_attribute/consent gap, delete guard', () => {
  it('defaults the use case code to the template code, and suffixes -2/-3 on conflict', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-SFX', name: 'Suffix test', type: 'marketing' });
    const first = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(first.code).toBe('UC-SFX');
    const second = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(second.code).toBe('UC-SFX-2');
    const third = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(third.code).toBe('UC-SFX-3');
  });

  it('accepts an explicit {code} option', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-SFX2', name: 'Explicit code', type: 'marketing' });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id, { code: 'MY-CODE' });
    expect(useCase.code).toBe('MY-CODE');
  });

  it('stores and round-trips tags_json/flags_json', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-TAGS',
      name: 'Tagged',
      type: 'marketing',
      tags_json: { channels: ['email'], goals: ['drive_traffic'] },
      flags_json: { popular: true },
    });
    expect(template.tags_json).toEqual({ channels: ['email'], goals: ['drive_traffic'], tiers: [], kpis: [], industries: [] });
    expect(template.flags_json).toEqual({ new: false, popular: true });
    const reloaded = UseCaseTemplateDAL.getUseCaseTemplateOrThrow(template.id);
    expect(reloaded.tags_json.channels).toEqual(['email']);
  });

  it('updateUseCaseTemplate patches individual fields', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-UPD', name: 'Original', type: 'marketing' });
    const updated = UseCaseTemplateDAL.updateUseCaseTemplate(template.id, { name: 'Updated name' });
    expect(updated.name).toBe('Updated name');
    expect(updated.type).toBe('marketing');
  });

  it('a catalog_attribute or consent requirement instantiates as a gap, not an "unknown target_kind"', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-CAT',
      name: 'Catalog and consent',
      type: 'marketing',
      default_requirements_json: [
        { target_kind: 'catalog_attribute', property_name: 'image', level: 'R' },
        { target_kind: 'consent', property_name: 'newsletter', level: 'R' },
      ],
    });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirements).toHaveLength(2);
    for (const r of requirements) {
      expect(r.status).toBe('gap');
      expect(r.note).not.toContain('unknown target_kind');
    }
  });

  it('copies a requirement entry note onto the resolved requirement', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({
      code: 'UC-NOTE',
      name: 'Note copy',
      type: 'marketing',
      default_requirements_json: [
        { target_kind: 'event', event_name: 'cart_update', level: 'R', note: 'Trigger event.' },
      ],
    });
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const [requirement] = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirement.note).toBe('Trigger event.');
  });

  it('refuses to delete a template still instantiated by a non-deleted use case (409 TEMPLATE_IN_USE)', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-DEL', name: 'In use', type: 'marketing' });
    UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    expect(() => UseCaseTemplateDAL.deleteUseCaseTemplate(template.id)).toThrow(TemplateInUseError);
  });

  it('deletes a template with no use cases referencing it', () => {
    const template = UseCaseTemplateDAL.createUseCaseTemplate({ code: 'UC-DEL2', name: 'Unused', type: 'marketing' });
    UseCaseTemplateDAL.deleteUseCaseTemplate(template.id);
    expect(UseCaseTemplateDAL.getUseCaseTemplateById(template.id)).toBeNull();
  });
});

describe('T-3-06: sample library instantiated on the data-mapping fixture project', () => {
  beforeEach(() => {
    const preview = previewDataMapping(projectId, dataMappingFixture);
    applyDataMapping(projectId, dataMappingFixture, preview.payload_hash, preview.items.map((i) => i.id));

    const libraryModel = parseUseCaseLibrary(libraryFixture);
    for (const t of libraryModel.templates) {
      UseCaseTemplateDAL.createUseCaseTemplate({
        code: t.code,
        name: t.name,
        type: t.type,
        description: t.description,
        default_requirements_json: t.default_requirements,
        narrative_template: t.narrative_template,
        tags_json: t.tags,
        flags_json: t.flags,
      });
    }
  });

  it('UC-01 resolves the cart_update[action=add] variant and its two variant properties', () => {
    const template = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'UC-01')!;
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirements).toHaveLength(5);
    expect(requirements.filter((r) => r.status === 'gap')).toHaveLength(0);

    const variant = getDb().prepare('SELECT name FROM variants WHERE id = ?').get(requirements[0].variant_id) as
      | { name: string }
      | undefined;
    expect(variant?.name).toBe('cart_update[action=add]');
  });

  it('UC-02 fully resolves against the fixture mapping (purchase, purchase_item, email)', () => {
    const template = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'UC-02')!;
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(requirements.filter((r) => r.status === 'gap')).toHaveLength(0);
  });

  it('UC-03 produces exactly one gap (the unresolvable wishlist_add event)', () => {
    const template = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'UC-03')!;
    const useCase = UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, template.id);
    const requirements = RequirementDAL.listRequirements(projectId, useCase.id);
    const gaps = requirements.filter((r) => r.status === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].note).toContain('wishlist_add');
  });

  it('previewInstantiateUseCaseTemplate reports UC-01 all-resolved and UC-03 mixed', () => {
    const uc01 = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'UC-01')!;
    const uc01Preview = UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, uc01.id);
    expect(uc01Preview.unresolved_count).toBe(0);
    const eventsGroup = uc01Preview.groups.find((g) => g.group === 'events')!;
    expect(eventsGroup.status).toBe('all');
    const customerGroup = uc01Preview.groups.find((g) => g.group === 'customer_properties')!;
    expect(customerGroup.status).toBe('all');

    const uc03 = UseCaseTemplateDAL.listUseCaseTemplates().find((t) => t.code === 'UC-03')!;
    const uc03Preview = UseCaseTemplateDAL.previewInstantiateUseCaseTemplate(projectId, uc03.id);
    expect(uc03Preview.unresolved_count).toBe(1);
    const uc03Events = uc03Preview.groups.find((g) => g.group === 'events')!;
    expect(uc03Events.status).toBe('mixed');
  });
});
