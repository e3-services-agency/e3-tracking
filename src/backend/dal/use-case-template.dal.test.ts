/**
 * UseCaseTemplate DAL tests (T-1-07 acceptance: "`POST /use-cases/from-template/:id` implemented
 * against an empty table (tested with a unit-test template)"): global table, and
 * `instantiateUseCaseTemplate`'s resolution of each `default_requirements_json` entry, including
 * the unresolvable case (note + status `ignored`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as RequirementDAL from './requirement.dal';
import * as UseCaseTemplateDAL from './use-case-template.dal';
import { NotFoundError } from '../errors';

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
    expect(requirements.every((r) => r.status !== 'ignored')).toBe(true);
  });

  it('creates unresolvable requirements with a note and status "ignored" instead of dropping them', () => {
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
      expect(req.status).toBe('ignored');
      expect(req.property_id).toBeNull();
      expect(req.event_id).toBeNull();
      expect(req.variant_id).toBeNull();
      expect(req.note).toBeTruthy();
    }
  });

  it('rolls back the whole instantiation if the template does not exist', () => {
    expect(() => UseCaseTemplateDAL.instantiateUseCaseTemplate(projectId, 'missing')).toThrow(NotFoundError);
    expect(getDb().prepare('SELECT COUNT(*) as c FROM use_cases WHERE project_id = ?').get(projectId)).toEqual({
      c: 0,
    });
  });
});
