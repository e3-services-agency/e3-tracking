# Collaboration and QA report follow-up

Approval: user "so far the all is approved" on 2026-10-08 covers the preceding four UI adjustments and expanded collaboration/report proposal. This is a new scope after completed D-77/T-5-20; prior production release remains baseline.

## Approved delivery sequence

1. T-5-21: certification help using actual derived reasons; shared event/property summary row expands on click while interactive controls and text selection keep their behavior; keyboard expansion remains accessible. A sticky active-entity summary/Collapse bar sits below the page header only within its long expanded body, with focus/scroll restored on collapse. Internal row-click editing remains. Put comment count/actions in one Actions column across affected tables; consistent Comments, Copy Markdown, Copy link, History order where available, with internal editing actions after them. Preserve wrapping names, definitions counts, links, mobile containment and permissions.
2. T-5-22: add exact-target comment threads to identity rules, catalogs and property definitions, in internal/shared views. Reuse identity, replies, reactions, attachments and visibility rules; stable anchors survive rename. Expose existing entity change history directly; shared history is a new explicitly filtered projection of client-visible fields, never raw private diffs. Verify project ownership, parent/child visibility, removed targets, older backups and full restore remapping.
3. T-5-23: save immutable, project-numbered QA reports after completed comparisons, with time, comparison scope and related QA run. Report comments are separate from individual finding discussions. Persistent finding references/discussion survive repeated appearances of the same issue. Old reports show recorded results separately from current finding status. Define snapshot/evidence retention and recurrence identity before implementation; current mutable summaries cannot reconstruct old report versions. History begins at rollout, no fabricated historical snapshots.
4. T-5-24: independent review, local browser QA, appropriate tests and backup/restore verification, integration and staged release handover. Schema changes require the database-aware snapshot/rollback discipline in the current runbook. Do not run historical pre-0038 recovery recipes against a newer schema. Preserve main, staging, staff OAuth, public-auth configuration and machine-specific .mcp.json.

Supervisor alone writes team records. Application changes use separate implementer, reviewer and QA roles. Existing D-73 accepted-task commit/integration authorization applies. Later stages are already approved; report each stage's results before advancing. No application changes are made by this planning record.

## Comment workflow clarification under evaluation

Current code: comment status is a property of the root thread (open/on_it/done/wont_do). An on_it reaction is per participant, root-only, independently toggled. Adding it moves an open thread to on_it; removing it leaves thread status unchanged. It is not an assignee field, does not ensure one responsible person and creates no assignment notification. Internal users can reopen; shared users may set on_it/done but cannot reopen a closed thread or set open/wont_do. Open can go directly to done; this is not a mandatory sequence.

Recommendation superseding the earlier tentative "I'm on it" label: remove the on_it reaction from active UI and new reaction submissions, retain Seen and Like, and use one thread status control labeled Open / In progress / Done (internal also Won't do). Preserve old reaction evidence in backup/history rather than deleting it or turning it into assignments. Record latest status actor/time honestly; it is not full transition history or an assignee. Do not widen reopening permissions by implication. Real assignment is a separate product feature if requested.

User approved this clarification with "all approved proceed" on 2026-10-08. D-79 now amends D-70: remove on_it from active reaction UI and new reaction submissions, keep existing records exportable/restorable, and retain current status/reopening permissions without assignments. Add a short expandable "How it works" beside "Add a comment" in the reused CommentsPanel, explaining root/reply grouping, Open/In progress/Done status meanings, Seen/Like, verified or guest identity, current access/visibility, Markdown/images, copy controls and role-specific reopening. Help must also say comment Done does not fix a finding or certify an event. Internal Won't do remains available. Use a comment-specific status label rather than relabeling unrelated domain statuses globally.

## Verification requirements

T-5-21: desktop/narrow, click targets versus controls/text selection, keyboard focus, sticky boundaries/header offsets and long content. Certification help matches derived blockers including acknowledged reproducing errors and SDK/platform not-applicable.

T-5-22: internal/shared exact-target posts and deep links, read-only share refusal, private comment/field suppression, direct history, rename/deletion behavior, backup/restore of every new anchor and attachment.

T-5-23: transactional immutable report creation after successful comparison, sequence allocation without reuse/races, stable recurring-issue mapping, current versus snapshot distinction, cross-project access rejection, public projection, report/finding comments and complete backup/restore. Avoid per-entity request fan-out.

No migration numbers are allocated in this proposal; reserve them once the architecture enumerates the required changes and checks existing migrations. No estimates or completion evidence are claimed.
