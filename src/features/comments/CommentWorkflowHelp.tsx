import type { CommentsPanelApi } from './CommentsPanel';

/** Capability-aware help shared by every comment panel; this adds no new permissions. */
export function CommentWorkflowHelp({ api }: { api: CommentsPanelApi }) {
  const internal = api.mode === 'internal';
  const writable = internal || api.access === 'comment';
  return <details className="text-xs text-gray-600">
    <summary className="cursor-pointer rounded text-[var(--color-info)] focus-visible:outline-2">How it works</summary>
    <div className="mt-2 max-w-3xl space-y-2 rounded border bg-gray-50 p-3 [overflow-wrap:anywhere]">
      <p>Comments start threads; replies stay beneath them. Open needs attention; In progress means work is underway and does not assign anyone. Done completes discussion; Open can go directly to Done.</p>
      <p>{internal ? "Internal users can reopen threads or select Won't do." : writable ? 'You can mark threads In progress or Done; only internal staff can reopen them.' : 'This link is read-only: you cannot post, react or change status.'} Seen acknowledges; Like agrees. Neither changes status.</p>
      <p>{internal ? 'Your signed-in account identifies you. Internal-only threads stay private; other visibility follows project sharing settings.' : 'Use a verified or guest identity; supply a name when required. Only comments permitted by this link and project settings appear; internal-only threads stay private.'}</p>
      <p>{writable ? 'Write Markdown and attach images. ' : ''}Copy links open the same comment; copy Markdown captures a comment or thread’s visible replies.</p>
      <p>Done does not fix a finding or certify an event. Fix the underlying issue and check the comparison again.</p>
    </div>
  </details>;
}
