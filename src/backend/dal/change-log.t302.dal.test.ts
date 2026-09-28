/**
 * ChangeLog wiring tests for every DAL module T-3-02 adds `recordChange` to (D-44): source,
 * standard-event-mapping, identity-rule (incl. reorder), consent-category (incl. reorder), catalog
 * and catalog field (parent = catalog), use-case, requirement (incl. replaceRequirements and the
 * instantiate insert helpers), rule (incl. createRulesFromTemplate), property_bundle, project
 * (updateProject), and the deleteEvent cascade rows (identity_rule update, standard_event_mapping
 * delete, variant delete snapshot carrying its own id). One test per mutation asserting the exact
 * row this task promises, mirroring `change-log.dal.test.ts`'s existing style for T-3-01's modules.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as EventDAL from './event.dal';
import * as PropertyDAL from './property.dal';
import * as VariantDAL from './variant.dal';
import * as SourceDAL from './source.dal';
import * as StandardEventMappingDAL from './standard-event-mapping.dal';
import * as IdentityRuleDAL from './identity-rule.dal';
import * as ConsentCategoryDAL from './consent-category.dal';
import * as CatalogDAL from './catalog.dal';
import * as UseCaseDAL from './use-case.dal';
import * as RequirementDAL from './requirement.dal';
import * as RuleDAL from './rule.dal';
import * as BundleDAL from './bundle.dal';
import * as ChangeLogDAL from './change-log.dal';

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

function changesFor(entityType: string, entityId: string) {
  return ChangeLogDAL.listChanges(projectId, { entity_type: entityType, entity_id: entityId });
}

describe('change-log.dal: source.dal.ts', () => {
  it('createSource / updateSource / deleteSource each write one row', () => {
    const source = SourceDAL.createSource(projectId, { name: 'Website' });
    expect(changesFor('source', source.id).filter((r) => r.action === 'create')).toHaveLength(1);

    SourceDAL.updateSource(projectId, source.id, { name: 'Mobile app' });
    expect(changesFor('source', source.id).filter((r) => r.action === 'update')).toHaveLength(1);

    SourceDAL.deleteSource(projectId, source.id);
    expect(changesFor('source', source.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: standard-event-mapping.dal.ts', () => {
  it('upsertStandardEventMapping writes a create row then an update row; delete writes a delete row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const mapping = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'purchase', { event_id: event.id });
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'create')).toHaveLength(1);

    const event2 = EventDAL.createEvent(projectId, { name: 'transactions' });
    StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'purchase', { event_id: event2.id });
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'update')).toHaveLength(1);

    StandardEventMappingDAL.deleteStandardEventMapping(projectId, 'purchase');
    expect(changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: identity-rule.dal.ts', () => {
  it('createIdentityRule / updateIdentityRule / deleteIdentityRule each write one row', () => {
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'email',
      identity_type: 'hard',
      name: 'Email identify',
    });
    expect(changesFor('identity_rule', rule.id).filter((r) => r.action === 'create')).toHaveLength(1);

    IdentityRuleDAL.updateIdentityRule(projectId, rule.id, { name: 'Email identify v2' });
    expect(changesFor('identity_rule', rule.id).filter((r) => r.action === 'update')).toHaveLength(1);

    IdentityRuleDAL.deleteIdentityRule(projectId, rule.id);
    expect(changesFor('identity_rule', rule.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('reorderIdentityRules writes one update row per rule whose sort_order actually changed', () => {
    const a = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'email', identity_type: 'hard', name: 'A' });
    const b = IdentityRuleDAL.createIdentityRule(projectId, { identifier_name: 'phone', identity_type: 'soft', name: 'B' });

    IdentityRuleDAL.reorderIdentityRules(projectId, [b.id, a.id]);

    expect(changesFor('identity_rule', a.id).filter((r) => r.action === 'update')).toHaveLength(1);
    expect(changesFor('identity_rule', b.id).filter((r) => r.action === 'update')).toHaveLength(1);

    // Reordering again to the identical order writes nothing new.
    IdentityRuleDAL.reorderIdentityRules(projectId, [b.id, a.id]);
    expect(changesFor('identity_rule', a.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });
});

describe('change-log.dal: consent-category.dal.ts', () => {
  it('createConsentCategory / updateConsentCategory / deleteConsentCategory each write one row', () => {
    const category = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'Newsletter' });
    expect(changesFor('consent_category', category.id).filter((r) => r.action === 'create')).toHaveLength(1);

    ConsentCategoryDAL.updateConsentCategory(projectId, category.id, { name: 'Newsletter v2' });
    expect(changesFor('consent_category', category.id).filter((r) => r.action === 'update')).toHaveLength(1);

    ConsentCategoryDAL.deleteConsentCategory(projectId, category.id);
    expect(changesFor('consent_category', category.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('reorderConsentCategories writes one update row per category whose sort_order actually changed', () => {
    const a = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'A' });
    const b = ConsentCategoryDAL.createConsentCategory(projectId, { name: 'B' });

    ConsentCategoryDAL.reorderConsentCategories(projectId, [b.id, a.id]);

    expect(changesFor('consent_category', a.id).filter((r) => r.action === 'update')).toHaveLength(1);
    expect(changesFor('consent_category', b.id).filter((r) => r.action === 'update')).toHaveLength(1);
  });
});

describe('change-log.dal: catalog.dal.ts (catalog and catalog_field, parented under the catalog)', () => {
  it('createCatalog / updateCatalog / deleteCatalog each write one row', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    expect(changesFor('catalog', catalog.id).filter((r) => r.action === 'create')).toHaveLength(1);

    CatalogDAL.updateCatalog(projectId, catalog.id, { name: 'Products v2' });
    expect(changesFor('catalog', catalog.id).filter((r) => r.action === 'update')).toHaveLength(1);

    CatalogDAL.deleteCatalog(projectId, catalog.id);
    expect(changesFor('catalog', catalog.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('createCatalogField / updateCatalogField / deleteCatalogField each write one row parented under the catalog', () => {
    const catalog = CatalogDAL.createCatalog(projectId, { name: 'Products' });
    const field = CatalogDAL.createCatalogField(projectId, catalog.id, { name: 'sku' });
    const creates = changesFor('catalog_field', field.id).filter((r) => r.action === 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0].parent_entity_id).toBe(catalog.id);

    CatalogDAL.updateCatalogField(projectId, catalog.id, field.id, { name: 'sku_v2' });
    expect(changesFor('catalog_field', field.id).filter((r) => r.action === 'update')).toHaveLength(1);

    CatalogDAL.deleteCatalogField(projectId, catalog.id, field.id);
    expect(changesFor('catalog_field', field.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: use-case.dal.ts', () => {
  it('createUseCase / updateUseCase / regenerateUseCaseNarrative / deleteUseCase each write one row', () => {
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Abandoned cart' });
    expect(changesFor('use_case', useCase.id).filter((r) => r.action === 'create')).toHaveLength(1);

    UseCaseDAL.updateUseCase(projectId, useCase.id, { name: 'Abandoned cart v2' });
    expect(changesFor('use_case', useCase.id).filter((r) => r.action === 'update')).toHaveLength(1);

    UseCaseDAL.regenerateUseCaseNarrative(projectId, useCase.id, 'Generated narrative.');
    expect(changesFor('use_case', useCase.id).filter((r) => r.action === 'update')).toHaveLength(2);

    UseCaseDAL.deleteUseCase(projectId, useCase.id);
    expect(changesFor('use_case', useCase.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: requirement.dal.ts', () => {
  it('replaceRequirements writes a create row for a new requirement, an update row for a changed one, and a delete row for a removed one, all parented under the use case', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Abandoned cart' });

    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event', event_id: event.id, level: 'R' },
    ]);
    const [firstReq] = RequirementDAL.listRequirements(projectId, useCase.id);
    const createRows = changesFor('requirement', firstReq.id).filter((r) => r.action === 'create');
    expect(createRows).toHaveLength(1);
    expect(createRows[0].parent_entity_id).toBe(useCase.id);

    // Same target, level changed R -> O: matched by target and logged as one update. Ids are not
    // preserved across a save yet (deferred to T-4-02), so the row's physical id (and the
    // change_log entity_id used for it) rotates on every call; re-read it after this save.
    RequirementDAL.replaceRequirements(projectId, useCase.id, [
      { target_kind: 'event', event_id: event.id, level: 'O' },
    ]);
    const [secondReq] = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(changesFor('requirement', secondReq.id).filter((r) => r.action === 'update')).toHaveLength(1);

    // Dropping it entirely writes a delete row against that same (current) physical id.
    RequirementDAL.replaceRequirements(projectId, useCase.id, []);
    expect(changesFor('requirement', secondReq.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('insertResolvedRequirement and insertUnresolvedRequirement (the instantiate helpers) each write one create row', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const useCase = UseCaseDAL.createUseCase(projectId, { name: 'Abandoned cart' });

    RequirementDAL.insertResolvedRequirement(projectId, useCase.id, 0, {
      target_kind: 'event',
      event_id: event.id,
      level: 'R',
    });
    RequirementDAL.insertUnresolvedRequirement(projectId, useCase.id, 1, {
      target_kind: 'event',
      level: 'R',
      note: 'No matching event.',
    });

    const rows = RequirementDAL.listRequirements(projectId, useCase.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(changesFor('requirement', row.id).filter((r) => r.action === 'create')).toHaveLength(1);
    }
  });
});

describe('change-log.dal: rule.dal.ts', () => {
  it('createRule / updateRule / deleteRule each write one row parented under the event', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id });

    const rule = RuleDAL.createRule(projectId, event.id, {
      kind: 'bound',
      name: 'total_price_non_negative',
      expression_json: {
        kind: 'bound',
        subject: { ref: 'property', property_id: totalPrice.id },
        check: 'gte',
        bound: { ref: 'constant', value: 0 },
      },
    });
    const creates = changesFor('rule', rule.id).filter((r) => r.action === 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0].parent_entity_id).toBe(event.id);

    RuleDAL.updateRule(projectId, rule.id, { name: 'total_price_non_negative_v2' });
    expect(changesFor('rule', rule.id).filter((r) => r.action === 'update')).toHaveLength(1);

    RuleDAL.deleteRule(projectId, rule.id);
    expect(changesFor('rule', rule.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });

  it('createRulesFromTemplate writes one create row per instantiated rule', () => {
    const event = EventDAL.createEvent(projectId, { name: 'purchase' });
    const totalPrice = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const purchaseStatus = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'purchase_status',
      data_type: 'string',
      allowed_values_json: [{ value: 'success' }, { value: 'refunded' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: totalPrice.id });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: purchaseStatus.id, role: 'discriminator' });
    VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: purchaseStatus.id, operator: 'equals', values: ['refunded'] }],
    });

    const rules = RuleDAL.createRulesFromTemplate(projectId, event.id, 'purchase_refund_negative');
    expect(rules).toHaveLength(1);
    expect(changesFor('rule', rules[0].id).filter((r) => r.action === 'create')).toHaveLength(1);
  });
});

describe('change-log.dal: bundle.dal.ts (property_bundle)', () => {
  it('createBundle / updateBundle / deleteBundle each write one row', () => {
    const property = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'total_price', data_type: 'number' });
    const bundle = BundleDAL.createBundle(projectId, { name: 'Purchase basics', property_ids: [property.id] });
    expect(changesFor('property_bundle', bundle.id).filter((r) => r.action === 'create')).toHaveLength(1);

    BundleDAL.updateBundle(projectId, bundle.id, { name: 'Purchase basics v2' });
    expect(changesFor('property_bundle', bundle.id).filter((r) => r.action === 'update')).toHaveLength(1);

    BundleDAL.deleteBundle(projectId, bundle.id);
    expect(changesFor('property_bundle', bundle.id).filter((r) => r.action === 'delete')).toHaveLength(1);
  });
});

describe('change-log.dal: project.dal.ts updateProject', () => {
  it('updateProject writes one update row, entity_type project, label = project name', () => {
    ProjectDAL.updateProject(projectId, { description: 'A migration project.' });
    const rows = changesFor('project', projectId).filter((r) => r.action === 'update');
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_label).toBe('Acme EU');
  });
});

describe('change-log.dal: deleteEvent cascade (from the T-3-01 review)', () => {
  it('logs an identity_rule update (trigger_event_id nulled) and a standard_event_mapping delete, and the variant delete snapshot carries its own id', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const rule = IdentityRuleDAL.createIdentityRule(projectId, {
      identifier_name: 'email',
      identity_type: 'hard',
      name: 'Email identify',
      trigger_event_id: event.id,
    });
    const mapping = StandardEventMappingDAL.upsertStandardEventMapping(projectId, 'purchase', { event_id: event.id });
    const discriminator = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: discriminator.id, role: 'discriminator' });
    const variant = VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: discriminator.id, operator: 'equals', values: ['add'] }],
    });

    EventDAL.deleteEvent(projectId, event.id);

    const ruleUpdates = changesFor('identity_rule', rule.id).filter((r) => r.action === 'update');
    expect(ruleUpdates).toHaveLength(1);
    expect(ruleUpdates[0].diff_json).toEqual([
      { field: 'trigger_event_id', before: event.id, after: null },
    ]);

    const mappingDeletes = changesFor('standard_event_mapping', mapping.id).filter((r) => r.action === 'delete');
    expect(mappingDeletes).toHaveLength(1);

    const variantDeletes = changesFor('variant', variant.id).filter((r) => r.action === 'delete');
    expect(variantDeletes).toHaveLength(1);
    expect(variantDeletes[0].diff_json.find((d) => d.field === 'id')).toEqual({
      field: 'id',
      before: variant.id,
      after: null,
    });
  });
});
