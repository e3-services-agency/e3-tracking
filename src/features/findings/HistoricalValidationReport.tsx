import { useEffect, useState } from 'react';
import { API_BASE } from '@/src/config/env';
import { fetchWithAuth } from '@/src/lib/api';
import { HintTh } from '@/src/components/ui/FieldHint';
interface HistoricalRead {
  report_sequence: number; report_url: string; detail_url: string; tracking_url: string; definition_hash: string; engine_hash: string; created_at: string;
  totals: { passed: number; failed: number; skipped: number; checked: number }; unmapped_columns: number;
  sources: { id: string; filename: string; source_ref: string; sha256: string; source_captured_at: string | null; uploaded_at: string }[];
  files: { source_id: string; rows: number; columns: number; padded_records: number; event_id?: string; event_name?: string; unmapped_columns?: string[] }[];
  source_availability: { source_id: string; available: boolean }[];
  checks: { source_id: string | null; column: string | null; check: string; outcome: string; count: number; rows: number[]; reason: string }[];
  checks_total: number; offset: number; limit: number; limitations: string[]; policy: { rowReference: string };
}
function sourceLink(value: string): string | null {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash ? value : null; } catch { return null; }
}
export function HistoricalValidationReport({ projectId, reportId }: { projectId: string; reportId: string }) {
  const [report, setReport] = useState<HistoricalRead | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('');
  useEffect(() => { setOffset(0); setReport(null); }, [projectId, reportId]);
  useEffect(() => {
    let active = true;
    void fetchWithAuth(API_BASE + '/api/projects/' + projectId + '/historical-files/reports/' + reportId + '?offset=' + offset + '&limit=100').then(async res => {
      if (!res.ok) throw new Error(); const value = await res.json(); if (active) { setReport(value); setError(''); }
    }).catch(() => { if (active) setError('Historical report is unavailable.'); });
    return () => { active = false; };
  }, [projectId, reportId, offset]);
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading immutable historical report…</p>;
  const name = (id: string | null) => report.sources.find(s => s.id === id)?.filename ?? 'Project';
  const projectPath = report.tracking_url.split('/findings#')[0];
  return <section aria-label="Historical file validation" className="space-y-3 text-sm [overflow-wrap:anywhere]">
    <h4 className="font-semibold">Historical source-file validation</h4>
    <p>Recorded checks against the selected native definitions. This is separate from observed-event QA, certification and customer acceptance. A conflict may mean the current draft definition needs review.</p>
    <p><strong>{report.totals.passed} passed</strong> / <strong>{report.totals.failed} failed checks</strong> / <strong>{report.totals.skipped} skipped / not assessed</strong> check instances. <strong>{report.unmapped_columns} unmapped source-only columns</strong>. Several checks can refer to one CSV record.</p>
    <a href={report.detail_url}>Permanent link to this report</a>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><HintTh hintScope="HistoricalValidation">Reviewed file</HintTh><HintTh hintScope="HistoricalValidation">Event</HintTh><HintTh hintScope="HistoricalValidation">CSV records / columns</HintTh><HintTh hintScope="HistoricalValidation">Source reference</HintTh><HintTh hintScope="HistoricalValidation">Bytes available now</HintTh></tr></thead><tbody>{report.sources.map(s => {
      const f = report.files.find(v => v.source_id === s.id), href = sourceLink(s.source_ref);
      return <tr key={s.id} className="border-t"><td>{s.filename}<details><summary>Exact source identity</summary><p>SHA256: {s.sha256}</p><p>Source capture/export time: {s.source_captured_at ?? 'Not supplied'}</p><p>Uploaded: {s.uploaded_at}</p><p>Original event time: unavailable; never inferred.</p><p>Unmapped columns: {f?.unmapped_columns?.join(', ') || 'None'}</p></details></td><td>{f?.event_id ? <a href={projectPath + '/events/' + f.event_id + '/card'}>{f.event_name ?? 'Mapped event'}</a> : f?.event_name ? <>{f.event_name} (recorded context)</> : '—'}</td><td>{f?.rows ?? 0} records / {f?.columns ?? 0} columns<br />{f?.padded_records ?? 0} assessed under explicit optional trailing-field policy</td><td>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{s.source_ref}</a> : s.source_ref}</td><td>{report.source_availability.find(v => v.source_id === s.id)?.available ? 'Rehashed and available' : 'Unavailable or hash mismatch; original report retained'}</td></tr>;
    })}</tbody></table></div>
    <details><summary>Definition and engine revisions</summary><p>Definitions/rules SHA256: {report.definition_hash}</p><p>Engine SHA256: {report.engine_hash}</p><p>Recorded: {report.created_at}</p></details>
    <ul className="list-disc pl-5">{report.limitations.map(l => <li key={l}>{l}</li>)}</ul>
    <p>{report.policy.rowReference}. Source values are not copied into diagnostics.</p>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><HintTh hintScope="HistoricalValidation">File</HintTh><HintTh hintScope="HistoricalValidation">Column</HintTh><HintTh hintScope="HistoricalValidation">Check</HintTh><HintTh hintScope="HistoricalValidation">Outcome</HintTh><HintTh hintScope="HistoricalValidation">Instances</HintTh><HintTh hintScope="HistoricalValidation">CSV records</HintTh><HintTh hintScope="HistoricalValidation">Explanation</HintTh></tr></thead><tbody>{report.checks.map((c, i) => <tr className="border-t" key={i}><td>{name(c.source_id)}</td><td>{c.column ?? '—'}</td><td>{c.check.replaceAll('_', ' ')}</td><td>{c.outcome === 'failed' ? 'Failed check' : c.outcome === 'skipped' ? 'Skipped / not assessed' : 'Passed'}</td><td>{c.count}</td><td>{c.rows.join(', ') || '—'}</td><td>{c.reason}</td></tr>)}</tbody></table></div>
    <div className="flex gap-3"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous checks</button><span>Checks {offset + 1}–{Math.min(offset + report.checks.length, report.checks_total)} of {report.checks_total}</span><button type="button" disabled={offset + 100 >= report.checks_total} onClick={() => setOffset(offset + 100)}>Next checks</button></div>
  </section>;
}
