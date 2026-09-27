/**
 * Settings: project settings form, plus the CSV export block (D-18 pulled forward — the
 * custom-field builder and CSV import/export ran against the always-empty legacy store, so they
 * were dropped from the old page rather than carried into the new model; CSV export per entity
 * comes back server-side in phase 3, T-3-03, D-46).
 */
import React from 'react';
import { ProjectSettings } from '@/src/features/projects/pages/ProjectSettings';
import { CsvExportBlock } from '@/src/features/projects/components/CsvExportBlock';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';

export function Settings() {
  const { activeProjectId } = useProjectShell();
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Project and Bloomreach identifiers.</p>
        </div>
        <ProjectSettings />
        <CsvExportBlock projectId={activeProjectId} />
      </div>
    </div>
  );
}
