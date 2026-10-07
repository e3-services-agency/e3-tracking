/** Pure comment thread helpers (D-70, T-5-02), shared by the DAL, routes and the UI. */
import type { CommentStatus } from './enums';

interface ThreadRow {
  id: string;
  parent_id: string | null;
  status: CommentStatus;
  created_at: string;
}

/** Groups a flat list into roots with replies[] (oldest first). Replies whose root is absent are dropped. */
export function groupThreads<T extends ThreadRow>(rows: T[]): Array<T & { replies: T[] }> {
  const roots = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, replies: [] as T[] }));
  const byId = new Map(roots.map((r) => [r.id, r]));
  for (const r of rows) if (r.parent_id) byId.get(r.parent_id)?.replies.push(r);
  for (const root of roots) root.replies.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return roots;
}

/** Root-comment counts per status (replies carry no status of their own). */
export function countByStatus(rows: ThreadRow[]): Record<CommentStatus, number> {
  const counts: Record<CommentStatus, number> = { open: 0, on_it: 0, done: 0, wont_do: 0 };
  for (const r of rows) if (!r.parent_id) counts[r.status] += 1;
  return counts;
}
