/**
 * Source system and collection method (D-62, T-4-11B): display labels, the "System via method" line
 * and the method -> implementation method mapping. Pure; the allowed values live in `enums.ts`.
 */
import type { ImplementationMethod, SourceMethod, SourceSystem } from './enums';

export const SOURCE_SYSTEM_LABELS: Record<SourceSystem, string> = {
  shopify: 'Shopify',
  magento: 'Magento',
  salesforce_commerce_cloud: 'Salesforce Commerce Cloud',
  custom_backend: 'Custom backend',
  mobile_app: 'Mobile app',
  crm: 'CRM',
  erp: 'ERP',
  other: 'Other',
};

export const SOURCE_METHOD_LABELS: Record<SourceMethod, string> = {
  web_sdk_gtm_datalayer: 'GTM data layer',
  web_sdk_direct: 'Web SDK (direct)',
  tracking_api: 'Tracking API',
  bloomreach_integration: 'Bloomreach integration',
  file_import: 'File import',
};

export function sourceSystemLabel(system: string | null | undefined): string {
  if (!system) return SOURCE_SYSTEM_LABELS.other;
  return (SOURCE_SYSTEM_LABELS as Record<string, string>)[system] ?? system;
}

export function sourceMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return (SOURCE_METHOD_LABELS as Record<string, string>)[method] ?? method;
}

/** "Shopify via GTM data layer", or just "Shopify" when the source records no method (D-62). */
export function sourceViaLabel(system: string | null | undefined, method: string | null | undefined): string {
  const m = sourceMethodLabel(method);
  return m ? `${sourceSystemLabel(system)} via ${m}` : sourceSystemLabel(system);
}

/**
 * The D-63 implementation method a source's collection method implies, or `null` when it implies
 * none (a Bloomreach integration or a file import is neither a client-side nor a Tracking API call).
 */
export function implementationMethodForSourceMethod(method: string | null | undefined): ImplementationMethod | null {
  if (method === 'web_sdk_gtm_datalayer' || method === 'web_sdk_direct') return 'client_web';
  if (method === 'tracking_api') return 'server_api';
  return null;
}
