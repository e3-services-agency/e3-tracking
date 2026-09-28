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
import { convertPnpUseCases, isPnpUseCaseDocument, isMalformedPnpAttempt } from './pnpUseCase';

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

describe('convertPnpUseCases: fix round ERROR 3 (array guards, never throws)', () => {
  const arrayFieldDocs: [string, unknown][] = [
    ['template.requirements a string', { template_id: 'x', template: { type: 'pnp_usecase', requirements: 'nope' } }],
    ['template.requirements a number', { template_id: 'x', template: { type: 'pnp_usecase', requirements: 42 } }],
    ['template.requirements a plain object', { template_id: 'x', template: { type: 'pnp_usecase', requirements: { a: 1 } } }],
    [
      'an event requirement.properties a number',
      {
        template_id: 'x',
        template: { type: 'pnp_usecase', requirements: [{ type: 'event', event_name: 'purchase', properties: 42 }] },
      },
    ],
    [
      'a catalog requirement.fields an object',
      { template_id: 'x', template: { type: 'pnp_usecase', requirements: [{ type: 'catalog', fields: { a: 1 } }] } },
    ],
    [
      'template.fulfillments a number',
      { template_id: 'x', template: { type: 'pnp_usecase', requirements: [], fulfillments: 42 } },
    ],
    [
      'template.usecase_tags a number',
      { template_id: 'x', template: { type: 'pnp_usecase', requirements: [], usecase_tags: 42 } },
    ],
  ];

  it.each(arrayFieldDocs)('never throws when %s; warns and treats the field as empty', (_label, doc) => {
    expect(() => convertPnpUseCases(doc)).not.toThrow();
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(templates).toHaveLength(1);
    expect(warnings.some((w) => w.includes('must be an array'))).toBe(true);
  });
});

describe('convertPnpUseCases: fix round WARNING 1 (text prerequisites trimmed)', () => {
  it('trims category names, category items and bare items', () => {
    const doc = {
      template_id: 'x',
      template: {
        type: 'pnp_usecase',
        requirements: [
          {
            type: 'text',
            name: '  Tracking Prerequisities  ',
            categories: [{ name: ' Product Catalog ', items: ['  needs product_id.  '] }],
            items: ['  a bare item.  '],
          },
        ],
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates[0].prerequisites).toEqual(['Tracking Prerequisities — Product Catalog: needs product_id. — a bare item.']);
  });
});

describe('convertPnpUseCases: fix round WARNING 7 (cart_update -> add_to_cart/remove_from_cart)', () => {
  it('maps a plain cart_update event requirement to standard_event add_to_cart, keeping event_name', () => {
    const doc = {
      template_id: 'x',
      template: {
        type: 'pnp_usecase',
        requirements: [{ type: 'event', event_name: 'cart_update', properties: [{ property_name: 'product_id', property_constraint: null }] }],
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    const req = templates[0].default_requirements[0];
    expect(req.event_name).toBe('cart_update');
    expect(req.standard_event).toBe('add_to_cart');
  });

  it('maps a cart_update event requirement with action=remove to standard_event remove_from_cart', () => {
    const doc = {
      template_id: 'x',
      template: {
        type: 'pnp_usecase',
        requirements: [
          {
            type: 'event',
            event_name: 'cart_update',
            properties: [
              { property_name: 'action', property_constraint: { operator: 'equals', operands: [{ type: 'constant', value: 'remove' }] } },
              { property_name: 'product_id', property_constraint: null },
            ],
          },
        ],
      },
    };
    const { templates } = convertPnpUseCases(doc);
    const variantReq = templates[0].default_requirements.find((r) => r.target_kind === 'variant')!;
    expect(variantReq.standard_event).toBe('remove_from_cart');
    expect(variantReq.event_name).toBe('cart_update');
    const propReq = templates[0].default_requirements.find((r) => r.target_kind === 'event_property')!;
    expect(propReq.event_name).toBe('cart_update');
  });
});

describe('convertPnpUseCases: fix round 2 (ERROR 1) -- a fuzz table of malformed scalars and array items, never throws', () => {
  const base = (template: Record<string, unknown>) => ({ template_id: 'x', name: 'x', description: 'x', template: { type: 'pnp_usecase', ...template } });

  const malformedBodies: [string, unknown][] = [
    ['a null requirement item', base({ requirements: [null] })],
    ['a numeric event_name on an event requirement', base({ requirements: [{ type: 'event', event_name: 123 }] })],
    ['a numeric event_name on a mapped_event requirement', base({ requirements: [{ type: 'mapped_event', event_name: 123 }] })],
    ['a null property inside an event requirement', base({ requirements: [{ type: 'event', event_name: 'purchase', properties: [null] }] })],
    ['a numeric property_name', base({ requirements: [{ type: 'event', event_name: 'purchase', properties: [{ property_name: 42 }] }] })],
    ['a numeric text requirement name', base({ requirements: [{ type: 'text', name: 42 }] })],
    ['a null category inside a text requirement', base({ requirements: [{ type: 'text', categories: [null] }] })],
    ['a numeric category name/items', base({ requirements: [{ type: 'text', categories: [{ name: 1, items: [2, null, 'ok'] }] }] })],
    ['a numeric bare item inside a text requirement', base({ requirements: [{ type: 'text', items: [1, null, 'ok'] }] })],
    ['a null field inside a catalog requirement', base({ requirements: [{ type: 'catalog', fields: [null] }] })],
    ['a numeric field_name', base({ requirements: [{ type: 'catalog', fields: [{ field_name: 7 }] }] })],
    ['a numeric catalog_name', base({ requirements: [{ type: 'catalog', catalog_name: 7, fields: [] }] })],
    ['a null property inside a consent requirement', base({ requirements: [{ type: 'consent', properties: [null] }] })],
    ['a numeric property inside a consent requirement', base({ requirements: [{ type: 'consent', properties: [42] }] })],
    ['a null property inside a customer_property requirement', base({ requirements: [{ type: 'customer_property', properties: [null] }] })],
    ['a numeric requirement type', base({ requirements: [{ type: 42 }] })],
    ['a null requirement type', base({ requirements: [{ type: null }] })],
    ['a null fulfillment', base({ requirements: [], fulfillments: [null] })],
    ['a numeric fulfillment headline', base({ requirements: [], fulfillments: [{ headline: 42 }] })],
    ['a numeric fulfillment.item_reference.type', base({ requirements: [], fulfillments: [{ headline: 'ok', item_reference: { type: 42 } }] })],
    ['a nested-nonsense fulfillment.item_reference', base({ requirements: [], fulfillments: [{ headline: 'ok', item_reference: { type: { nested: true } } }] })],
    ['a numeric usecase_tags item', base({ requirements: [], usecase_tags: [1, null, 'essentials'] })],
    ['a numeric channels item', base({ requirements: [], channels: [1, null, 'email'] })],
    ['a numeric goal', base({ requirements: [], goal: 42 })],
    ['a numeric template_id', { template_id: 42, template: { type: 'pnp_usecase', requirements: [] } }],
    ['a numeric name', { template_id: 'x', name: 42, template: { type: 'pnp_usecase', requirements: [] } }],
    ['a numeric description', { template_id: 'x', description: 42, template: { type: 'pnp_usecase', requirements: [] } }],
    ['a numeric documentation_link', base({ requirements: [], documentation_link: 42 })],
    ['a numeric callout', base({ requirements: [], callout: 42 })],
    ['a nested-nonsense requirement (object where a scalar is expected everywhere)', base({ requirements: [{ type: 'event', event_name: { nested: { deeply: true } }, properties: [{ property_name: { also: 'nested' }, property_constraint: { operator: { weird: true } } }] }] })],
    ['requirements itself an object, not an array', base({ requirements: { not: 'an array' } })],
    ['a document that is itself null', null],
    ['a document that is itself a number', 42],
  ];

  it.each(malformedBodies)('never throws for: %s', (_label, doc) => {
    expect(() => convertPnpUseCases(doc)).not.toThrow();
    const { warnings } = convertPnpUseCases(doc);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('also never throws when every malformed body above is wrapped in {data: ...} or given as an array of two', () => {
    for (const [, doc] of malformedBodies) {
      expect(() => convertPnpUseCases({ data: doc })).not.toThrow();
      expect(() => convertPnpUseCases([doc, doc])).not.toThrow();
    }
  });
});

describe('convertPnpUseCases: fix round 2 (ERROR 2) -- source strings trimmed, pnp export round trip clean', () => {
  it('trims documentation_link and callout in source and documentation_url', () => {
    const doc = {
      template_id: 'x',
      name: 'x',
      template: {
        type: 'pnp_usecase',
        requirements: [],
        documentation_link: '  https://documentation.bloomreach.com/engagement/docs/x  ',
        callout: '  A padded quote.  ',
      },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(warnings).toEqual([]);
    expect(templates[0].source).toEqual({
      kind: 'pnp_usecase',
      template_id: 'x',
      documentation_link: 'https://documentation.bloomreach.com/engagement/docs/x',
      callout: 'A padded quote.',
    });
    expect(templates[0].documentation_url).toBe('https://documentation.bloomreach.com/engagement/docs/x');
  });

  it('converting every real br-pnp file produces trimmed source strings throughout (no leading/trailing whitespace)', () => {
    const dir = path.resolve(__dirname, '../../../.claude/team/samples/br-pnp');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { templates } = convertPnpUseCases(doc);
      for (const t of templates) {
        if (t.source?.documentation_link) expect(t.source.documentation_link).toBe(t.source.documentation_link.trim());
        if (t.source?.callout) expect(t.source.callout).toBe(t.source.callout.trim());
        if (t.documentation_url) expect(t.documentation_url).toBe(t.documentation_url.trim());
      }
    }
  });
});

describe('convertPnpUseCases: fix round 2 (WARNING 2) -- invalid documentation_link warns, url left empty', () => {
  it('a non-http(s) documentation_link is dropped from documentation_url with a warning; source.documentation_link keeps the raw value', () => {
    const doc = {
      template_id: 'x',
      name: 'x',
      template: { type: 'pnp_usecase', requirements: [], documentation_link: 'javascript:alert(1)' },
    };
    const { templates, warnings } = convertPnpUseCases(doc);
    expect(templates[0].documentation_url).toBeNull();
    expect(templates[0].source?.documentation_link).toBe('javascript:alert(1)');
    expect(warnings.some((w) => w.includes('is not an http:// or https:// URL'))).toBe(true);
  });
});
