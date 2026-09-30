import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderConsentCategoriesSection,
  renderIdentityRulesSection,
  renderIdentityCodegenSection,
  renderNarrativeHtml,
  renderPropertiesSection,
  renderCatalogsSection,
  renderRequirementsMatrixSection,
  renderStandardEventMappingsSection,
  renderFindingsSummarySection,
  renderUseCasesSection,
  renderVariantsSubsection,
  renderCertificationBadge,
  renderRulesTable,
  renderCoverageSummary,
  renderFindingsTable,
  type ConsentCategoryForDocs,
  type IdentityRuleForDocs,
  type PropertyForDocs,
  type RequirementsMatrixForDocs,
  type StandardEventMappingForDocs,
  type UseCaseForDocs,
  type VariantForDocs,
} from './sections';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe('&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
  });
});

describe('renderCertificationBadge (T-2-08)', () => {
  it('renders n/a for a non-applicable (sdk/platform) event', () => {
    const html = renderCertificationBadge({ applicable: false, certified: false, reasons: ['not_applicable'] });
    expect(html).toContain('n/a');
  });

  it('renders certified for a certified event', () => {
    const html = renderCertificationBadge({ applicable: true, certified: true, reasons: [] });
    expect(html).toContain('certified');
    expect(html).not.toContain('not certified');
  });

  it('renders the blocking reasons for a not-certified custom event', () => {
    const html = renderCertificationBadge({ applicable: true, certified: false, reasons: ['open_errors: 1'] });
    expect(html).toContain('not certified');
    expect(html).toContain('open_errors: 1');
  });
});

describe('renderRulesTable (T-2-08)', () => {
  it('renders an empty string when there are no rules', () => {
    expect(renderRulesTable([])).toBe('');
  });

  it('renders one row per rule with its resolved expression text and tolerance', () => {
    const html = renderRulesTable([
      {
        name: 'cart items total',
        kind: 'arithmetic',
        message: 'Totals must match.',
        expression_text: 'sum(product_list[].price * product_list[].quantity) eq total_price',
        tolerance: { mode: 'money', value: null },
        enabled: true,
        variant_name: null,
      },
    ]);
    expect(html).toContain('cart items total');
    expect(html).toContain('sum(product_list[].price * product_list[].quantity) eq total_price');
    expect(html).toContain('money');
    expect(html).toContain('enabled');
    expect(html).toContain('all');
  });

  it('shows the variant scope for a variant-scoped rule (ERROR 3 fix round)', () => {
    const html = renderRulesTable([
      {
        name: 'refund negative',
        kind: 'bound',
        message: 'Refunds must be negative.',
        expression_text: 'total_price lt 0',
        tolerance: { mode: 'none', value: null },
        enabled: true,
        variant_name: 'purchase[purchase_status=refunded]',
      },
    ]);
    expect(html).toContain('purchase[purchase_status=refunded]');
  });
});

describe('renderFindingsTable (D-40 Q9 fix round)', () => {
  it('renders an empty string when there are no findings', () => {
    expect(renderFindingsTable([])).toBe('');
  });

  it('renders one row per open finding with severity, kind, comparison, property/variant, rule and message', () => {
    const html = renderFindingsTable([
      {
        severity: 'error',
        kind: 'type_mismatch',
        comparison: 'definition_vs_observations',
        property: 'total_price',
        variant: 'purchase[purchase_status=refunded]',
        rule: 'refund negative',
        message: 'Expected number, got string.',
      },
    ]);
    expect(html).toContain('error');
    expect(html).toContain('type_mismatch');
    expect(html).toContain('definition_vs_observations');
    expect(html).toContain('total_price');
    expect(html).toContain('purchase[purchase_status=refunded]');
    expect(html).toContain('refund negative');
    expect(html).toContain('Expected number, got string.');
    expect(html).toContain('<th>Rule</th>');
    expect(html).toContain('<h3>Open findings</h3>');
  });

  it('renders a custom heading (fix round 2: the document-level "Open findings without an event" table)', () => {
    const html = renderFindingsTable(
      [
        {
          severity: 'warning',
          kind: 'shape_inconsistent',
          comparison: 'definition_vs_observations',
          property: null,
          variant: null,
          rule: null,
          message: 'Property "product_ids" is observed with inconsistent JSON types across events: array, string.',
        },
      ],
      'Open findings without an event'
    );
    expect(html).toContain('<h3>Open findings without an event</h3>');
    expect(html).not.toContain('<h3>Open findings</h3>');
  });
});

describe('renderCoverageSummary (T-2-08)', () => {
  it('renders an empty string when the grid has no cells at all', () => {
    expect(renderCoverageSummary({ observed_count: 0, unobserved_count: 0 })).toBe('');
  });

  it('renders the observed/total fraction', () => {
    const html = renderCoverageSummary({ observed_count: 2, unobserved_count: 3 });
    expect(html).toContain('2 of 5');
  });
});

describe('renderIdentityRulesSection', () => {
  it('renders a placeholder when there are no rules', () => {
    const html = renderIdentityRulesSection([]);
    expect(html).toContain('No identity rules defined.');
    expect(html).toContain('id="identity-rules"');
  });

  it('renders one row per rule, in the given order, with an em dash for missing fields', () => {
    const rules: IdentityRuleForDocs[] = [
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        name: 'Registration email',
        trigger_event_name: 'account_created',
        owner: 'Jane',
      },
      {
        identifier_name: 'cookie',
        identity_type: 'soft',
        name: 'Anonymous cookie',
      },
    ];
    const html = renderIdentityRulesSection(rules);
    expect(html).toContain('Registration email');
    expect(html).toContain('registered');
    expect(html).toContain('hard');
    expect(html).toContain('account_created');
    expect(html).toContain('Anonymous cookie');
    expect(html).toContain('soft');
    // Missing example/value_rule/etc. on the second rule render as an em dash, not "undefined".
    expect(html).not.toContain('undefined');
    expect(html).toContain('—');
    // Order preserved: "Registration email" appears before "Anonymous cookie".
    expect(html.indexOf('Registration email')).toBeLessThan(html.indexOf('Anonymous cookie'));
  });

  it('escapes rule text so a name containing markup cannot break the document', () => {
    const html = renderIdentityRulesSection([
      { identifier_name: 'email_id', identity_type: 'hard', name: '<script>alert(1)</script>' },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders transformations and sdk_call when present', () => {
    const html = renderIdentityRulesSection([
      {
        identifier_name: 'email_id',
        identity_type: 'hard',
        name: 'Login email',
        transformations: ['trim', 'lowercase'],
        sdk_call: 'identify',
      },
    ]);
    expect(html).toContain('trim, lowercase');
    expect(html).toContain('identify');
  });
});

describe('renderIdentityCodegenSection', () => {
  it('renders the three snippets in <pre> blocks, escaped', () => {
    const html = renderIdentityCodegenSection({
      identify: "exponea.identify({ registered: '<x>' });",
      update: 'exponea.update({});',
      anonymize: 'exponea.anonymize();',
    });
    expect(html).toContain('id="identity-codegen"');
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('exponea.update({});');
    expect(html).toContain('exponea.anonymize();');
  });
});

describe('renderConsentCategoriesSection', () => {
  it('renders a placeholder when there are no categories', () => {
    const html = renderConsentCategoriesSection([]);
    expect(html).toContain('No consent categories defined.');
    expect(html).toContain('id="consent-categories"');
  });

  it('renders the client category mapped to its standard key, matching the data-mapping.json shape', () => {
    const categories: ConsentCategoryForDocs[] = [
      { name: 'brand_consent', standard_key: 'newsletter', description: 'Marketing emails', status: 'implemented' },
    ];
    const html = renderConsentCategoriesSection(categories);
    expect(html).toContain('brand_consent');
    expect(html).toContain('newsletter');
    expect(html).toContain('Marketing emails');
    expect(html).toContain('implemented');
  });
});

// T-4-00 review follow-up, closed by T-4-03: the HTML export had no per-property definition list
// (only the inline per-event one), so `properties[].definitions[]` from the tracking document had
// nowhere to render project-wide.
describe('renderPropertiesSection (T-4-00 review follow-up / T-4-03)', () => {
  it('renders a placeholder when there are no customer properties', () => {
    const html = renderPropertiesSection([]);
    expect(html).toContain('No properties defined.');
    expect(html).toContain('id="properties"');
  });

  it('lists every named definition a property carries, with its own allowed values/formats/example', () => {
    const properties: PropertyForDocs[] = [
      {
        name: 'action',
        data_type: 'string',
        pii: false,
        description: 'The action taken',
        definitions: [
          {
            name: 'general',
            description: 'Cart action',
            allowed_values: [{ value: 'add' }, { value: 'remove' }],
            formats: [],
            example_values: 'add',
          },
          {
            name: 'consent (event)',
            description: 'Consent choice',
            allowed_values: [{ value: 'accept' }, { value: 'reject' }],
            formats: [],
            example_values: 'accept',
          },
        ],
      },
    ];
    const html = renderPropertiesSection(properties);
    expect(html).toContain('action');
    expect(html).toContain('general');
    expect(html).toContain('add, remove');
    expect(html).toContain('consent (event)');
    expect(html).toContain('accept, reject');
  });

  it('renders a single definition (the common case) without any special-casing artefact', () => {
    const html = renderPropertiesSection([
      { name: 'email', data_type: 'string', pii: true, description: null, definitions: [{ name: 'general', formats: ['email'], allowed_values: null, example_values: null }] },
    ]);
    expect(html).toContain('email');
    expect(html).toContain('PII');
    expect(html).toContain('general');
  });
});

// INFO 10 (fix round): renderVariantsSubsection/renderStandardEventMappingsSection previously had
// no direct-unit cases, only reached indirectly through export.service.test.ts.
describe('renderVariantsSubsection', () => {
  it('renders an empty string (no nested section) when there are no variants', () => {
    expect(renderVariantsSubsection([])).toBe('');
  });

  it('renders one row per variant with the condition text and standard event', () => {
    const variants: VariantForDocs[] = [
      { name: 'cart_update[action=add]', conditionsText: 'action = add', standard_event: 'add_to_cart' },
      { name: 'cart_update[action=remove]', conditionsText: 'action = remove', description: 'Removal' },
    ];
    const html = renderVariantsSubsection(variants);
    expect(html).toContain('cart_update[action=add]');
    expect(html).toContain('action = add');
    expect(html).toContain('add_to_cart');
    expect(html).toContain('cart_update[action=remove]');
    expect(html).toContain('Removal');
    expect(html).not.toContain('undefined');
  });

  it('escapes a hostile variant description', () => {
    const html = renderVariantsSubsection([
      { name: 'v1', conditionsText: 'a = b', description: '<img src=x onerror=alert(1)>' },
    ]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('renderStandardEventMappingsSection', () => {
  it('renders a placeholder when there are no mappings', () => {
    const html = renderStandardEventMappingsSection([]);
    expect(html).toContain('No standard event mappings defined.');
    expect(html).toContain('id="standard-event-mappings"');
  });

  it('renders one block per mapping: heading, count, mapped fields first, unmapped as "not mapped"', () => {
    const mappings: StandardEventMappingForDocs[] = [
      {
        standard_event: 'add_to_cart',
        event_name: 'cart_update',
        variant_name: 'cart_update[action=add]',
        field_map: { total_price: null, product_id: 'product_id' },
      },
    ];
    const html = renderStandardEventMappingsSection(mappings);
    expect(html).toContain('add_to_cart → cart_update (cart_update[action=add])');
    expect(html).toContain('1 of 2 fields mapped');
    expect(html).not.toContain('→ —');
    expect(html.indexOf('product_id')).toBeLessThan(html.indexOf('total_price'));
    expect(html).toContain('<td class="muted">not mapped</td>');
  });
});

describe('renderFindingsSummarySection (T-4-19)', () => {
  const summary = {
    total: 3,
    bySeverity: { error: 2, warning: 1, info: 0 },
    byComparison: [{ comparison: 'definition_vs_observations', error: 2, warning: 1, info: 0, total: 3 }],
    topEvents: [{ id: 'e1', name: 'purchase', errors: 2, total: 3 }],
    acknowledged: { error: 1, warning: 0, info: 0, total: 1 },
  };
  it('renders severity, comparison, linked top events and acknowledged count', () => {
    const html = renderFindingsSummarySection(summary, (id) => 'event-' + id);
    expect(html).toContain('3 open');
    expect(html).toContain('definition_vs_observations');
    expect(html).toContain('<a href="#event-e1">purchase</a>');
    expect(html).toContain('Acknowledged: error 1');
  });
  it('renders nothing when there is nothing to summarise', () => {
    const empty = { ...summary, total: 0, byComparison: [], topEvents: [], acknowledged: { error: 0, warning: 0, info: 0, total: 0 } };
    expect(renderFindingsSummarySection(empty, () => null)).toBe('');
  });
});

describe('renderPropertiesSection examples (T-4-19)', () => {
  it('prints stored examples as readable values, not escaped JSON', () => {
    const html = renderPropertiesSection([
      {
        name: 'year',
        data_type: 'array',
        pii: false,
        description: null,
        definitions: [{ name: 'general', description: null, allowed_values: null, formats: [], example_values: [{ value: '2023' }, { value: '2024' }] }],
      } as unknown as PropertyForDocs,
    ]);
    expect(html).toContain('2023, 2024');
    expect(html).not.toContain('&quot;value&quot;');
  });
});

describe('renderNarrativeHtml', () => {
  it('renders headings, numbered lists, bullet lists and paragraphs as real block elements (WARNING 3 fix round)', () => {
    const markdown = [
      'Add to cart is a general use case.',
      '',
      '## Flow',
      '',
      '1. The site sends `cart_update` with required `product_id`.',
      '2. The site sends `checkout`.',
      '',
      '## Gaps',
      '',
      '- `checkout.total_price`: not yet mapped.',
    ].join('\n');
    const html = renderNarrativeHtml(markdown);
    expect(html).toContain('<p>Add to cart is a general use case.</p>');
    expect(html).toContain('<h5>Flow</h5>');
    expect(html).toContain('<ol><li>The site sends <code>cart_update</code> with required <code>product_id</code>.</li><li>The site sends <code>checkout</code>.</li></ol>');
    expect(html).toContain('<h5>Gaps</h5>');
    expect(html).toContain('<ul><li><code>checkout.total_price</code>: not yet mapped.</li></ul>');
  });

  it('escapes hostile content, including inside inline code spans', () => {
    const html = renderNarrativeHtml('## <script>alert(1)</script>\n\n- `<img onerror=alert(1)>`');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<code>&lt;img onerror=alert(1)&gt;</code>');
  });

  it('falls back to a single paragraph for narrative text with no markdown syntax', () => {
    const html = renderNarrativeHtml('Fires when the customer completes checkout.');
    expect(html).toBe('<p>Fires when the customer completes checkout.</p>');
  });

  // T-2-11 fix round, ERROR 1: a `\r` at the end of a heading/list line used to defeat the
  // heading regex but still match the paragraph collector's exclusion, so the paragraph branch
  // consumed zero lines and the parser looped forever (OOM, hangs the whole single-threaded API).
  describe('CRLF and lone-CR input (fix round ERROR 1)', () => {
    it('parses a CRLF heading, numbered list and paragraph without hanging, dropping the CR', () => {
      const markdown = 'Intro\r\n\r\n## Flow\r\n\r\n1. a\r\n2. b';
      const html = renderNarrativeHtml(markdown);
      expect(html).toBe('<p>Intro</p>\n<h5>Flow</h5>\n<ol><li>a</li><li>b</li></ol>');
      expect(html).not.toContain('\r');
    });

    it('parses a CRLF bullet list without hanging, dropping the CR', () => {
      const html = renderNarrativeHtml('- a\r\n- b');
      expect(html).toBe('<ul><li>a</li><li>b</li></ul>');
      expect(html).not.toContain('\r');
    });

    it('parses a lone-CR (old Mac style) line ending the same way as CRLF', () => {
      const html = renderNarrativeHtml('## Flow\r\r1. a');
      expect(html).toBe('<h5>Flow</h5>\n<ol><li>a</li></ol>');
      expect(html).not.toContain('\r');
    });

    it('terminates and produces well-formed output for 200 random mixes of line-ending styles and block types', () => {
      const lineKinds = [
        () => '## Heading',
        () => '1. item',
        () => '- item',
        () => 'plain text',
        () => '',
      ];
      const endings = ['\n', '\r\n', '\r'];
      // Deterministic pseudo-random generator so a failure is reproducible without a fixed seed file.
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let run = 0; run < 200; run++) {
        const lineCount = 1 + Math.floor(rand() * 8);
        let markdown = '';
        for (let l = 0; l < lineCount; l++) {
          const kind = lineKinds[Math.floor(rand() * lineKinds.length)];
          markdown += kind();
          markdown += endings[Math.floor(rand() * endings.length)];
        }
        // Each call must return, not hang -- that is the assertion. vitest's own timeout also
        // catches a real infinite loop, but this makes the intent explicit per-run.
        const html = renderNarrativeHtml(markdown);
        expect(typeof html).toBe('string');
      }
    });
  });
});

describe('renderUseCasesSection', () => {
  it('renders a placeholder when there are no use cases', () => {
    const html = renderUseCasesSection([]);
    expect(html).toContain('No use cases defined.');
    expect(html).toContain('id="use-cases"');
  });

  it('renders one subsection per use case, its metadata/narrative and its ordered requirements', () => {
    const useCases: UseCaseForDocs[] = [
      {
        code: 'UC-01',
        name: 'Checkout tracking',
        type: 'transactional',
        priority: 'high',
        status: 'approved',
        owner: 'Jane',
        narrative: 'Fires when the customer completes checkout.',
        requirements: [
          { target_label: 'checkout', level: 'R', status: 'open', note: null },
          { target_label: 'email', level: 'O', status: null, note: 'Confirm with client' },
        ],
      },
    ];
    const html = renderUseCasesSection(useCases);
    expect(html).toContain('UC-01 — Checkout tracking');
    expect(html).toContain('transactional');
    expect(html).toContain('high');
    expect(html).toContain('Jane');
    expect(html).toContain('Fires when the customer completes checkout.');
    expect(html).toContain('checkout');
    expect(html).toContain('email');
    expect(html).toContain('Confirm with client');
    // Order preserved: the event row appears before the customer_property row.
    expect(html.indexOf('checkout')).toBeLessThan(html.indexOf('Confirm with client'));
  });

  it('renders a placeholder for a use case with no requirements', () => {
    const html = renderUseCasesSection([{ name: 'Empty use case', requirements: [] }]);
    expect(html).toContain('No requirements defined.');
  });

  it('escapes hostile use case text', () => {
    const html = renderUseCasesSection([
      { name: '<script>alert(1)</script>', requirements: [] },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderRequirementsMatrixSection', () => {
  it('renders a placeholder when there are no use cases or rows', () => {
    const html = renderRequirementsMatrixSection({ use_cases: [], rows: [] });
    expect(html).toContain('No requirements defined yet.');
    expect(html).toContain('id="requirements-matrix"');
  });

  it('renders one column per use case and one row per target, with the level in each cell', () => {
    const matrix: RequirementsMatrixForDocs = {
      use_cases: [
        { id: 'uc1', code: 'UC-01', name: 'Checkout tracking' },
        { id: 'uc2', code: null, name: 'Newsletter signup' },
      ],
      rows: [{ label: 'checkout', cells: { uc1: 'R', uc2: 'O' } }, { label: 'email', cells: { uc1: 'O' } }],
    };
    const html = renderRequirementsMatrixSection(matrix);
    expect(html).toContain('UC-01 — Checkout tracking');
    expect(html).toContain('Newsletter signup');
    expect(html).toContain('checkout');
    expect(html).toContain('email');
    expect(html).toMatch(/<td>R<\/td>/);
    expect(html).toMatch(/<td>O<\/td>/);
    // uc2 has no requirement on "email": its cell renders as an em dash, not "undefined".
    expect(html).not.toContain('undefined');
  });
});

// D-64 (T-4-20): grouped Properties section and the Catalogs section.
describe('renderPropertiesSection grouped by category (D-64)', () => {
  const def = [{ name: 'general', formats: [] as string[], allowed_values: null, example_values: null }];
  it('groups System customer / Customer / SDK default / Event with kind subgroups, in that order', () => {
    const html = renderPropertiesSection([
      { name: 'product_id', category: 'event', kind: 'event', data_type: 'string', definitions: def },
      { name: 'items', category: 'event', kind: 'item', data_type: 'array', definitions: def },
      { name: 'browser', category: 'sdk_default', kind: 'context', data_type: 'string', definitions: def },
      { name: 'loyalty', category: 'customer', data_type: 'string', definitions: def },
      { name: 'email', category: 'system_customer', data_type: 'string', definitions: def },
    ]);
    const order = ['System customer (1)', 'Customer (1)', 'SDK default (1)', 'Event (2)'].map((h) => html.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('id="properties-system_customer"');
    expect(html).toContain('id="properties-event-item"');
    expect(html).toContain('Item (1)');
    expect(html.indexOf('email')).toBeLessThan(html.indexOf('loyalty'));
  });
});

describe('renderCatalogsSection (D-64)', () => {
  it('renders nothing for no catalogs', () => {
    expect(renderCatalogsSection([])).toBe('');
  });
  it('renders fields and mapped properties, escaped', () => {
    const html = renderCatalogsSection([
      {
        name: 'products <x>',
        mapping_role: 'main',
        source_system: 'PIM',
        fields: [{ name: 'item_id', data_type: 'string', is_lookup_key: true, is_searchable: false }],
        mapped_properties: [{ property_name: 'product_id', scope: 'event', field_name: 'item_id' }],
      },
    ]);
    expect(html).toContain('id="catalogs"');
    expect(html).toContain('products &lt;x&gt;');
    expect(html).toContain('mapping role: main');
    expect(html).toContain('item_id');
    expect(html).toContain('Properties that look up into this catalog');
    expect(html).not.toContain('owner');
  });
});
