import { FieldLabel } from '@/src/components/ui/FieldHint';
import { Button } from '@/src/components/ui/Button';

/** Real bounded pages. A compact numbered window keeps controls usable for very large lists. */
export function FindingsPagination({ total, page, pageSize, onPage, onPageSize, loading }: {
  total: number; page: number; pageSize: number; onPage: (page: number) => void;
  onPageSize: (size: number) => void; loading: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return <nav aria-label="Findings pagination" className="flex flex-wrap items-center gap-2 text-sm">
    <p role="status" className="mr-auto text-gray-600">{loading ? 'Loading filtered findings…' : `Showing ${total ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} of ${total} filtered findings`}</p>
    <FieldLabel hint="Rows per page" hintScope="Findings" className="flex items-center gap-2 text-xs text-gray-600">Rows per page
      <select aria-label="Findings per page" value={pageSize} onChange={e => onPageSize(Number(e.target.value))} className="h-8 rounded border bg-white px-2 text-sm">
        {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
      </select>
    </FieldLabel>
    <span className="text-xs text-gray-500">Page {page} of {pages}</span>
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button variant="outline" size="sm" className="h-8 px-2" disabled={loading || page <= 1} aria-label="First findings page" onClick={() => onPage(1)}>First</Button>
      <Button variant="outline" size="sm" className="h-8 px-2" disabled={loading || page <= 1} aria-label="Previous findings page" onClick={() => onPage(page - 1)}>Previous</Button>
      {numbers.map(number => <Button key={number} variant={number === page ? 'secondary' : 'outline'} size="sm" className="h-8 min-w-8 px-2" disabled={loading} aria-current={number === page ? 'page' : undefined} aria-label={`Findings page ${number}`} onClick={() => onPage(number)}>{number}</Button>)}
      <Button variant="outline" size="sm" className="h-8 px-2" disabled={loading || page >= pages} aria-label="Next findings page" onClick={() => onPage(page + 1)}>Next</Button>
      <Button variant="outline" size="sm" className="h-8 px-2" disabled={loading || page >= pages} aria-label="Last findings page" onClick={() => onPage(pages)}>Last</Button>
    </span>
  </nav>;
}
