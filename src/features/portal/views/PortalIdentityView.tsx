/**
 * Portal Identity view (T-5-42): the identifiers, the identification flow (through
 * `PortalIdentificationFlow`, the slot for `IdentificationFlowView`), the shared `IdentityView`
 * rules table and the identity codegen. `identity/<rule id>` marks that rule (a comment link).
 */
import React, { useMemo } from 'react';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { HintTh } from '@/src/components/ui/FieldHint';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { IdentityCodegenTabs } from '@/src/features/shared/IdentityCodegenTabs';
import { IdentityView, identityRowsFromDocument } from '@/src/features/views';
import { usePortal } from '../PortalContext';
import { Collaboration, PortalPage, useCommentCount } from '../PortalParts';
import { PortalIdentificationFlow } from '../identityFlowSlot';

function Identifiers() {
  const { summary } = usePortal();
  const identifiers = summary.identifiers ?? [];
  if (identifiers.length === 0) return null;
  return (
    <section className="space-y-2" data-testid="shared-identifiers">
      <h2 className="text-base font-semibold text-gray-900">Identifiers</h2>
      <div role="region" aria-label="Identifiers table" tabIndex={0} className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['Name', 'Type', 'Description', 'Cookie'].map((h) => (
                <HintTh scope="col" key={h} className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">{h}</HintTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {identifiers.map((i) => (
              <tr key={i.name} className="align-top">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-900">
                    <SHARED_SECTION_ICONS.identity size={14} className="shrink-0" aria-hidden="true" />
                    {i.name}
                    <CopyNameButton name={i.name} />
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{i.type === 'hard' ? 'Hard ID' : 'Soft ID'}</td>
                <td className="px-3 py-2 text-gray-700 [overflow-wrap:anywhere]">{i.description ?? '—'}</td>
                <td className="px-3 py-2 text-gray-600">{i.is_cookie ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Codegen() {
  const { summary } = usePortal();
  const codegen = summary.identity_codegen;
  if (!codegen) return null;
  return (
    <section className="space-y-2" data-testid="shared-identity-codegen">
      <h2 className="text-base font-semibold text-gray-900">Code</h2>
      {(['identify', 'update', 'anonymize'] as const).map((k) => (
        <div key={k}>
          <h3 className="text-sm font-semibold text-gray-900">{k}</h3>
          <IdentityCodegenTabs snippets={codegen[k]} />
        </div>
      ))}
    </section>
  );
}

export function PortalIdentityView() {
  const { summary, location } = usePortal();
  const commentCount = useCommentCount();
  const rows = useMemo(() => identityRowsFromDocument(summary), [summary]);
  return (
    <PortalPage view="identity" count={rows.length}>
      <IdentityView
        rows={rows}
        readOnly
        highlightId={location.id}
        commentCount={(row) => commentCount('identity_rule', row.id)}
        commentsInActions
        rowActions={(row) => <Collaboration entityType="identity_rule" entityId={row.id} label={row.name} />}
        flow={
          <>
            <Identifiers />
            <PortalIdentificationFlow doc={summary} />
          </>
        }
        codegen={<Codegen />}
        empty={{ message: 'No identity rules in this tracking plan.' }}
      />
    </PortalPage>
  );
}
