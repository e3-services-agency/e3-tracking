import { describe, expect, it } from 'vitest';
import { SOURCE_METHODS, SOURCE_SYSTEMS } from './enums';
import {
  SOURCE_METHOD_LABELS,
  SOURCE_SYSTEM_LABELS,
  implementationMethodForSourceMethod,
  sourceViaLabel,
} from './sources';

describe('source labels (D-62)', () => {
  it('has a label for every system and method', () => {
    expect(Object.keys(SOURCE_SYSTEM_LABELS).sort()).toEqual([...SOURCE_SYSTEMS].sort());
    expect(Object.keys(SOURCE_METHOD_LABELS).sort()).toEqual([...SOURCE_METHODS].sort());
  });

  it('formats "System via method"', () => {
    expect(sourceViaLabel('shopify', 'web_sdk_gtm_datalayer')).toBe('Shopify via GTM data layer');
    expect(sourceViaLabel('custom_backend', 'tracking_api')).toBe('Custom backend via Tracking API');
    expect(sourceViaLabel('crm', null)).toBe('CRM');
    expect(sourceViaLabel(null, null)).toBe('Other');
  });

  it('maps the collection method to an implementation method', () => {
    expect(implementationMethodForSourceMethod('web_sdk_gtm_datalayer')).toBe('client_web');
    expect(implementationMethodForSourceMethod('web_sdk_direct')).toBe('client_web');
    expect(implementationMethodForSourceMethod('tracking_api')).toBe('server_api');
    expect(implementationMethodForSourceMethod('file_import')).toBeNull();
    expect(implementationMethodForSourceMethod('bloomreach_integration')).toBeNull();
    expect(implementationMethodForSourceMethod(null)).toBeNull();
  });
});
