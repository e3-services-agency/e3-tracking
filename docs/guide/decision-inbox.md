# Decision inbox

This is a native, project-scoped E3 Tracking view at `/tracking-plan/p/<key>/decisions`.
Enable the API only on the intended installation with `DECISION_INBOX_ENABLED=true`.
The pilot uses SQLite migration `0046_decision_inbox.sql`. It adds no external service or model dependency.

## Protocol

1. A proposal contains a stable key, revision, evidence links/hashes/capture times, confidence rationale, audiences, recommended reviewer and exact documentation patches.
2. `POST /api/projects/:id/decision-inbox/preview` with `{proposal}` validates native requirement targets without retaining writes and returns a content hash. `/import` requires the same proposal and hash; identical replay returns the existing revision. Import records AI authorship and no approval.
3. The human expands a card and reviews the exact notes/requirement additions. The confirmation checkbox plus **Approve documentation** applies those patches and the approval receipt in one transaction. It appends notes and adds native requirements with status `open`; it cannot change a use-case status, certify QA, remove requirements or call Bloomreach.
4. **Amend** creates a new unapproved revision and retains the superseded record. A reason is required. **Defer** leaves documents unchanged and permits later review. **Reject** closes the proposal without changing documents.
5. **Request execution plan** is available after documentation approval. It records a planning request and shows the proposed steps. There is no executor/worker attached to this action and it grants no external write permission. Execution approval and measured verification are future separate gates.

Actions use `POST /api/projects/:id/decision-inbox/:decision/actions` with `content_hash`, `action`, `human_confirmed: true`, `note`, and (for amendment) a full `amendment` proposal. The server uses its authenticated actor; supplied actor names are ignored. These routes are absent from shared/public views. In local mode the recorded local identity is unverified; neither roles nor local approval establish client commercial authority.

## Information and confidence

Every role sees the same decision IDs and revisions. The role filter selects relevant work for PM, technical consultant, business consultant and customer success. It is a presentation filter, not access control or a separate knowledge copy.

High/medium/low means evidence confidence with an explicit rationale. It does not measure implementation success or probability of a business outcome. Captured activation, historical sign-off and QA verification remain distinct facts.

## Integrity and recovery

Approval checks the exact revision hash and all affected use-case/requirement baselines. Any document change blocks stale approval. A later edit to approved documents blocks requesting a plan from that old baseline. Amend/review a fresh revision or create a follow-up proposal.

Backup exports include decision revisions/events. Restore into a new project preserves original payload hashes and history but marks the records read-only: authority is not transferred. They must be re-proposed in the destination project. Back up the entire database/volume before a schema upgrade; image rollback alone is not a complete data rollback.

## Boundaries and remaining integration

Sources are captured citations. The local source-review extension below can bind selected cited content and invalidate its planning basis when a new complete capture is supplied. It does not poll remote tools. Scheduled collection, a durable runtime publisher, notifications and execution approval/verification workers remain separate work. Treat the source timestamps as the freshness boundary. Company-library promotion is also separate, requires anonymisation/review and is not performed by this inbox.

Raw client sources remain in private storage, outside committed source. Automated tests use synthetic projects; browser mutation checks must use a disposable synthetic project and cannot approve real client decisions on the user's behalf.

## Selected cited-source checks

Migration `0047_decision_source_captures.sql` retains scoped, immutable capture history. This is a manual/operator intake path for exact cited content, with no remote poller or new publisher credential.

- `POST /api/projects/:id/decision-inbox/:decision/sources/preview` accepts `{capture}` and returns the exact preview hash and before/after changes. A capture has a canonical `source_key`, `baseline_package_hash`, `package_hash`, `captured_at`, `complete`, and records containing the original citation URL, author, occurrence time and exact text.
- `/sources/apply` requires the same capture and preview `content_hash`. First binding requires the original cited package hash and complete coverage of that package's cited URLs. The operator verifies the retained package and selected records before submission; the API does not independently fetch or authenticate a remote source.
- Later complete captures compare only selected cited content. Changes elsewhere in the package do not invalidate the decision. Partial captures are retained as audit evidence without replacing complete evidence or creating false absence/invalidation. A reused package hash with conflicting cited content is refused.
- A relevant change retains the original approval and approved notes, flags the old planning basis, and atomically creates one unapproved follow-up with exact before/after text. Identical replay creates neither another draft nor another event. Reversions remain reviewable transitions; they do not silently restore authority.
- Follow-ups inherit their cited-content baseline. Later changes to the same selected source records also invalidate those follow-ups, within the same project. The source flag is sticky until a fresh reviewed basis is established; a prior approval is never rewritten.
- Wording amendments inherit existing source dependencies and any review flag. They do not count as a fresh source observation. Changing tracked citation URL/hash references through an amendment is refused; prepare a separately sourced follow-up.
- The UI links directly to the source re-review and disables stale planning. The server refuses a stale planning request even if an earlier planning intent was already recorded. There is still no executor attached.
- Portable backup/restore preserves source payloads/hashes and remaps relational IDs. Restored decision history remains read-only and cannot establish a new source baseline or transfer authority.

Controlled source changes belong in a disposable synthetic project. They must never be imported as real client updates. Collect actual source orders, emitted payloads and rendered results separately when verifying a correction.
All mutation POSTs require authenticated staff and the exact application Origin. A missing or cross-site Origin is rejected. Scoped promotion into an existing empty hosted project is a separate explicit operation; see the project promotion guide. It preserves original decision hashes and recorded approval/planning semantics without granting new approval or execution authority.
