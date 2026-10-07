/**
 * `buildIdentityCodegen` tests (T-2-12, D-38): registered-only identify, a custom hard id plus a
 * second hard id (user_id), soft ids excluded, transformations wrapping, the `update` snippet from
 * mapped customer properties (special attribute noted), and the `anonymize` snippet for a logout
 * rule.
 */
import { describe, expect, it } from 'vitest';
import {
  buildIdentityCodegen,
  type CustomerPropertyForCodegen,
  type IdentityRuleForCodegen,
} from './codegen.service';

describe('buildIdentityCodegen', () => {
  it('registered-only: a single hard "registered" rule with trim+lowercase uses the plain string identify() form, cookie excluded', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: ['trim', 'lowercase'],
        sdk_call: 'identify',
      },
      {
        identifier_name: 'cookie',
        identity_type: 'soft',
        transformations_json: [],
        sdk_call: null,
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    expect(snippets.identify.web_sdk_legacy).toContain('exponea.identify(String(registered).trim().toLowerCase());');
    expect(snippets.identify.web_sdk_legacy).not.toContain('cookie');
    expect(snippets.identify.web_sdk_legacy).not.toContain('{');
  });

  it('custom hard id plus user_id: two non-"registered" hard rules produce one identify() object with both ids', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'email_id',
        identity_type: 'hard',
        transformations_json: ['lowercase'],
        sdk_call: 'identify',
      },
      {
        identifier_name: 'user_id',
        identity_type: 'hard',
        transformations_json: [],
        sdk_call: 'identify',
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    expect(snippets.identify.web_sdk_legacy).toContain('exponea.identify({');
    expect(snippets.identify.web_sdk_legacy).toContain('email_id: String(emailId).toLowerCase(),');
    expect(snippets.identify.web_sdk_legacy).toContain('user_id: String(userId),');
  });

  it('update: lists customer properties mapped to a Bloomreach customer attribute, phone noted as E.164', () => {
    const customerProperties: CustomerPropertyForCodegen[] = [
      { name: 'Email address', bloomreach_customer_property: 'email' },
      { name: 'Phone number', bloomreach_customer_property: 'phone' },
      { name: 'Loyalty tier', bloomreach_customer_property: 'loyalty_tier' },
      { name: 'Internal note', bloomreach_customer_property: null },
    ];
    const snippets = buildIdentityCodegen([], customerProperties);
    expect(snippets.update.web_sdk_legacy).toContain('email: emailAddress, // special attribute');
    expect(snippets.update.web_sdk_legacy).toContain('phone: phoneNumber, // special attribute, E.164 format');
    expect(snippets.update.web_sdk_legacy).toContain('loyalty_tier: loyaltyTier,');
    expect(snippets.update.web_sdk_legacy).not.toContain('Internal note');
  });

  it('anonymize: a logout rule with sdk_call "anonymize" produces one anonymize() call noting its trigger_text', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: [],
        sdk_call: 'anonymize',
        trigger_text: 'User clicks "Log out" on a shared device',
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    expect(snippets.anonymize.web_sdk_legacy).toContain('exponea.anonymize();');
    expect(snippets.anonymize.web_sdk_legacy).toContain('Log out');
  });

  it('anonymize: no anonymize-sdk_call rule renders a no-op placeholder, not a call', () => {
    const snippets = buildIdentityCodegen([], []);
    expect(snippets.anonymize.web_sdk_legacy).not.toContain('exponea.anonymize();');
  });

  it('identify: no hard rules renders a placeholder, not a call', () => {
    const snippets = buildIdentityCodegen(
      [{ identifier_name: 'cookie', identity_type: 'soft', transformations_json: [], sdk_call: null }],
      []
    );
    expect(snippets.identify.web_sdk_legacy).toContain('No hard identity rules configured');
  });

  it('identify: two hard rules on "registered" (an identify rule and a separate anonymize rule) dedupe to one entry (fix round WARNING 1)', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: ['lowercase'],
        sdk_call: 'identify',
      },
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: [],
        sdk_call: 'anonymize',
        trigger_text: 'User clicks "Log out"',
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    // Still the single-hard-id plain string form, not the multi-id object form, and only one call.
    expect(snippets.identify.web_sdk_legacy).toContain('exponea.identify(String(registered).toLowerCase());');
    expect(snippets.identify.web_sdk_legacy.match(/exponea\.identify\(/g)?.length).toBe(1);
    expect(snippets.identify.web_sdk_legacy).not.toContain('{');
  });

  it('identify: when the identify rule for a duplicated identifier is not the first one, dedupe still prefers it and unions the transformations (T-3-07 follow-up)', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: ['trim'],
        sdk_call: 'anonymize',
        trigger_text: 'User clicks "Log out"',
      },
      {
        identifier_name: 'registered',
        identity_type: 'hard',
        transformations_json: ['lowercase'],
        sdk_call: 'identify',
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    // Preferred rule is the identify one (not the first-by-order anonymize rule), and its
    // transformations are unioned with the non-identify duplicate's (trim + lowercase, canonical order).
    expect(snippets.identify.web_sdk_legacy).toContain('exponea.identify(String(registered).trim().toLowerCase());');
    expect(snippets.identify.web_sdk_legacy.match(/exponea\.identify\(/g)?.length).toBe(1);
  });

  it('identify: a non-identifier key ("email-id") is quoted, and a reserved-word variable name ("class") gets a trailing underscore (fix round LOW 2)', () => {
    const rules: IdentityRuleForCodegen[] = [
      {
        identifier_name: 'email-id',
        identity_type: 'hard',
        transformations_json: [],
        sdk_call: 'identify',
      },
      {
        identifier_name: 'class',
        identity_type: 'hard',
        transformations_json: [],
        sdk_call: 'identify',
      },
    ];
    const snippets = buildIdentityCodegen(rules, []);
    expect(snippets.identify.web_sdk_legacy).toContain("'email-id': String(emailId),");
    expect(snippets.identify.web_sdk_legacy).toContain('class: String(class_),');
  });

  it('update: a non-identifier Bloomreach attribute key is quoted (fix round LOW 2)', () => {
    const customerProperties: CustomerPropertyForCodegen[] = [
      { name: 'Class level', bloomreach_customer_property: 'class-level' },
    ];
    const snippets = buildIdentityCodegen([], customerProperties);
    expect(snippets.update.web_sdk_legacy).toContain("'class-level': classLevel,");
  });
});
