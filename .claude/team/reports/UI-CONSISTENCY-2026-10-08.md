# UI consistency release — D77 / T-5-18..20

## Approved scope
Visible definition counts beside every property name, including a single general definition. Counts toggle inline definitions; the existing editing shortcut remains. Category, property and definition names have distinct indentation, with other columns aligned. Shared presentation reuses internal branding and controls while keeping document navigation, wrapping text, comments, exports and access boundaries.

No backend, schema, OAuth, dependency or deployment-script feature changes. Main, staging and the existing machine-specific .mcp.json are preserved.

## Independent acceptance
T18: owner and reviewer each passed 10 tests across 2 files. Separate desktop and 390px browser QA passed count click/Enter/Space without an editor opening, the existing editor shortcut, copy, sort, filters, expand-all and collapse-all. Category/property/definition x positions were 328.8/360.8/384.8px; other columns stayed aligned. Long names and count badges remain readable with contained table scrolling. Accepted commit 4b18de7, integrated as a147a5f.

T19: initial review identified definition indentation and anonymous logo-route failures. Both were corrected in the frontend. Definitions now begin 18px deeper than their parent; both headers use a byte-identical bundled logo under the existing public assets route. Owner focused 46 tests across 5 files passed. Independent corrected presentation checks passed; the production build emitted assets/agency-logo-DOBV0Mr7.png. Separate desktop/390px browser QA passed: child indentation18px at both widths; loaded logo; full text/counts; named root/reply posting; copy actions; navigation; read-only composers absent; exports200 and private marker absent; no captured console errors. Accepted commit2f3283a, integrated as80ec422. Final integrated independent review confirms all12 frontend files exactly match accepted owner commits.

Final integrated full suite/build/lint and production release are pending. No claim of completion until those gates pass.

## Recovery and backup baseline
Current live baseline is 01b4230-dirty, schema 0038_comment_auth_sessions.sql. HTTPS health is healthy. Existing historical pre-0037 snapshot remains retained and is not the snapshot recipe for this release.

Fresh off-site backup timestamp 2026-10-08T13-35-19-658Z: two uploaded, zero upload failures. The remote job reported exit 0, while Windows SDK returned 1; independent object download and real restore rehearsal each passed with zero warnings. Airshoppen: 1068608 bytes, 23 events, 194 properties, 250 definitions, 1 comment. Sandbox: 698425 bytes, 15 events, 50 properties, 53 definitions, 10 comments and 2 attachments. Current user activity is preserved; do not assume the prior release's comment count.

New complete snapshot helper: ops/e3-maintenance-ui-schema0038.sh. Independent review verified only four declared substitutions from the accepted helper and preserved its fail-closed quiescence, private archives, checksum, database, ownership and recovery gates. SHA256 A517588CD6BFE2DF3D998DDBD1F5465BD23B7C2BE4DAE96A9759DE269CC11306. VM has 20GB data/13GB root free, about 8MB current data, and required snapshot tools. It captures the current image digest and expects schema0038. Production maintenance has not started.

## Test environment
Disposable OS-temp schema0038 database restored from sandbox with zero warnings; extra long-name/definition and private-marker fixtures added by QA. Owned API PID41608 on3001. Only QA-owned Vite uses3010; port3000 staging is untouched. Temporary share tokens, backups and credentials are outside Git. Screenshots saved in OS temp for final deliverables.
