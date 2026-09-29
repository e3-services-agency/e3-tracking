/**
 * Implementation tabs per implementation method (D-63, T-4-17). Pure, so the tab choice is unit
 * tested without rendering. `client_web` shows the dataLayer / GTM template, both Web SDKs and the
 * Tracking API; `server_api` only the Tracking API; `sdk_auto` the emitting call and the SDK
 * default properties. Tabs with no code are dropped (older documents carry only `gtm`, `web_sdk`,
 * `tracking_api`). Kept apart from `viewHelpers.ts`, which still exports the phase 4 tab list.
 */
import { IMPLEMENTATION_METHODS, type ImplementationMethod } from '../../domain/enums';

export type CodegenTabId =
  | 'gtm'
  | 'web_sdk'
  | 'web_sdk_legacy'
  | 'tracking_api'
  | 'sdk_emits'
  | 'sdk_default_properties';

/** The `codegen` block of an event card; only the three original keys are guaranteed. */
export interface CodegenData {
  gtm: string;
  web_sdk: string;
  tracking_api: string;
  datalayer?: string;
  gtm_template?: string;
  web_sdk_legacy?: string;
  sdk_emits?: string;
  sdk_default_properties?: string;
  note?: string;
}

export interface CodegenTabDef {
  key: CodegenTabId;
  label: string;
  language: 'javascript' | 'json' | 'typescript';
}

const ALL_TABS: Record<CodegenTabId, CodegenTabDef> = {
  gtm: { key: 'gtm', label: 'GTM / dataLayer', language: 'javascript' },
  web_sdk: { key: 'web_sdk', label: 'Web SDK', language: 'javascript' },
  web_sdk_legacy: { key: 'web_sdk_legacy', label: 'Web SDK (legacy)', language: 'javascript' },
  tracking_api: { key: 'tracking_api', label: 'Tracking API', language: 'typescript' },
  sdk_emits: { key: 'sdk_emits', label: 'Emitted by', language: 'javascript' },
  sdk_default_properties: { key: 'sdk_default_properties', label: 'SDK default properties', language: 'javascript' },
};

const TABS_BY_METHOD: Record<ImplementationMethod, CodegenTabId[]> = {
  client_web: ['gtm', 'web_sdk', 'web_sdk_legacy', 'tracking_api'],
  server_api: ['tracking_api'],
  sdk_auto: ['sdk_emits', 'sdk_default_properties'],
};

export function normalizeMethod(method: string | null | undefined): ImplementationMethod {
  return (IMPLEMENTATION_METHODS as readonly string[]).includes(method ?? '') ? (method as ImplementationMethod) : 'client_web';
}

/** The tabs to show for `method`, in order, without the ones that have no code. */
export function codegenTabsFor(codegen: CodegenData, method: string | null | undefined): CodegenTabDef[] {
  return TABS_BY_METHOD[normalizeMethod(method)]
    .filter((id) => ((codegen[id] as string | undefined) ?? '').trim() !== '')
    .map((id) => ALL_TABS[id]);
}

/** True when any tab would have code (drives whether the shared view renders the block at all). */
export function hasCodegen(codegen: CodegenData, method?: string | null): boolean {
  // An sdk_auto event with no default properties has nothing to implement: the shared view hides
  // the block (the internal card still renders it, with the note).
  if (normalizeMethod(method) === 'sdk_auto') return (codegen.sdk_default_properties ?? '').trim() !== '';
  return codegenTabsFor(codegen, method).length > 0;
}
