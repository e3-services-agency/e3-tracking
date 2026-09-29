/**
 * Compact comment toggle (T-4-16): speech-bubble icon plus the thread's comment count ("0" muted).
 * Clicking it opens or closes the row's `CommentsPanel` inline; used on requirement rows and event
 * card headers in both the internal app and the shared view.
 */
import { MessageSquare } from 'lucide-react';

export function CommentCountButton({
  count,
  open,
  onClick,
  label,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
  /** What the thread belongs to, for the accessible name ("event purchase", "this requirement"). */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`Comments on ${label}: ${count}`}
      title={count === 0 ? 'No comments yet' : `${count} comment${count === 1 ? '' : 's'}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-gray-100 ${
        open ? 'bg-gray-100' : ''
      } ${count === 0 ? 'text-gray-400' : 'font-medium text-gray-700'}`}
    >
      <MessageSquare size={14} />
      <span>{count}</span>
    </button>
  );
}
