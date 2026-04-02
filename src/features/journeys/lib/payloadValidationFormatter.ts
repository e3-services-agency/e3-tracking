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
