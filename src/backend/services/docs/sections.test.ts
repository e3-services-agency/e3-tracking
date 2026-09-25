import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderConsentCategoriesSection,
  renderIdentityRulesSection,
  renderNarrativeHtml,
  renderRequirementsMatrixSection,
  renderStandardEventMappingsSection,
  renderUseCasesSection,
  renderVariantsSubsection,
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

describe('renderIdentityRulesSection', () => {
  it('renders a placeholder when there are no rules', () => {
    const html = renderIdentityRulesSection([]);
    expect(html).toContain('No identity rules defined.');
    expect(html).toContain('id="identity-rules"');
  });

  it('renders one row per rule, in the given order, with an em dash for missing fields', () => {
    const rules: IdentityRuleForDocs[] = [
      {
        bloomreach_field: 'registered',
        identity_type: 'hard',
        name: 'Registration email',
        trigger_event_name: 'account_created',
        owner: 'Jane',
      },
      {
        bloomreach_field: 'cookie',
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
      { bloomreach_field: 'email_id', identity_type: 'hard', name: '<script>alert(1)</script>' },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
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
