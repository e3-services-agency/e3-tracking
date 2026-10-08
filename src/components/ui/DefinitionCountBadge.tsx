/** Shared presentational count; the caller owns any expansion button and its accessibility. */
export function DefinitionCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-600">
      {count} {count === 1 ? 'definition' : 'definitions'}
    </span>
  );
}
