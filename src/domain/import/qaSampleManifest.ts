/**
 * Facts read from the QA sampler's `manifest.json` (T-5-30). Pure and forgiving: every field is
 * optional in the archive, a missing one becomes `null`. Shared by the archive preview, the QA
 * runs page and the QA report so all three show the same facts.
 */
export interface QaSampleFacts {
  tool: string | null;
  build: string | null;
  generated_at: string | null;
  sample_method: string | null;
  requested: number | null;
  read: number | null;
  matched: number | null;
  customers: number | null;
  events: number | null;
  redacted: boolean;
  values_masked: number | null;
  redaction_note: string | null;
  warnings: string[];
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function qaSampleFacts(manifest: unknown): QaSampleFacts {
  const m = obj(manifest);
  const sample = obj(m.sample);
  const filter = obj(m.filter);
  const obs = obj(m.observations);
  return {
    tool: str(m.tool),
    build: str(m.build),
    generated_at: str(m.generated_at),
    sample_method: str(sample.method),
    requested: num(sample.requested),
    read: num(sample.read),
    matched: num(filter.matched),
    customers: num(obs.customers),
    events: num(obs.events),
    redacted: obs.redacted === true,
    values_masked: num(obs.values_masked),
    redaction_note: str(obs.redaction_note),
    warnings: Array.isArray(m.warnings) ? m.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

/** One human line, e.g. `spaced_clusters: read 10 of 10 requested, 105968 matched`. */
export function qaSampleSummaryLine(f: QaSampleFacts): string {
  const parts: string[] = [];
  if (f.sample_method) parts.push(f.sample_method);
  if (f.read !== null || f.requested !== null) parts.push(`read ${f.read ?? '?'} of ${f.requested ?? '?'} requested`);
  if (f.matched !== null) parts.push(`${f.matched} matched`);
  return parts.join(', ');
}
