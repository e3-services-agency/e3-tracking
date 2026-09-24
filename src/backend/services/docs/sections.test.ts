import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderConsentCategoriesSection,
  renderIdentityRulesSection,
  type ConsentCategoryForDocs,
  type IdentityRuleForDocs,
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
