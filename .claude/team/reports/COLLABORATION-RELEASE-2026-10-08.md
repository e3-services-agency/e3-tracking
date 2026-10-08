# Collaboration release — 8 October 2026

The approved collaboration changes are live at https://tracking.e3-services.com on `52f986a-dirty`, schema `0040_qa_reports.sql`.

## What changed

- Certification badges explain the current blockers and the next step to certify an event.
- Shared event/property summary rows expand by clicking their content; separate controls and text selection retain their own behavior. Long expanded entities have a bounded sticky summary with Collapse.
- Comments sit in Actions. Identity rules, catalogs and individual property definitions have exact-target discussions and filtered change history.
- Active reactions are Seen and Like. Progress is controlled once per thread: Open, In progress, Done; internal users also have Won't do. In progress describes the discussion, not assignment. Existing historical On it reaction evidence is preserved in backups.
- Internal users can reopen discussions; shared participants retain their existing restriction against reopening closed threads. How it works explains identities, visibility, Markdown, images, links and the difference between discussion completion and fixing/certifying an entity.
- Each real comparison saves an immutable project-numbered QA report. Findings retain their own stable project numbers and discussions across exact-fingerprint recurrence. Report and finding discussions remain separate. Recorded evidence is shown alongside the current finding status.
- Report history begins at the next real comparison. Migration and restore validation never invent historical reports.

## Validation

Final integrated suite: **2166 tests across 223 files passed**, 519.79 seconds. TypeScript/color lint, backend/frontend build and diff checks passed. Separate implementation, review and QA covered all stages; report integration corrections also passed independent59/59 affected tests, with no skipped tests or weakened assertions.

Independent API/restore QA passed117 report checks, plus the earlier target/privacy/image checks. Genuine disposable backups covered report/finding replies, images, recurrence, typed reference restoration, raw UUID preservation and suppressed report capture. Actual browser checks covered internal/shared controls, copy links/Markdown, recorded versus current status and read-only sheets. Browser error logs were empty.

Actual390px checks passed for the reused sticky and comment/definition panels in T21/T22. The later T23 viewport override did not apply, so no new390px report-table proof is claimed; its native horizontal overflow remains. The release screenshot shows the actual live viewport.

## Production evidence

Image source: integrated52f986a, including accepted155e0fc,0db69d9,3657bee and correction79a1eb8. Registry manifest:
`sha256:0152966e6db99a8b99f2fe3f2b7c11f7e77f116e513768557411c51500fb9f39`.

App and backup use that manifest. Exact0040 read-only SQLite audit passed integrity, foreign keys, positive project-unique sequences and counters above allocated current/historical numbers. Preserved2clients,2projects,12comments,244properties,303definitions,38events,34findings,2comment attachments and7reactions. Reports/items remain0;2project counters are initialized.

Private configuration excluding IMAGE has unchanged SHA256:
`3f9d6821d201e6aa1a4d95ba2ef833557966487a49c71bb9e18bfc243c1e8c59`.
No credential contents were recorded. Existing staff/shared OAuth settings remain. Caddy7e2ca33b1548 and oauth2-proxy71ebcf191013 stayed unchanged. Live appa3da66302ae2 is healthy; backupdcb8201f9c1b runs. Public health confirms writable data and successful upload.

Live internal definition discussion/help and empty report history, shared whole-row expansion, certification hint and unified Actions passed. Deployed frontend is `index-DKCDbgA2.js`; actual asset200 contains the reviewed report hints. Shared JSON contains no credential/private-actor keys; unauthenticated internal API redirects to authentication.

Existing HTTPS `/api/health` monitoring validates SSL; alert policy is enabled and email channel is jan.pan@e3-services.com. No alert delivery test was sent. Required07 dry-run and live MCP initialize/tools-list passed29tools. Existing local.mcp.json was not edited or staged.

## Backup and recovery

Fresh complete quiescent pre-upgrade snapshot:
`/var/backups/e3-tracking/pre-ui-0038-20261008T185841Z`.
Directory700, archives600; archive hashes/path checks, extracted0038 integrity/foreign keys and2clients/2projects/12comments verified. It pins the previous current image:
`sha256:c13f97dee02182d0d23a2ed42dc18fdee0a9ba6ec70c660d93c1cc0f05cde39e`.
Both old and new immutable images were cached before maintenance.

Final off-site backups `2026-10-08T19-02-50-420Z`:2written/2uploaded/0failures. Both downloaded privately and restored through integrated0040 with **zero warnings**. Sandbox retained11comments,2attachments,4embedded files and1sequence counter; Airshoppen retained1comment and1counter. Both retained zero historical reports.

For rollback to0038, use the independently reviewed `ops/e3-maintenance-ui-schema0038.sh rollback` with the exact fresh snapshot above. It stops all writers, preserves failed-release data/config, restores complete old data/config and starts the pinned old image. Never downgrade only the image or overlay old SQLite onto newer WAL/SHM.

For a later upgrade FROM0040, use the separate reviewed `ops/e3-maintenance-collaboration-schema0040.sh` and a new0040 snapshot. The0038 helper is specifically for this release's recovery. The reviewed read-only auditor is `ops/e3-audit-schema0040.cjs`.

## Coordination

D73/D78/D79/D80 remain authoritative; accepted stage evidence is in COLLABORATION-ACCEPTANCE-2026-10-08.md. All accepted source is integrated into agent-setup. Main and local staging remain untouched. Temporary fixtures/backup objects and secrets stay outside Git. Supervisor owns the board, decisions, task state and runbook; independent roles retain their review and QA evidence.

Final independent operational-record review passed after correcting a historical baseline phrase. Owned QA PID48868/3011 was stopped only after command/listener/start-time/fixture checks; temporary tabs11–14 closed. Existing production/console tabs and local staging retained. T-5-24 is DONE.
