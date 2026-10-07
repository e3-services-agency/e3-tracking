import { describe, expect, it } from 'vitest';
import { buildIdentityCodegen, type CustomerPropertyForCodegen, type IdentityRuleForCodegen } from './identity';

const rule = (extra: Partial<IdentityRuleForCodegen> & { identifier_name: string }): IdentityRuleForCodegen => ({
  identity_type: 'hard',
  transformations_json: [],
  sdk_call: 'identify',
  ...extra,
});

const email = rule({ identifier_name: 'email_id', transformations_json: ['trim', 'lowercase'] });
const logout = rule({ identifier_name: 'registered', sdk_call: 'anonymize', trigger_text: 'Log out.', identity_type: 'soft' });
const props: CustomerPropertyForCodegen[] = [
  { name: 'email', bloomreach_customer_property: 'email' },
  { name: 'phone', bloomreach_customer_property: 'phone' },
  { name: 'note' },
];

describe('identify in four forms', () => {
  const s = buildIdentityCodegen([rule({ identifier_name: 'registered', transformations_json: ['trim', 'lowercase'] })], props).identify;
  it('web_sdk is brweb.identify, legacy is exponea.identify, both with transformations', () => {
    expect(s.web_sdk).toContain('brweb.identify(String(registered).trim().toLowerCase());');
    expect(s.web_sdk_legacy).toContain('exponea.identify(String(registered).trim().toLowerCase());');
    expect(s.web_sdk).not.toContain('exponea');
  });
  it('tracking_api is a customers body with customer_ids and properties', () => {
    expect(s.tracking_api).toContain('POST /track/v2/projects/{project_token}/customers');
    expect(JSON.parse(s.tracking_api.slice(s.tracking_api.indexOf('{\n')))).toEqual({ customer_ids: { registered: '<registered>' }, properties: {} });
  });
  it('gtm_datalayer is a bloomreach.identify dataLayer push plus the template note', () => {
    expect(s.gtm_datalayer).toContain('window.dataLayer.push({');
    expect(s.gtm_datalayer).toContain("event: 'bloomreach_identify',");
    expect(s.gtm_datalayer).toContain('identify: {');
    expect(s.gtm_datalayer).toContain('registered: String(registered).trim().toLowerCase(),');
    expect(s.gtm_datalayer).toContain('shared E3 GTM template');
  });
  it('an object form for several ids with a cookie in the API body', () => {
    const many = buildIdentityCodegen([rule({ identifier_name: 'cookie', identity_type: 'soft', sdk_call: null }), email], []).identify;
    expect(many.web_sdk).toContain('brweb.identify({');
    expect(many.web_sdk).toContain('email_id: String(emailId).trim().toLowerCase(),');
    expect(many.tracking_api).toContain('"cookie": "<cookie>"');
    expect(many.tracking_api).toContain('"email_id": "<email_id>"');
  });
  it('no hard rules gives a comment in every form', () => {
    const none = buildIdentityCodegen([], []).identify;
    for (const v of Object.values(none)) expect(v).toMatch(/^\/\/ No hard identity rules/);
  });
});

describe('update in four forms', () => {
  const s = buildIdentityCodegen([email], props).update;
  it('maps customer attributes in every form', () => {
    expect(s.web_sdk).toContain('brweb.update({');
    expect(s.web_sdk).toContain('phone: phone, // special attribute, E.164 format');
    expect(s.web_sdk_legacy).toContain('exponea.update({');
    expect(JSON.parse(s.tracking_api.slice(s.tracking_api.indexOf('{\n')))).toEqual({
      customer_ids: { email_id: '<email_id>' },
      properties: { email: '<email>', phone: '<phone>' },
    });
    expect(s.gtm_datalayer).toContain("event: 'bloomreach_update',");
    expect(s.gtm_datalayer).toContain('email: email, // special attribute');
    expect(s.web_sdk).not.toContain('note');
  });
  it('says so when nothing is mapped', () => {
    for (const v of Object.values(buildIdentityCodegen([], []).update)) expect(v).toContain('No customer properties mapped');
  });
});

describe('anonymize in four forms', () => {
  const s = buildIdentityCodegen([logout, email], []).anonymize;
  it('SDK forms call anonymize, the API form uses the anonymize endpoint, GTM pushes anonymize', () => {
    expect(s.web_sdk).toBe('// Logout: Log out\nbrweb.anonymize();');
    expect(s.web_sdk_legacy).toBe('// Logout: Log out\nexponea.anonymize();');
    expect(s.tracking_api).toContain('POST /data/v2/projects/{project_token}/customers/anonymize');
    expect(s.tracking_api).toContain('"email_id": "<email_id>"');
    expect(s.gtm_datalayer).toContain('anonymize: true,');
    expect(s.gtm_datalayer).toContain("event: 'bloomreach_anonymize',");
  });
  it('no logout rule gives the placeholder', () => {
    for (const v of Object.values(buildIdentityCodegen([email], []).anonymize)) expect(v).toBe('// No logout (anonymize) rule configured.');
  });
});

describe('standalone calls (D-67 amendment 1) in every form', () => {
  const web = rule({ identifier_name: 'cart_id', identity_type: 'soft', binds: ['cart_id', 'cookie'], standalone_on: 'The checkout page loads.' });
  const server = rule({ identifier_name: 'cart_id', identity_type: 'soft', binds: ['cart_id'], standalone_on: 'Checkout', standalone_server: true });
  const cookieOnly = rule({ identifier_name: 'cookie', identity_type: 'soft', binds: ['cookie'], standalone_on: 'First page view of a new visitor.' });

  it('a web call gets a commented block with trigger phrasing in web, legacy, GTM and API forms', () => {
    const s = buildIdentityCodegen([web], []).identify;
    expect(s.web_sdk).toContain('// Standalone identify call when the checkout page loads: binds cart_id, cookie');
    expect(s.web_sdk).toContain('brweb.identify({');
    expect(s.web_sdk).toContain('cart_id: cartId,');
    expect(s.web_sdk).not.toContain('cookie:');
    expect(s.web_sdk).not.toContain('No hard identity rules');
    expect(s.web_sdk_legacy).toContain('exponea.identify({');
    expect(s.gtm_datalayer).toContain('// Standalone identify push when the checkout page loads: binds cart_id, cookie');
    expect(s.gtm_datalayer).toContain('cart_id: cartId,');
    expect(s.tracking_api).toContain('// Standalone identify call');
    expect(s.tracking_api).toContain('"cookie": "<cookie>"');
  });

  it('a Tracking API source gets the server-side form instead of an SDK call', () => {
    const s = buildIdentityCodegen([server], []).identify;
    for (const v of [s.web_sdk, s.web_sdk_legacy, s.gtm_datalayer]) {
      expect(v).toContain('// Standalone server-side identification on checkout: binds cart_id');
      expect(v).toContain('there is no SDK identify call');
      expect(v).not.toMatch(/\.identify\(\{/);
    }
    expect(s.tracking_api).toContain('"cart_id": "<cart_id>"');
  });

  it('a cookie-only call produces no empty identify block', () => {
    const s = buildIdentityCodegen([cookieOnly], []).identify;
    for (const k of ['web_sdk', 'web_sdk_legacy', 'gtm_datalayer'] as const) {
      expect(s[k]).not.toContain('identify({\n});');
      expect(s[k]).not.toContain('identify: {\n');
    }
  });

  it('a hard standalone rule is emitted once, not also in the plain block', () => {
    const hard = rule({ identifier_name: 'email_id', binds: ['email_id', 'cookie'], standalone_on: 'login' });
    const s = buildIdentityCodegen([hard], []).identify;
    expect(s.web_sdk.match(/brweb\.identify\(/g)).toHaveLength(1);
  });
});
