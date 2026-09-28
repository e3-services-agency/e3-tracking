/**
 * `convertPnpUseCases` tests (T-4-08, D-59): three real Use Case Center exports (an email flow with
 * catalog and consent, an ad-audiences template with a retargeting consent, a dashboard with no
 * tracking requirements beyond an optional consent), the constraint-to-variant rule (synthetic --
 * the real corpus never happens to carry a non-consent `equals` constraint, checked directly
 * below), and an unknown requirement type warning.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convertPnpUseCases, isPnpUseCaseDocument } from './pnpUseCase';

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/br-pnp', name), 'utf-8'));
}

describe('isPnpUseCaseDocument', () => {
  it('recognises a {data:{template:{type:"pnp_usecase"}}} wrapper, an array of them, and rejects the native library format', () => {
    const doc = loadFixture('lwef-welcome-flow.json');
    expect(isPnpUseCaseDocument(doc)).toBe(true);
    expect(isPnpUseCaseDocument([doc, doc])).toBe(true);
    expect(isPnpUseCaseDocument({ format: 'e3-use-case-library', version: 1, templates: [] })).toBe(false);
    expect(isPnpUseCaseDocument(null)).toBe(false);
    expect(isPnpUseCaseDocument([])).toBe(false);
  });
});

describe('convertPnpUseCases: real exports', () => {
  it('converts the welcome flow email (catalog + consent + optional purchase events) with no warnings', () => {
    const doc = loadFixture('lwef-welcome-flow.json');
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates).toHaveLength(1);
    const t = templates[0];
    expect(t.code).toBe('LWEF-WELCOME-FLOW');
    expect(t.name).toBe('Welcome Flow');
    expect(t.type).toBe('marketing');
    expect(t.tags.channels).toEqual(['email']);
    expect(t.tags.tiers).toEqual(['essentials']);
    expect(t.flags.popular).toBe(true);
    expect(t.source).toEqual({
      kind: 'pnp_usecase',
      template_id: 'lwef-welcome-flow',
      documentation_link: 'https://documentation.bloomreach.com/engagement/docs/welcome-flow',
      callout: expect.stringContaining('Welcome emails'),
    });
    expect(t.documentation_url).toBe('https://documentation.bloomreach.com/engagement/docs/welcome-flow');

    const catalogReqs = t.default_requirements.filter((r) => r.target_kind === 'catalog_attribute');
    expect(catalogReqs.map((r) => r.field_name).sort()).toEqual(['image', 'price', 'product_id', 'title', 'url']);
    expect(catalogReqs.every((r) => r.level === 'O')).toBe(true); // the catalog requirement itself is is_optional: true

    const consentReq = t.default_requirements.find((r) => r.target_kind === 'consent')!;
    expect(consentReq.property_name).toBe('newsletter');

    const purchaseItemReqs = t.default_requirements.filter(
      (r) => r.target_kind === 'event_property' && r.event_name === 'purchase_item'
    );
    expect(purchaseItemReqs.map((r) => r.property_name).sort()).toEqual(['product_id', 'purchase_status']);

    // main_catalog + the free-text "Tracking Prerequisities" requirement become prerequisites notes.
    expect(t.prerequisites.some((p) => p.includes('main catalog'))).toBe(true);
    expect(t.prerequisites.some((p) => p.includes('product_id'))).toBe(true);

    expect(t.expected_assets.length).toBe(4);
    expect(t.expected_assets[0]).toEqual({ type: 'campaign_design', headline: 'Email Campaign' });
  });

  it('converts the ad-audiences template (customer properties + a retargeting consent) with no warnings', () => {
    const doc = loadFixture('ltau-social-media-ad-audiences.json');
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates).toHaveLength(1);
    const t = templates[0];
    expect(t.code).toBe('LTAU-SOCIAL-MEDIA-AD-AUDIENCES');
    expect(t.tags.channels).toEqual(['ad_audiences']);
    const customerReqs = t.default_requirements.filter((r) => r.target_kind === 'customer_property');
    expect(customerReqs.map((r) => r.property_name).sort()).toEqual(['email', 'phone']);
    const consentReq = t.default_requirements.find((r) => r.target_kind === 'consent')!;
    expect(consentReq.property_name).toBe('retargeting');
  });

  it('converts the executive dashboard (no tracking requirements beyond an optional consent) with no warnings', () => {
    const doc = loadFixture('aetd-executive-dashboard.json');
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates).toHaveLength(1);
    const t = templates[0];
    expect(t.tags.goals).toEqual(['analyze_data']); // analyse_data normalised
    expect(t.tags.channels).toEqual(['no_channel']);
    expect(t.default_requirements.some((r) => r.target_kind === 'consent')).toBe(true);
    // A dashboard needs no assets built beyond the standard events it reads -- every requirement
    // resolves to one of the tracking-side target kinds, nothing catalog/customer_property-only.
    expect(t.default_requirements.every((r) => ['consent', 'event', 'event_property', 'variant'].includes(r.target_kind))).toBe(true);
  });

  it('converts the abandoned browse banner (catalog + purchase event) with no warnings', () => {
    const doc = loadFixture('labr-abandoned-browse-banner-with-recommendations.json');
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates).toHaveLength(1);
    const t = templates[0];
    expect(t.tags.channels).toEqual(['weblayers']);
    const catalogReqs = t.default_requirements.filter((r) => r.target_kind === 'catalog_attribute');
    expect(catalogReqs.length).toBeGreaterThan(0);
  });
});

describe('convertPnpUseCases: the constraint-to-variant rule', () => {
  it('an equals property_constraint on an "event" requirement property becomes a variant requirement with a condition', () => {
    const doc = {
      name: 'Synthetic purchase success flow',
      description: 'Test fixture.',
      template_id: 'synth-purchase-success',
      template: {
        type: 'pnp_usecase',
        requirements: [
          {
            type: 'event',
            event_name: 'purchase',
            is_optional: true,
            properties: [
              {
                property_name: 'purchase_status',
                property_type: 'string',
                is_optional: false,
                property_constraint: { operator: 'equals', type: 'string', operands: [{ type: 'constant', value: 'success' }] },
              },
              { property_name: 'total_price', property_type: 'number', is_optional: false, property_constraint: null },
            ],
          },
        ],
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    const t = templates[0];
    const variantReq = t.default_requirements.find((r) => r.target_kind === 'variant')!;
    expect(variantReq).toBeDefined();
    expect(variantReq.event_name).toBe('purchase');
    expect(variantReq.condition).toEqual({ property_name: 'purchase_status', value: 'success' });
    // purchase[purchase_status=success]-style resolution target (D-59 acceptance wording).
    expect(`${variantReq.event_name}[${variantReq.condition!.property_name}=${variantReq.condition!.value}]`).toBe(
      'purchase[purchase_status=success]'
    );
    const propReq = t.default_requirements.find((r) => r.target_kind === 'event_property')!;
    expect(propReq.property_name).toBe('total_price');
  });

  it('a non-equals property_constraint is kept as an ordinary event_property requirement, with a warning and a prerequisites note', () => {
    const doc = {
      name: 'Synthetic in-list flow',
      template_id: 'synth-in-list',
      template: {
        type: 'pnp_usecase',
        requirements: [
          {
            type: 'event',
            event_name: 'purchase',
            properties: [
              {
                property_name: 'purchase_source_type',
                is_optional: false,
                property_constraint: { operator: 'in', operands: [{ type: 'constant', value: 'store' }, { type: 'constant', value: 'online' }] },
              },
            ],
          },
        ],
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings.some((w) => w.includes('operator "in"'))).toBe(true);
    const t = templates[0];
    expect(t.default_requirements).toHaveLength(1);
    expect(t.default_requirements[0]).toMatchObject({ target_kind: 'event_property', property_name: 'purchase_source_type' });
    expect(t.prerequisites.some((p) => p.includes('purchase_source_type'))).toBe(true);
  });
});

describe('convertPnpUseCases: unknown requirement type', () => {
  it('an unhandled requirement type is dropped from resolvable requirements, with a warning and a prerequisites note', () => {
    const doc = {
      name: 'Synthetic unknown type',
      template_id: 'synth-unknown-type',
      template: {
        type: 'pnp_usecase',
        requirements: [{ type: 'some_future_type', is_optional: true }],
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings.some((w) => w.includes('unhandled requirement type "some_future_type"'))).toBe(true);
    expect(templates[0].default_requirements).toEqual([]);
    expect(templates[0].prerequisites.some((p) => p.includes('some_future_type'))).toBe(true);
  });

  it('a document missing template_id is skipped with a warning, never thrown', () => {
    expect(() => convertPnpUseCases({ template: { type: 'pnp_usecase', requirements: [] } })).not.toThrow();
    const { templates, warnings } = convertPnpUseCases({ template: { type: 'pnp_usecase', requirements: [] } });
    expect(templates).toEqual([]);
    expect(warnings.some((w) => w.includes('template_id'))).toBe(true);
  });

  it('accepts an array of {data: {...}} wrapped documents and drops a duplicate template_id', () => {
    const doc = loadFixture('lwef-welcome-flow.json');
    const { templates, warnings } = convertPnpUseCases([doc, doc]);
    expect(templates).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Duplicate template_id'))).toBe(true);
  });
});
