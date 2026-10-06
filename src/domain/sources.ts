/**
 * Source system and collection method (D-62, T-4-11B): display labels, the "System via method" line
 * and the method -> implementation method mapping. Pure; the allowed values live in `enums.ts`.
 */
import { SOURCE_COLORS, type ImplementationMethod, type SourceColor, type SourceMethod, type SourceSystem } from './enums';

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

/** D-68: the stable system -> palette token map used for auto-assignment (mirrors migration 0030's backfill). */
export const SOURCE_SYSTEM_COLORS: Record<SourceSystem, SourceColor> = {
  shopify: 'source-1',
  magento: 'source-2',
  salesforce_commerce_cloud: 'source-3',
  custom_backend: 'source-4',
  mobile_app: 'source-5',
  crm: 'source-6',
  erp: 'source-7',
  other: 'source-8',
};

/** Display names for the palette tokens (dropdown labels). */
export const SOURCE_COLOR_LABELS: Record<SourceColor, string> = {
  'source-1': 'Blue',
  'source-2': 'Orange',
  'source-3': 'Green',
  'source-4': 'Purple',
  'source-5': 'Pink',
  'source-6': 'Teal',
  'source-7': 'Amber',
  'source-8': 'Gray',
};

export function isSourceColor(value: unknown): value is SourceColor {
  return typeof value === 'string' && (SOURCE_COLORS as readonly string[]).includes(value);
}

/**
 * D-68: the colour a new source gets: the system's own token unless another source already uses it,
 * then the first unused token, then the system's token again when all eight are taken.
 */
export function pickSourceColor(system: string | null | undefined, usedColors: readonly (string | null)[]): SourceColor {
  const preferred = (SOURCE_SYSTEM_COLORS as Record<string, SourceColor>)[system ?? 'other'] ?? SOURCE_SYSTEM_COLORS.other;
  const used = new Set(usedColors);
  if (!used.has(preferred)) return preferred;
  return SOURCE_COLORS.find((c) => !used.has(c)) ?? preferred;
}
