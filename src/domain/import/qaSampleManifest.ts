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

/** T-5-31: one per-event (per-variant) population entry from the sampler's `manifest.samples[]`. */
export interface QaSampleEntry {
  event: string;
  /** Variant name, `null` for an event-level entry. */
  variant: string | null;
  filter_matched: number;
  customers_read: number;
  events_read: number;
}

export const QA_SAMPLES_CAP = 2000;

/** Validates `manifest.samples[]` (at most 2000 entries; duplicate event/variant keys keep the largest `filter_matched`): unknown fields are ignored, a malformed entry becomes a warning and is dropped. */
export function qaSamples(manifest: unknown): { samples: QaSampleEntry[]; warnings: string[] } {
  const raw = obj(manifest).samples;
  const samples: QaSampleEntry[] = [];
  const warnings: string[] = [];
  if (raw === undefined || raw === null) return { samples, warnings };
  if (!Array.isArray(raw)) return { samples, warnings: ['manifest.samples is not an array; ignored.'] };
  if (raw.length > QA_SAMPLES_CAP) warnings.push(`manifest.samples has ${raw.length} entries; only the first ${QA_SAMPLES_CAP} (the cap) are read.`);
  raw.slice(0, QA_SAMPLES_CAP).forEach((item, i) => {
    const e = obj(item);
    const event = typeof e.event === 'string' && e.event.trim() ? e.event.trim() : null;
    const variant = e.variant === undefined || e.variant === null ? null : typeof e.variant === 'string' ? e.variant : undefined;
    const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
    const matched = count(e.filter_matched);
    const read = count(e.customers_read);
    const events = count(e.events_read);
    if (!event || variant === undefined || matched === null || read === null || events === null) {
      warnings.push(`manifest.samples[${i}] is malformed (needs event, variant name or null, and non-negative whole numbers for filter_matched, customers_read, events_read); skipped.`);
      return;
    }
    const entry = { event, variant, filter_matched: matched, customers_read: read, events_read: events };
    const dup = samples.findIndex((s) => s.event === event && s.variant === variant);
    if (dup < 0) samples.push(entry);
    else if (entry.filter_matched > samples[dup].filter_matched) samples[dup] = entry;
  });
  return { samples, warnings };
}
