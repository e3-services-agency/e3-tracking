import { describe, expect, it } from 'vitest';
import { codegenTabsFor, hasCodegen, normalizeMethod, type CodegenData } from './codegenMethodTabs';

const full: CodegenData = {
  gtm: 'gtm',
  datalayer: 'dl',
  gtm_template: 'tpl',
  web_sdk: 'sdk',
  web_sdk_legacy: 'legacy',
  tracking_api: 'api',
  sdk_emits: '',
  sdk_default_properties: '',
  note: '',
};

describe('codegenTabsFor (D-63)', () => {
  it('client_web: GTM / dataLayer, Web SDK, Web SDK legacy, Tracking API', () => {
    expect(codegenTabsFor(full, 'client_web').map((t) => t.label)).toEqual([
      'GTM / dataLayer',
      'Web SDK',
      'Web SDK (legacy)',
      'Tracking API',
    ]);
  });

  it('server_api: only the Tracking API', () => {
    expect(codegenTabsFor({ ...full, gtm: '', web_sdk: '', web_sdk_legacy: '' }, 'server_api').map((t) => t.key)).toEqual(['tracking_api']);
    // Even if the other snippets were present the method decides.
    expect(codegenTabsFor(full, 'server_api').map((t) => t.key)).toEqual(['tracking_api']);
  });

  it('sdk_auto: emitting call and SDK default properties, no tracking snippet', () => {
    const sdk: CodegenData = { ...full, gtm: '', web_sdk: '', web_sdk_legacy: '', tracking_api: '', sdk_emits: 'e', sdk_default_properties: 'd' };
    expect(codegenTabsFor(sdk, 'sdk_auto').map((t) => t.key)).toEqual(['sdk_emits', 'sdk_default_properties']);
  });

  it('older documents without a method or the new keys still show their three tabs', () => {
    const old: CodegenData = { gtm: 'a', web_sdk: 'b', tracking_api: 'c' };
    expect(codegenTabsFor(old, undefined).map((t) => t.key)).toEqual(['gtm', 'web_sdk', 'tracking_api']);
    expect(normalizeMethod('nonsense')).toBe('client_web');
  });

  it('hasCodegen is false when nothing applies', () => {
    expect(hasCodegen({ gtm: '', web_sdk: '', tracking_api: '' }, 'client_web')).toBe(false);
    expect(hasCodegen(full, 'client_web')).toBe(true);
  });
});
