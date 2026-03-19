import type { QARun, QAVerification, QAStatus } from '@/src/types';

export type DerivedQARunStatus = 'PASSED' | 'FAILED' | 'PENDING';

const QA_STATUS_VALUES: QAStatus[] = ['Pending', 'Passed', 'Failed'];

function isQAStatus(value: unknown): value is QAStatus {
  return QA_STATUS_VALUES.includes(value as QAStatus);
}

/**
 * Centralized naming formatter for QA Runs.
 * Required output format:
 *   "QA Run YYYY-MM-DD HH:MM"
 *
 * Uses local browser timezone for human-readable display.
 */
export function formatQARunName(timestamp: string | number | Date | null | undefined): string {
  const d = timestamp ? new Date(timestamp) : null;
  if (!d || Number.isNaN(d.getTime())) return 'QA Run (unknown time)';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  return `QA Run ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * Overall derived QA run status from a list of *step* verification statuses.
 *
 * Rules:
 * - FAILED has highest priority
 * - If no failed but some pending -> PENDING
 * - If all passed -> PASSED
 * - If empty/unknown -> PENDING
 */
export function computeQARunStatus(stepStatuses: Array<QAStatus | null | undefined>): DerivedQARunStatus {
  const normalized = stepStatuses.map((s) => (isQAStatus(s) ? s : 'Pending' as QAStatus));

  if (normalized.some((s) => s === 'Failed')) return 'FAILED';
  if (normalized.some((s) => s === 'Pending')) return 'PENDING';
  if (normalized.length > 0) return 'PASSED';
  return 'PENDING';
}

function getStepNodeIdsFromQARun(qaRun: QARun | null | undefined): string[] {
  if (!qaRun) return [];
  const nodes = Array.isArray(qaRun.nodes) ? qaRun.nodes : [];
  const ids: string[] = [];
  for (const n of nodes as any[]) {
    if (n?.type !== 'journeyStepNode') continue;
    if (typeof n?.id !== 'string' || !n.id.trim()) continue;
    ids.push(n.id);
  }
  return ids;
}

function getVerificationStatusForNode(qaRun: QARun, nodeId: string): QAStatus {
  const ver = qaRun.verifications?.[nodeId] as QAVerification | undefined;
  const s = ver?.status;
  return isQAStatus(s) ? s : 'Pending';
}

/**
 * Centralized overall derived status for a QA run.
 * Uses the run's saved node snapshot to determine which nodes are "steps".
 */
export function computeQARunStatusForRun(qaRun: QARun | null | undefined): DerivedQARunStatus {
  if (!qaRun) return 'PENDING';
  const stepNodeIds = getStepNodeIdsFromQARun(qaRun);
  if (stepNodeIds.length === 0) return 'PENDING';
  const statuses = stepNodeIds.map((id) => getVerificationStatusForNode(qaRun, id));
  return computeQARunStatus(statuses);
}

export function hasPendingStepsForRun(qaRun: QARun | null | undefined): boolean {
  if (!qaRun) return false;
  const stepNodeIds = getStepNodeIdsFromQARun(qaRun);
  if (stepNodeIds.length === 0) return false;
  return stepNodeIds.some((id) => getVerificationStatusForNode(qaRun, id) === 'Pending');
}

export function getQARunDisplayName(qaRun: QARun | null | undefined): string {
  if (!qaRun) return '';
  // Prefer createdAt (stable); fall back to stored name/id if missing.
  return formatQARunName(qaRun.createdAt ?? qaRun.name ?? qaRun.id);
}

