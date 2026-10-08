/** D-79: Seen/Like controls only; legacy stored on_it is never offered as an action. */
import { useState } from 'react';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { REACTION_ICONS } from '@/src/components/layout/navIcons';
import { WRITABLE_COMMENT_REACTION_KINDS, type CommentReactionKind } from '@/src/domain/enums';
import { REACTION_LABELS } from '@/src/domain/enumLabels';

export interface ReactionSummaryView {
  kind: CommentReactionKind;
  count: number;
  authors: string[];
  mine?: boolean;
}

export function CommentReactions({
  reactions,
  ownName,
  nameRequired,
  busy,
  readOnly = false,
  onReact,
}: {
  reactions: ReactionSummaryView[] | undefined;
  isRoot: boolean;
  /** The shared visitor's remembered name; internal mode relies on `mine` from the server. */
  ownName: string;
  /** Shared link with `require_name` and no name entered yet. */
  nameRequired: boolean;
  busy: boolean;
  readOnly?: boolean;
  onReact: (kind: CommentReactionKind) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const kinds = WRITABLE_COMMENT_REACTION_KINDS;
  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap" data-testid="comment-reactions">
      {kinds.map((kind) => {
        const summary = reactions?.find((r) => r.kind === kind);
        const mine =
          summary?.mine ??
          (!!ownName && !!summary?.authors.some((a) => a.toLowerCase() === ownName.trim().toLowerCase()));
        const Icon = REACTION_ICONS[kind];
        const label = REACTION_LABELS[kind] ?? kind;
        return (
          <Tooltip key={kind} content={summary?.authors.length ? summary.authors.join(', ') : undefined}>
            <button
              type="button"
              aria-pressed={mine}
              aria-disabled={readOnly || nameRequired || busy}
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                if (nameRequired) {
                  setMessage('Enter your name first.');
                  return;
                }
                setMessage(null);
                if (!busy) onReact(kind);
              }}
              className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] ${
                mine ? 'border-[var(--brand-primary)] bg-blue-50 text-[var(--brand-primary)]' : 'border-gray-300 bg-white text-gray-600'
              } ${nameRequired || readOnly ? 'opacity-50' : 'hover:bg-gray-50'}`}
            >
              {Icon && <Icon className="h-3 w-3" aria-hidden />}
              {label}
              {summary && summary.count > 0 && <span className="font-medium">{summary.count}</span>}
            </button>
          </Tooltip>
        );
      })}
      {message && <span className="text-[11px] text-red-700">{message}</span>}
    </div>
  );
}
