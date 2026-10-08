# UI consistency release — D77 / T-5-18..20

## Approved scope
Visible definition counts beside every property name, including a single general definition. Counts toggle inline definitions; the existing editing shortcut remains. Category, property and definition names have distinct indentation, with other columns aligned. Shared presentation reuses internal branding and controls while keeping document navigation, wrapping text, comments, exports and access boundaries.

No backend, schema, OAuth, dependency or deployment-script feature changes. Main, staging and the existing machine-specific .mcp.json are preserved.

## Independent acceptance
T18: owner and reviewer each passed 10 tests across 2 files. Separate desktop and 390px browser QA passed count click/Enter/Space without an editor opening, the existing editor shortcut, copy, sort, filters, expand-all and collapse-all. Category/property/definition x positions were 328.8/360.8/384.8px; other columns stayed aligned. Long names and count badges remain readable with contained table scrolling. Accepted commit 4b18de7, integrated as a147a5f.

T19: initial review identified definition indentation and anonymous logo-route failures. Both were corrected in the frontend. Definitions now begin 18px deeper than their parent; both headers use a byte-identical bundled logo under the existing public assets route. Owner focused 46 tests across 5 files passed. Independent corrected presentation checks passed; the production build emitted assets/agency-logo-DOBV0Mr7.png. Separate desktop/390px browser QA passed: child indentation18px at both widths; loaded logo; full text/counts; named root/reply posting; copy actions; navigation; read-only composers absent; exports200 and private marker absent; no captured console errors. Accepted commit2f3283a, integrated as80ec422. Final integrated independent review confirms all12 frontend files exactly match accepted owner commits.

Final integrated full suite: 2115/2115 tests across215 files PASS (541s), build/lint PASS. An initial concurrent run had a Windows shell-helper failure and worker reporting timeout; after retiring owned QA servers, isolated13/13 and the complete serial rerun passed without source changes or unhandled errors. Production release is complete.

## Recovery and backup baseline
Current live baseline is 01b4230-dirty, schema 0038_comment_auth_sessions.sql. HTTPS health is healthy. Existing historical pre-0037 snapshot remains retained and is not the snapshot recipe for this release.

Fresh off-site backup timestamp 2026-10-08T13-35-19-658Z: two uploaded, zero upload failures. The remote job reported exit 0, while Windows SDK returned 1; independent object download and real restore rehearsal each passed with zero warnings. Airshoppen: 1068608 bytes, 23 events, 194 properties, 250 definitions, 1 comment. Sandbox: 698425 bytes, 15 events, 50 properties, 53 definitions, 10 comments and 2 attachments. Current user activity is preserved; do not assume the prior release's comment count.

New complete snapshot helper: ops/e3-maintenance-ui-schema0038.sh. Independent review verified only four declared substitutions from the accepted helper and preserved its fail-closed quiescence, private archives, checksum, database, ownership and recovery gates. SHA256 A517588CD6BFE2DF3D998DDBD1F5465BD23B7C2BE4DAE96A9759DE269CC11306. VM has 20GB data/13GB root free, about 8MB current data, and required snapshot tools. It captures the current image digest and expects schema0038. Complete current-schema snapshot verified at /var/backups/e3-tracking/pre-ui-0038-20261008T142650Z. It contains2clients/2projects/11comments and matching configuration; directory700, archives600, checksums PASS. Previous image01b4230-dirty remains the recorded recovery baseline.

## Test environment
Disposable OS-temp schema0038 database restored from sandbox with zero warnings; extra long-name/definition and private-marker fixtures added by QA. Owned API41608, compiled preview40168 and QA Vite41392 were retired after identity checks. Port3000 staging is untouched. Temporary share tokens, backups and credentials are outside Git. Screenshots saved in OS temp for final deliverables.

## Live release and final verification

Image input commit240efdefb677d6eec6bf63ce2c97815f967f7398, tag240efde-dirty; immutable registry manifest sha256:c13f97dee02182d0d23a2ed42dc18fdee0a9ba6ec70c660d93c1cc0f05cde39e. The dirty suffix reflects the excluded machine-specific MCP config; accepted application source is unchanged. App and backup run that exact image. Existing Caddy and OAuth proxy container IDs remained unchanged.

HTTPS health passes with schema0038 and writable data. Independent SQLite check: integrityok, foreign-key errors0,2clients/2projects/11comments/244properties/303definitions/38events, matching the complete snapshot. Private comparison of saved and current environment confirms every setting except IMAGE is identical, including staff/public OAuth and cookie values; secrets were not printed.

Actual live internal/shared count controls expand action's4definitions with no editor dialog. Shared full property descriptions and nested definitions render under the new internal-style brand/table presentation. Anonymous HTTPS logo response200,image/png,35674bytes. Released JS asset index-1Es8B4HO.js is loaded. Live390px viewport: body375px, loadedlogo2000px, mobileJumpTo and inline count expansion with0dialogs. Default1280px desktop shared proof and live internal proof are saved. No production test comments were posted.

Final backup timestamp2026-10-08T14-36-58-362Z:2written,2uploaded,0failures. Both off-site objects independently downloaded and restored with0warnings: Airshoppen1068608bytes (23events/194properties/250definitions/1comment), sandbox698425bytes (15events/50properties/53definitions/10comments/2attachments).07MCP dry-run and actual response-driven probe PASS29tools over IAP; no write tool called.

## Context and limits

BOARD/TASKS/CONTEXT/DECISIONS and GO-LIVE-RUNBOOK carry current acceptance/recovery pointers. Keep both historical and current complete snapshots and image pins; do not use the historical0036 script against current0038 data or start18b7883 on it. Future schema changes require matching reviewed version checks.

The optional local fixture access reset was rejected by automatic approval review; that disposable fixture stays read-only and its servers are stopped. Completed independent backup restores cover the gate; production access was not changed. Prior dependency patch follow-up and live consumer-Gmail test remain outside this UI-only scope; no new auth feature or notification-delivery test is claimed.

User-facing proof: outputs/live-ui-shared.jpg, live-ui-internal.jpg, live-ui-shared-narrow.jpg and the four independent QA images. Temporary verification tabs are closed; the user's live shared portal remains available. Main, local staging and machine.mcp were preserved.
