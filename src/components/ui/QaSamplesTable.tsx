import { HintTh } from '@/src/components/ui/FieldHint';
import type { QaSampleEntry } from '@/src/domain/import/qaSampleManifest';

/** T-5-31: the per-event population numbers a QA sampler run carries (QA runs panel and QA report). */
export function QaSamplesTable({ samples }: { samples: QaSampleEntry[] | null | undefined }) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  return (
    <table className="text-sm w-full" data-testid="qa-samples-table">
      <thead>
        <tr className="text-left text-gray-600">
          <HintTh hintScope="QaRuns" className="pr-3">Event</HintTh><HintTh hintScope="QaRuns" className="pr-3">Variant</HintTh><HintTh hintScope="QaRuns" className="pr-3">Matched</HintTh><HintTh hintScope="QaRuns" className="pr-3">Read</HintTh><HintTh hintScope="QaRuns">Events</HintTh>
        </tr>
      </thead>
      <tbody>
        {samples.map((s, i) => (
          <tr key={`${s.event}|${s.variant ?? ''}|${i}`}>
            <td className="pr-3">{s.event}</td><td className="pr-3">{s.variant ?? '-'}</td><td className="pr-3">{s.filter_matched}</td><td className="pr-3">{s.customers_read}</td><td>{s.events_read}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
