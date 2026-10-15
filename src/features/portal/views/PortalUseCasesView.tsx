/**
 * Portal Use cases view (T-5-42): the shared `UseCasesTable`, and a use case's own page at
 * `use-cases/<code-or-id>` with its narrative and requirements, each requirement with its own
 * comments. T-5-44 refines the detail page.
 */
import React, { useMemo } from 'react';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { CopyNameButton } from '@/src/components/ui/CopyNameButton';
import { HintTh } from '@/src/components/ui/FieldHint';
import { MarkdownView } from '@/src/components/ui/MarkdownView';
import { ENTITY_ICONS, type EntityKind } from '@/src/components/layout/navIcons';
import { enumLabelOr } from '@/src/domain/enumLabels';
import { useCaseToMarkdown } from '@/src/domain/document/markdown';
import type { TrackingDocumentUseCase } from '@/src/domain/document/trackingDocument';
import { requirementTargetView } from '@/src/features/shared/requirementTargets';
import { useCasePreview } from '@/src/features/shared/useCasePreview';
import { USE_CASE_TYPE_LABELS } from '@/src/features/shared/viewHelpers';
import { UseCasesTable, useCaseRowsFromDocument } from '@/src/features/views';
import { usePortal } from '../PortalContext';
import { Collaboration, CopyPortalLink, LINK_CLASS, NotInShare, PortalLink, PortalPage, useCommentCount } from '../PortalParts';
import { targetForAnchorHref } from '../portalModel';

export function PortalUseCasesView() {
  const { location } = usePortal();
  return location.id ? <PortalUseCaseDetail key={location.id} pathId={location.id} /> : <PortalUseCasesList />;
}

function PortalUseCasesList() {
  const { summary, navigate, index } = usePortal();
  const commentCount = useCommentCount();
  // The list shows a bounded plain preview of the narrative; the full Markdown is on the use case's page.
  const rows = useMemo(() => useCaseRowsFromDocument(summary).map((row) => ({ ...row, description: row.description ? useCasePreview(row.description) : null })), [summary]);
  const target = (id: string) => ({ view: 'use-cases' as const, id: index.useCasePathIdById.get(id) ?? id });
  return (
    <PortalPage view="use-cases" count={rows.length}>
      <UseCasesTable
        rows={rows}
        readOnly
        onOpen={(row) => navigate(target(row.id))}
        commentCount={(row) => commentCount('use_case', row.id)}
        commentsInActions
        rowActions={(row) => (
          <>
            <Collaboration entityType="use_case" entityId={row.id} label={`use case ${row.name}`} />
            <CopyPortalLink target={target(row.id)} label={row.name} />
          </>
        )}
        empty={{ message: 'No use cases in this tracking plan.' }}
      />
    </PortalPage>
  );
}

type Requirement = TrackingDocumentUseCase['requirements'][number];

/** A requirement's target with its event and property parts linked where they resolve (T-4-22). */
function RequirementTarget({ requirement }: { requirement: Requirement }) {
  const { refIndex, index } = usePortal();
  const v = requirementTargetView(requirement, refIndex);
  const Icon = ENTITY_ICONS[requirement.target_kind as EntityKind] ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {v.typeLabel && (
        <span data-testid="target-type" className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {Icon && <Icon size={14} aria-hidden="true" />}
          {v.typeLabel}
        </span>
      )}
      <span>
        {v.parts.map((p, i) => {
          const target = p.anchor ? targetForAnchorHref(p.anchor, index) : null;
          return (
            <React.Fragment key={i}>
              {i > 0 && '.'}
              {target ? <PortalLink to={target}>{p.text}</PortalLink> : p.text}
            </React.Fragment>
          );
        })}
      </span>
    </span>
  );
}

function PortalUseCaseDetail({ pathId }: { pathId: string }) {
  const { summary, index } = usePortal();
  const id = index.useCaseIdByPathId.get(pathId);
  const uc = summary.use_cases.find((u) => u.id === id);
  if (!uc) return <NotInShare view="use-cases" />;
  const title = `${uc.code ? `${uc.code} — ` : ''}${uc.name}`;
  return (
    <PortalPage
      view="use-cases"
      back
      title={title}
      actions={
        <>
          <Collaboration entityType="use_case" entityId={uc.id} label={`use case ${uc.name}`} />
          <CopyMarkdownButton iconOnly getMarkdown={() => useCaseToMarkdown(uc)} label={`Copy use case ${uc.name} as Markdown`} />
          <CopyPortalLink target={{ view: 'use-cases', id: pathId }} label={uc.name} />
          <CopyNameButton name={uc.name} />
        </>
      }
      notes={
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {uc.type && <span>{USE_CASE_TYPE_LABELS[uc.type] ?? uc.type}</span>}
          {uc.status && <span>{enumLabelOr('status', uc.status)}</span>}
          {uc.documentation_url && (
            <a href={uc.documentation_url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              Documentation
            </a>
          )}
        </div>
      }
    >
      {uc.narrative && <div className="max-w-3xl"><MarkdownView source={uc.narrative} /></div>}
      <section aria-label="Requirements" className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Requirements ({uc.requirements.length})</h2>
        {uc.requirements.length === 0 ? (
          <p className="text-sm text-gray-500">No requirements yet.</p>
        ) : (
          <div role="region" aria-label="Requirements table" tabIndex={0} className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Target</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Level</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Status</HintTh>
                  <HintTh className="px-3 py-2 font-medium text-gray-500" hintScope="Shared">Actions</HintTh>
                </tr>
              </thead>
              <tbody className="divide-y">
                {uc.requirements.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 [overflow-wrap:anywhere]"><RequirementTarget requirement={r} /></td>
                    <td className="px-3 py-2">{enumLabelOr('level', r.level) || '—'}</td>
                    <td className="px-3 py-2">{enumLabelOr('status', r.status) || '—'}</td>
                    <td className="px-3 py-2"><Collaboration entityType="requirement" entityId={r.id} label="this requirement" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalPage>
  );
}
