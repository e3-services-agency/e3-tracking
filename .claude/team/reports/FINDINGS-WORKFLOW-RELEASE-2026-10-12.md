# Shared Findings workflow and compact controls — 2026-10-12

T-5-29 and T-5-30 are complete and deployed. D-85 and D-86 are the approved scope. This record is the authoritative current release and replaces older checkpoints.

## Result

Shared Findings has one working table: Number, Severity, Event, Message and Actions. Compact totals and search/severity/event/comparison filters precede it. Default sorting is Error, Warning, Info, then stable finding sequence; findings are not renumbered. Messages wrap. Comparison, resolved Property/Variant/Catalog/Consent links, other available context and existing family recommendations appear when a row expands. The detailed family/comparison/top-event summary is collapsed by default below the table. Saved immutable QA reports remain separate.

Sidebar comparison/event links filter the working table. Unqualified Findings navigation resets filters and reveals the heading, totals and search controls. Exact finding/comment links reveal their target despite prior filters. Legacy aliases, current versus report anchors, comment/history actions and original exports remain. No API, schema, authorization or live-data change was needed.

Collapsed Use case descriptions show readable plain text, at most 200 Unicode code points including the ellipsis, preferring a word boundary. Original full Markdown is shown in the expanded body and retained in storage and Markdown/JSON/HTML exports. Existing react-markdown parsing is reused; no HTML/DOM parsing or dependency was introduced.

D-86 supersedes D-85's first 40px toolbar size: shared text controls use 32px height (`h-8`), 12px horizontal padding (`px-3`), zero vertical padding and 14px text. Top Expand/Collapse/QA reports/JSON/HTML, section/category Expand/Collapse and Reset filters use the same shared wrapper. Row icon Actions and 40px filter inputs retain their existing sizes.

## Source acceptance

T29 owner `5a5d4b8fb97ed48b19cced026c149acc907b5cde` integrated as `bcd7a46`. Owner, independent reviewer and independent QA each passed 38 focused tests across six files; owner fresh build, TypeScript/colors and diff checks passed. Resolved finding context links were restored before acceptance. The primary table has bounded 112px Number, 108px Severity, 132px Actions and 18% Event columns; Message gets the remaining width.

The unqualified Findings navigation correction passed owner build/type/lint and 19 tests across two files, separate reviewer 19/2 and QA 31/3. Implementer credit exhaustion occurred after all source checks but before committing. Coordinator verified the unchanged accepted two-file candidate and committed `d17ddefd1a381b937aab6fe184166f9fa3c5503c` without source edits; integrated as `bedc714`.

T30 owner `e9119685db9929dd5babaa9e227dab7523b35589` integrated as `9bc5e72`. Exactly SharedToolbarControl.tsx and SharedFindingsTable.test.tsx changed, +6/-4 lines. Owner 22 tests across two files, TypeScript/colors and diff checks passed. Independent reviewer 22/2 passed in 16.99s; independent mounted/source QA 22/2 passed in 16.33s, with no skips. Filter inputs, icons, native buttons/links, actions and navigation behavior were checked. The final Docker build is a fresh deployable build before maintenance.

Actual desktop/mobile browser geometry remains unverified: the agent browser runtime fails Windows sandbox initialization while the user's browser works. User explicitly authorized SDK continuation. Mounted tests and HTTP asset checks do not claim rendered visual measurements or screenshots.

## Completed T29 deployment

02/03 dry runs preceded each actual deployment. First image `bcd7a46-dirty` had manifest `sha256:5b3009e78cc5aa61352b2fe310e44eaeaa04c7683b56a8a0ea17ccaacaf32be8`; complete snapshot `/var/backups/e3-tracking/pre-collaboration-0040-20261012T143846Z` pins the prior image. First pre-backup 14:35:34.103Z and final 14:45:23.330Z were uploaded, actually downloaded and restored with zero warnings; independent whole JSON equality ignored only exported_at.

Corrective image `bedc714-dirty` has manifest `sha256:6683b7c2e7636e039b6c45b3099a23e3be8405b9ef6746d9b60f180cdef170e9`. It was precached before stopping writers. Complete snapshot `/var/backups/e3-tracking/pre-collaboration-0040-20261012T200401Z` pins the first T29 image. Corrective pre-backup 20:01:40.800Z and final 20:07:50.751Z uploaded both projects with zero failures; actual SDK downloads and both restore rehearsals passed with zero warnings. Independent before/after whole JSON comparison passed, ignoring only exported_at. Every table, row, history, file, app, client and project value is preserved. MCP returned all 29 tools.

Corrective public assets `index-CaxsI2Vp.js` (1,465,419 bytes) and `index-BeXEpQQe.css` (60,619 bytes) returned HTTP200 under `/tracking-plan/assets/`. Health is `/api/health`, not a login page fallback. Final schema, integrity, foreign keys, sequences, private settings and active OAuth token-header audits passed.

## Preserved live data and settings

Before T30 maintenance, the live audit again passed exact `0040_qa_reports.sql`, SQLite integrity, zero foreign-key errors and valid project-specific finding/report sequences. Counts: 2 clients, 2 projects, 13 comments, 244 properties, 303 definitions, 38 events, 77 findings, 1 real QA report, 59 report findings, 2 counters, 4 attachments and 9 reactions. No production test comments or comparison runs were created.

Private environment excluding IMAGE SHA256: `3f9d6821d201e6aa1a4d95ba2ef833557966487a49c71bb9e18bfc243c1e8c59`. Compose: `2d4450b8f88b0fbdc2f64394a9fa507f136a35c0ef18dcc20984542acead3991`. Caddy: `02d8b7b5286f784443513cc29a5b6ded76b76282feb3b2c84fb8b1a27ac4515e`. OAuth credentials/scopes, project/billing/DNS and existing monitoring were not changed.

T27 Airshoppen corrections remain: phone/general primitive array example `["+421949336382"]`, explicit `system_customer` category on email_invalid, and the reviewed bounce-management description. Unrelated values, including the already correct event phone example, remain. Sandbox has 242 history rows and Airshoppen 668.

## T30 release evidence

02/03 dry runs pass for `9bc5e72-dirty`; fresh actual build/push started only after separate review/QA and scoped integration. Fresh pre-release off-site backups `2026-10-12T20-17-05-748Z` uploaded both projects with zero failures; both actual SDK downloads and restore rehearsals passed with zero warnings. Complete snapshot, image pin, live checks and final backup evidence are recorded after completion below.

Recovery uses the reviewed schema0040 full-data/config helper, SHA256 `4df03a5eed6650fb18e0300f0bbea39cf72d4d1ed95d3671c826018e37326695`, with the exact current snapshot path. Stop all writers, retain failed-release data, restore the consistent complete snapshot/config and start its pinned image. Never overlay an old SQLite file with newer WAL/SHM or downgrade only an image.

Main, staging and preexisting machine `.mcp.json` remain untouched. Supervisor is the sole team-record writer; scoped accepted commits/integration follow persistent D-73 authorization. An unrelated QA intake report is not included in this release commit.

### Completed compact-control release

Live image `9bc5e72-dirty`, immutable manifest `sha256:20fc8b7fba1089150b1976f50edbcaac2a51b6ff023f610ee81182f2d617f70a`. Fresh Docker backend/frontend build and push passed. Candidate was cached on the VM before stopping writers. Complete verified snapshot `/var/backups/e3-tracking/pre-collaboration-0040-20261012T202046Z` pins previous `sha256:6683b7c2e7636e039b6c45b3099a23e3be8405b9ef6746d9b60f180cdef170e9`.

03 actual deploy succeeded. Health HTTP200, database writable, exact schema0040, integrity/FK/sequences and all recorded counts passed. Private environment excluding IMAGE, compose and Caddy hashes above are unchanged. Active OAuth audit confirms all three public token headers stripped and no upstream token copying. Existing Caddy/OAuth containers stayed running.

Public `/tracking-plan/assets/index-D0HtCr9x.js` returned HTTP200, 1,465,445 bytes, with compact shared toolbar/filter/detailed-summary markers. `index-BeMDgXrs.css` returned HTTP200, 60,664 bytes, with h-8 and py-0 definitions. These establish deployed assets, not browser geometry.

Final `2026-10-12T20-24-27-517Z` off-site backups uploaded both projects with zero failures. Both SDK downloads completed, and both restore rehearsals passed with zero warnings. Independent whole portable JSON comparison between T30 pre/final files is exactly equal excluding ONLY root exported_at; array order preserved and object keys canonicalized. Every other field/table/history/file/app/client/project value remains. Sandbox history242/comments12/findings59/report1+59items and Airshoppen history668/comment1/findings18/reports0 are retained. MCP07 dry-run and actual handshake/tools-list pass with all29 tools.

T29 and T30 are DONE. No additional deployment permission is pending. Browser visual verification remains the disclosed tool limitation, not a claim of a completed screenshot check. The approved 32px source size is deployed; user can refresh the existing shared page to inspect actual geometry.
