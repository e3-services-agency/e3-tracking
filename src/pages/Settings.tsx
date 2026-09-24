/**
 * Settings: project settings form only (D-18 pulled forward — the custom-field builder and
 * CSV import/export ran against the always-empty legacy store, so they are dropped here rather
 * than carried into the new model; T-1-03 was going to remove them anyway). CSV export per
 * entity comes back server-side in phase 3 (D-18).
 */
import React from 'react';
import { ProjectSettings } from '@/src/features/projects/pages/ProjectSettings';

export function Settings() {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Project and Bloomreach identifiers.</p>
        </div>
        <ProjectSettings />
      </div>
    </div>
  );
}
