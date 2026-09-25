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
    expect(snippets.identify).toContain('exponea.identify(String(registered).trim().toLowerCase());');
    expect(snippets.identify).not.toContain('cookie');
    expect(snippets.identify).not.toContain('{');
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
    expect(snippets.identify).toContain('exponea.identify({');
    expect(snippets.identify).toContain('email_id: String(emailId).toLowerCase(),');
    expect(snippets.identify).toContain('user_id: String(userId),');
  });

  it('update: lists customer properties mapped to a Bloomreach customer attribute, phone noted as E.164', () => {
    const customerProperties: CustomerPropertyForCodegen[] = [
      { name: 'Email address', bloomreach_customer_property: 'email' },
      { name: 'Phone number', bloomreach_customer_property: 'phone' },
      { name: 'Loyalty tier', bloomreach_customer_property: 'loyalty_tier' },
      { name: 'Internal note', bloomreach_customer_property: null },
    ];
    const snippets = buildIdentityCodegen([], customerProperties);
    expect(snippets.update).toContain('email: emailAddress, // special attribute');
    expect(snippets.update).toContain('phone: phoneNumber, // special attribute, E.164 format');
    expect(snippets.update).toContain('loyalty_tier: loyaltyTier,');
    expect(snippets.update).not.toContain('Internal note');
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
    expect(snippets.anonymize).toContain('exponea.anonymize();');
    expect(snippets.anonymize).toContain('Log out');
  });

  it('anonymize: no anonymize-sdk_call rule renders a no-op placeholder, not a call', () => {
    const snippets = buildIdentityCodegen([], []);
    expect(snippets.anonymize).not.toContain('exponea.anonymize();');
  });

  it('identify: no hard rules renders a placeholder, not a call', () => {
    const snippets = buildIdentityCodegen(
      [{ identifier_name: 'cookie', identity_type: 'soft', transformations_json: [], sdk_call: null }],
      []
    );
    expect(snippets.identify).toContain('No hard identity rules configured');
  });
});
