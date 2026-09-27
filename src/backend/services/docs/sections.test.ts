import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderConsentCategoriesSection,
  renderIdentityRulesSection,
  renderIdentityCodegenSection,
  renderNarrativeHtml,
  renderRequirementsMatrixSection,
  renderStandardEventMappingsSection,
  renderUseCasesSection,
  renderVariantsSubsection,
  renderCertificationBadge,
  renderRulesTable,
  renderCoverageSummary,
  renderFindingsTable,
  type ConsentCategoryForDocs,
  type IdentityRuleForDocs,
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

  it('renders one row per open finding with severity, kind, comparison, property/variant and message', () => {
    const html = renderFindingsTable([
      {
        severity: 'error',
        kind: 'type_mismatch',
        comparison: 'definition_vs_observations',
        property: 'total_price',
        variant: 'purchase[purchase_status=refunded]',
        message: 'Expected number, got string.',
      },
    ]);
    expect(html).toContain('error');
    expect(html).toContain('type_mismatch');
    expect(html).toContain('definition_vs_observations');
    expect(html).toContain('total_price');
    expect(html).toContain('purchase[purchase_status=refunded]');
    expect(html).toContain('Expected number, got string.');
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

  it('renders the mapped event/variant and a field map summary, dropping unmapped fields', () => {
    const mappings: StandardEventMappingForDocs[] = [
      {
        standard_event: 'add_to_cart',
        event_name: 'cart_update',
        variant_name: 'cart_update[action=add]',
        field_map: { product_id: 'product_id', total_price: null },
      },
    ];
    const html = renderStandardEventMappingsSection(mappings);
    expect(html).toContain('add_to_cart');
    expect(html).toContain('cart_update');
    expect(html).toContain('cart_update[action=add]');
    expect(html).toContain('product_id → product_id');
    expect(html).not.toContain('total_price →');
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
