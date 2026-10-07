/**
 * Settings: project settings form, plus the CSV export block (D-18 pulled forward — the
 * custom-field builder and CSV import/export ran against the always-empty legacy store, so they
 * were dropped from the old page rather than carried into the new model; CSV export per entity
 * comes back server-side in phase 3, T-3-03, D-46).
 */
import React from 'react';
import { FORM_CARD_WIDTH_CLASS, PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { ProjectSettings } from '@/src/features/projects/pages/ProjectSettings';
import { CsvExportBlock } from '@/src/features/projects/components/CsvExportBlock';
import { IdentifiersBlock } from '@/src/features/projects/components/IdentifiersBlock';
import { BackupExportBlock } from '@/src/features/projects/components/BackupExportBlock';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';

export function Settings() {
  const { activeProjectId } = useProjectShell();
  return (
    <div className="flex-1 flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Project and Bloomreach identifiers.</p>
      </PageHeader>
      <PageBody>
      <div className={`space-y-8 ${FORM_CARD_WIDTH_CLASS}`}>
        <ProjectSettings />
        <IdentifiersBlock projectId={activeProjectId} />
        <CsvExportBlock projectId={activeProjectId} />
        <BackupExportBlock projectId={activeProjectId} />
      </div>
      </PageBody>
    </div>
  );
}
