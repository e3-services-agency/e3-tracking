import { ChevronRight } from 'lucide-react';

/** T-4-27: the expand/collapse control in a table's narrow first column (32 px hit area). */
export function ExpandChevron({ expanded, label, onToggle }: { expanded: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="h-8 w-8 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800"
    >
      <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
    </button>
  );
}
