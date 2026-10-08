import { StatusBadge } from '@/src/components/ui/badges';
import { COMMENT_STATUS_LABELS } from '@/src/domain/enumLabels';
import type { CommentStatus } from '@/src/domain/enums';

/** Comment-only terminology: stored on_it and unrelated status labels remain unchanged. */
export function CommentStatusBadge({ status }: { status: CommentStatus }) {
  return <StatusBadge status={status} label={COMMENT_STATUS_LABELS[status]} />;
}
