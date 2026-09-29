/**
 * T-4-09 project home checklist: `GET /api/projects/:id/getting-started` computes each step's
 * done/not-done state straight from the data (no separate "progress" table to keep in sync), so a
 * step that becomes true through any path -- UI, MCP, a script -- is reflected immediately.
 *
 * "Comparison run" (step 7) is intentionally coarse: any finding row at all (open or resolved) means
 * `runComparison` has executed against real observations at least once; there is no dedicated
 * "last run at" column to read instead (see `comparison.service.ts`).
 */
import { getDb } from '../db';
import * as ProjectDAL from '../dal/project.dal';
import * as FindingDAL from '../dal/finding.dal';
import * as UseCaseDAL from '../dal/use-case.dal';

export interface GettingStartedStep {
  key: string;
  label: string;
  sentence: string;
  done: boolean;
  /** Sidebar tab id the "go" link switches to (see `Layout.tsx`'s `mainRouteStateFromRestPath`). */
  tab: string;
}

export interface GettingStartedResult {
  steps: GettingStartedStep[];
  complete: boolean;
}

function hasChangeLogSource(projectId: string, source: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM change_log WHERE project_id = ? AND source = ? LIMIT 1')
    .get(projectId, source);
  return !!row;
}

function hasAnyObservation(projectId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM observations WHERE project_id = ? LIMIT 1')
    .get(projectId);
  return !!row;
}

function hasAnyFinding(projectId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM findings WHERE project_id = ? LIMIT 1').get(projectId);
  return !!row;
}

export function getGettingStarted(projectId: string): GettingStartedResult {
  const project = ProjectDAL.getProjectOrThrow(projectId);

  const openTypeMismatches = FindingDAL.listFindings(projectId, { kind: 'type_mismatch', status: 'open' });
  const useCases = UseCaseDAL.listUseCases(projectId);

  const steps: GettingStartedStep[] = [
    {
      key: 'client_and_project',
      label: 'Create a client and a project',
      sentence: 'Every project belongs to a Bloomreach account (client); you already have both.',
      done: true,
      tab: 'clients',
    },
    {
      key: 'data_mapping_imported',
      label: 'Import the data mapping',
      sentence: "Paste Bloomreach's data-mapping.json to bring in your events, properties and catalogs.",
      done: !!project.bloomreach_mapping_meta_json || hasChangeLogSource(projectId, 'import:data-mapping'),
      tab: 'import',
    },
    {
      key: 'expiration_settings_imported',
      label: 'Import expiration settings',
      sentence: 'Paste expiration-settings.json so property and event retention shows up on the cards.',
      done: hasChangeLogSource(projectId, 'import:expiration-settings'),
      tab: 'import',
    },
    {
      key: 'property_types_reviewed',
      label: 'Review property types',
      sentence: 'Resolve any open type mismatch findings so property types match what Bloomreach expects.',
      done: openTypeMismatches.length === 0,
      tab: 'findings',
    },
    {
      key: 'data_manager_files_imported',
      label: 'Import Data Manager files',
      sentence: 'Import both data-manager-customers.json and data-manager-events.json to compare against the live Data Manager.',
      done: !!project.data_manager_customers_json && !!project.data_manager_events_json,
      tab: 'import',
    },
    {
      key: 'observations_captured',
      label: 'Capture observations',
      sentence: 'Record a QA run with real customer events so the tool can compare definitions against reality.',
      done: hasAnyObservation(projectId),
      tab: 'qaRuns',
    },
    {
      key: 'comparison_run',
      label: 'Run a comparison',
      sentence: 'Run the comparisons to surface gaps between the definition, the mapping and what was observed.',
      done: hasAnyFinding(projectId),
      tab: 'findings',
    },
    {
      key: 'use_case_instantiated',
      label: 'Add a use case',
      sentence: 'Pick a template from the use case library and add it to your project, matching it to your events and properties.',
      done: useCases.length > 0,
      tab: 'useCaseTemplates',
    },
    {
      key: 'share_link_created',
      label: 'Create a share link',
      sentence: 'Generate a read-only link so the client can see the documentation without a login.',
      done: !!project.share_token,
      tab: 'settings',
    },
  ];

  return { steps, complete: steps.every((s) => s.done) };
}
