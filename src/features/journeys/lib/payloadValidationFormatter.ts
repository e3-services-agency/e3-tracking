import type { ValidatePayloadResult } from '@/src/features/journeys/hooks/useJourneysApi';
import type { QAProof, QARun, QAVerification } from '@/src/types';

/**
 * Mirrors the editor payload validation summary in JourneyCanvas (Trigger QA):
 * prefix line + list items from issues / missing_keys.
 */
export function formatPayloadValidationForDisplay(
  result: ValidatePayloadResult
): { prefix: string; items: string[] } {
  if (result.valid) {
    return { prefix: 'Payload valid.', items: [] };
  }

  const prefix =
    result.error_type === 'missing_keys'
      ? 'Missing required keys:'
      : result.error_type === 'invalid_types'
        ? 'Invalid property types:'
        : 'Invalid payload:';

  const items = (result.issues ?? result.missing_keys ?? []).map((x) => String(x));
  return { prefix, items };
}

/**
 * Reconstruct a ValidatePayloadResult from persisted proof issue strings so we can
 * run the same formatter as the editor when error_type was not stored.
 */
export function inferValidationResultFromPersistedIssues(
  issues: string[]
): ValidatePayloadResult {
  const cleaned = issues.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { valid: false };
  }

  const allBareKeys = cleaned.every((k) => {
    return !/\s/.test(k) && /^[A-Za-z0-9_]+$/.test(k);
  });
  if (allBareKeys) {
    return { valid: false, error_type: 'missing_keys', missing_keys: cleaned };
  }

  const looksLikeTypes = cleaned.every(
    (t) => t.includes('must be') || t.startsWith('Property "')
  );
  if (looksLikeTypes) {
    return { valid: false, error_type: 'invalid_types', issues: cleaned };
  }

  return { valid: false, issues: cleaned };
}

function formatProofIssuesForExport(p: QAProof): QAProof {
  if (!p) return p;
  if (p.validation_status === 'pass') return p;
  if (!Array.isArray(p.validation_issues) || p.validation_issues.length === 0) return p;
  const inferred = inferValidationResultFromPersistedIssues(p.validation_issues);
  const { prefix, items } = formatPayloadValidationForDisplay({ ...inferred, valid: false });
  return { ...p, validation_issues: [prefix, ...items] };
}

/**
 * Rewrites proof.validation_issues so shared export HTML can render the same prefix + list
 * layout as the editor (see JourneyCanvas Trigger QA validation block).
 */
export function withFormattedPayloadValidationIssuesForExport(qaRun: QARun): QARun {
  const verifications: Record<string, QAVerification> = { ...(qaRun.verifications || {}) };
  for (const [nodeId, v] of Object.entries(verifications)) {
    const proofs = Array.isArray(v.proofs)
      ? v.proofs.map(formatProofIssuesForExport)
      : v.proofs;
    verifications[nodeId] = { ...v, proofs };
  }
  return { ...qaRun, verifications };
}

/** Run-level summary for shared QA Run details (computed only; not persisted). */
export interface PayloadValidationRunSummary {
  headline: string;
  lines: string[];
}

function oneLineFromProofIssues(p: QAProof): string {
  const issues = p.validation_issues;
  if (!issues?.length) return 'Validation could not be completed.';
  const inferred = inferValidationResultFromPersistedIssues(issues);
  const { prefix, items } = formatPayloadValidationForDisplay({ ...inferred, valid: false });
  return items.length ? `${prefix} ${items.join(', ')}`.trim() : prefix;
}

/**
 * Aggregates payload validation across all proofs in the run for a compact Run Details line.
 * Uses the same infer + format path as proof cards.
 */
export function computePayloadValidationRunSummary(
  qaRun: QARun
): PayloadValidationRunSummary | null {
  let failed = 0;
  let passed = 0;
  let unknown = 0;
  const lineSet = new Set<string>();

  const verifications = qaRun.verifications || {};
  for (const v of Object.values(verifications)) {
    const proofs = v?.proofs;
    if (!Array.isArray(proofs)) continue;
    for (const p of proofs) {
      if (!p) continue;
      const hasIssues = Array.isArray(p.validation_issues) && p.validation_issues.length > 0;
      const st = p.validation_status;
      const hasEvidence =
        st === 'pass' || st === 'fail' || st === 'unknown' || hasIssues;
      if (!hasEvidence) continue;

      if (st === 'pass') {
        passed++;
        continue;
      }
      if (st === 'unknown') {
        unknown++;
        if (hasIssues) lineSet.add(oneLineFromProofIssues(p));
        continue;
      }
      if (st === 'fail' || (!st && hasIssues)) {
        failed++;
        lineSet.add(oneLineFromProofIssues(p));
      }
    }
  }

  if (failed === 0 && passed === 0 && unknown === 0) return null;

  const lines = [...lineSet].slice(0, 3);

  if (failed === 0 && unknown === 0 && passed > 0) {
    return { headline: 'Payload validation: All checks passed', lines: [] };
  }

  const parts: string[] = [];
  if (failed > 0) parts.push(failed === 1 ? '1 failed' : `${failed} failed`);
  if (unknown > 0) parts.push(unknown === 1 ? '1 not verified' : `${unknown} not verified`);
  const headline = 'Payload validation: ' + parts.join(', ');
  return { headline, lines };
}
