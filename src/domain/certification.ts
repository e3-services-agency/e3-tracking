/**
 * Certification derivation (D-05, D-21, D-42, T-2-08, T-2-09 fix round, plan "Certification
 * derivation and display"): `certification(event) = {applicable: class == custom, certified,
 * reasons[]}`. Pure, no DB import (domain-model skill) -- `src/backend/services/document.service.ts`
 * gathers the inputs (event class/status, open and acknowledged error finding counts across every
 * comparison, whether the event has at least one observation in a non-archived run) and calls
 * `computeCertification`.
 *
 * `applicable: false` (an sdk/platform event, D-29/D-36) short-circuits to `certified: false` with
 * reason `not_applicable` -- the engine never validates sdk/platform events (D-29), so "certified"
 * has no meaning for them; they are never reported as certified nor as blocked by findings.
 *
 * D-42: a person resolving a finding by hand (the Findings page's Resolve toggle, T-2-09) is an
 * acknowledgement, not a fix -- it must not flip certification to `true` while the underlying
 * problem still reproduces. `acknowledgedErrorFindingCount` is counted and reported separately
 * (`acknowledged_errors: n`) and blocks certification exactly like `open_errors: n` does.
 */
export interface CertificationInput {
  /** `event.class === 'custom'` (D-29/D-36); every other reason only applies when this is `true`. */
  applicable: boolean;
  /** `event.status` (`EVENT_STATUSES`); `'ignored'` blocks certification. */
  status: string;
  /** Count of open, error-severity `Finding` rows for this event across every comparison (D-21). */
  openErrorFindingCount: number;
  /** Count of error-severity `Finding` rows a person resolved by hand (`resolved_by = 'user'`)
   * whose fingerprint still reproduced as of the last recompute (D-42); these are excluded from the
   * open list and from `EventCard.findings[]`, but still block certification. */
  acknowledgedErrorFindingCount: number;
  /** Whether at least one `Observation` in a non-archived `QaRun` resolves to this event. */
  hasObservation: boolean;
}

export interface Certification {
  applicable: boolean;
  certified: boolean;
  /**
   * What blocks certification, in a fixed check order so the same input always yields the same
   * reason list: `not_applicable` (sdk/platform event, exclusive -- no other reason is added),
   * `status_ignored`, `open_errors: n` (n = `openErrorFindingCount`),
   * `acknowledged_errors: n` (n = `acknowledgedErrorFindingCount`, D-42), `no_observations`. Empty
   * when `certified` is `true`.
   */
  reasons: string[];
}

export function computeCertification(input: CertificationInput): Certification {
  if (!input.applicable) {
    return { applicable: false, certified: false, reasons: ['not_applicable'] };
  }

  const reasons: string[] = [];
  if (input.status === 'ignored') reasons.push('status_ignored');
  if (input.openErrorFindingCount > 0) reasons.push(`open_errors: ${input.openErrorFindingCount}`);
  if (input.acknowledgedErrorFindingCount > 0) reasons.push(`acknowledged_errors: ${input.acknowledgedErrorFindingCount}`);
  if (!input.hasObservation) reasons.push('no_observations');

  return { applicable: true, certified: reasons.length === 0, reasons };
}

/** Human wording for one `Certification.reasons[]` entry (T-4-12: event card Certification block). */
export function describeCertificationReason(reason: string): string {
  if (reason === 'not_applicable') return 'Only custom events are certified; SDK and platform events are not validated.';
  if (reason === 'status_ignored') return 'The event status is "ignored".';
  if (reason === 'no_observations') return 'No observation of this event exists in a non-archived QA run.';
  const open = reason.match(/^open_errors: (\d+)$/);
  if (open) return `${open[1]} open error finding(s).`;
  const ack = reason.match(/^acknowledged_errors: (\d+)$/);
  if (ack) return `${ack[1]} error finding(s) acknowledged by hand but still reproducing.`;
  return reason;
}

export interface CertificationSummary {
  status: 'certified' | 'not certified' | 'not applicable';
  reasons: string[];
  /** One sentence on what would change the status. */
  change: string;
}

/** Pure view model for the event card's Certification block (T-4-12). */
export function summarizeCertification(c: Certification): CertificationSummary {
  if (!c.applicable) {
    return {
      status: 'not applicable',
      reasons: c.reasons.map(describeCertificationReason),
      change: 'Certification applies to custom events only, so this status changes only if the event class changes to custom.',
    };
  }
  if (c.certified) {
    return {
      status: 'certified',
      reasons: [],
      change: 'It stays certified until an error finding opens, the event is set to ignored, or its observations are removed.',
    };
  }
  const fixes: string[] = [];
  for (const r of c.reasons) {
    if (r === 'status_ignored') fixes.push('set the event status to something other than ignored');
    else if (r.startsWith('open_errors')) fixes.push('fix the open errors at their source and rerun the comparison');
    else if (r.startsWith('acknowledged_errors')) fixes.push('fix the acknowledged errors at their source');
    else if (r === 'no_observations') fixes.push('import or submit at least one observation in a QA run');
  }
  return {
    status: 'not certified',
    reasons: c.reasons.map(describeCertificationReason),
    change: fixes.length > 0 ? `To certify this event, ${fixes.join(', and ')}.` : 'Resolve the reasons above to certify this event.',
  };
}
