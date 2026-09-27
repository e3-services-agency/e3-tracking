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
