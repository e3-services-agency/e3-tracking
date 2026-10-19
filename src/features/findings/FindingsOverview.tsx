import { HintTh } from '@/src/components/ui/FieldHint';
import { useMemo } from 'react';
import { FAMILY_INFO, comparisonLabel } from '@/src/domain/findingsCatalog';
import { summarizeInternalFindings, type InternalFinding } from './internalFindingsModel';

/** Project scope is explicit and independent of the table's filters, search and current page. */
export function FindingsOverview({ findings, events, failed }: {
  findings: InternalFinding[] | null; events: { id: string; name: string }[]; failed: boolean;
}) {
  const result = useMemo(() => findings ? summarizeInternalFindings(findings, events) : null, [findings, events]);
  return <section aria-label="Project findings overview" className="rounded-lg border bg-white p-4 space-y-3 text-sm">
    <h2 className="font-semibold text-gray-900">Project findings overview</h2>
    <p className="text-xs text-gray-500">All current runtime findings in this project, independent of table filters and page. Historical file check counts are excluded.</p>
    {failed ? <p role="alert" className="text-red-700">The project overview could not be loaded. Reload the page to try again.</p> : !result ? <p className="text-gray-500">Loading project overview…</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="font-semibold text-gray-900">{result.summary.total} open</p><p className="text-xs text-gray-600">Error {result.summary.bySeverity.error} · Warning {result.summary.bySeverity.warning} · Info {result.summary.bySeverity.info}</p></div>
        <div><p className="font-semibold text-gray-900">{result.summary.acknowledged.total} acknowledged</p><p className="text-xs text-gray-600">Resolved by hand, still reproducing</p></div>
        <div><p className="font-semibold text-gray-900">{result.resolved} resolved</p><p className="text-xs text-gray-600">No longer reproducing at last comparison</p></div>
        <div><p className="font-semibold text-gray-900">{findings!.length} total recorded findings</p><p className="text-xs text-gray-600">Open + acknowledged + resolved</p></div>
      </div>
      <details className="border-t pt-2"><summary className="cursor-pointer text-xs font-medium text-gray-700">Detailed findings summary</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div role="region" aria-label="Findings by kind of problem" tabIndex={0} className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-gray-50"><tr><HintTh hintScope="Findings" className="px-3 py-2">Kind of problem</HintTh><HintTh hintScope="Findings" className="px-3 py-2">Open</HintTh><HintTh hintScope="Findings" className="px-3 py-2">Next step</HintTh></tr></thead><tbody className="divide-y">{result.summary.byFamily.map(f => <tr key={f.family}><td className="px-3 py-2 align-top">{FAMILY_INFO[f.family].label}</td><td className="px-3 py-2 align-top">{f.total}</td><td className="px-3 py-2 align-top">{FAMILY_INFO[f.family].next}</td></tr>)}</tbody></table>{!result.summary.total && <p className="py-2 text-gray-500">No open findings.</p>}</div>
          <div role="region" aria-label="Findings by comparison" tabIndex={0} className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-gray-50"><tr><HintTh hintScope="Findings" className="px-3 py-2">Comparison</HintTh><HintTh hintScope="Findings" className="px-3 py-2">Error</HintTh><HintTh hintScope="Findings" className="px-3 py-2">Warning</HintTh><HintTh hintScope="Findings" className="px-3 py-2">Info</HintTh></tr></thead><tbody className="divide-y">{result.summary.byComparison.map(c => <tr key={c.comparison}><td className="px-3 py-2">{comparisonLabel(c.comparison)}</td><td className="px-3 py-2">{c.error}</td><td className="px-3 py-2">{c.warning}</td><td className="px-3 py-2">{c.info}</td></tr>)}</tbody></table></div>
        </div>
      </details>
    </>}
  </section>;
}
