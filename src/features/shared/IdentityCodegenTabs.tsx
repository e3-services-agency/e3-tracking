/**
 * Identity snippets (T-4-30): one identify / update / anonymize block in the same four tabs the event
 * card uses (GTM / dataLayer, Web SDK, Web SDK (legacy), Tracking API), through `CodegenTabs`.
 */
import React from 'react';
import { CodegenTabs } from './CodegenTabs';
import type { CodegenData } from './codegenMethodTabs';
import type { IdentityVariants } from '@/src/domain/codegen/identity';

export function identityToCodegenData(v: IdentityVariants): CodegenData {
  return { gtm: v.gtm_datalayer, web_sdk: v.web_sdk, web_sdk_legacy: v.web_sdk_legacy, tracking_api: v.tracking_api };
}

export function IdentityCodegenTabs({
  snippets,
  defaultOpen = false,
  sourceMethod,
}: {
  snippets: IdentityVariants;
  defaultOpen?: boolean;
  sourceMethod?: string | null;
}) {
  return <CodegenTabs codegen={identityToCodegenData(snippets)} method="client_web" sourceMethod={sourceMethod} defaultOpen={defaultOpen} />;
}
