# Findings table and property corrections — release 2026-10-12

The approved shared Findings table is deployed. Current image `f1edc1c-dirty`, immutable manifest `sha256:a1c6b459a406ff838dc150b2ce7482e7135d2f5ebbf8467574d1ee98d54de783`, schema `0040_qa_reports.sql`. Source task `ed504ee` integrated as `5795058`; image input HEAD `f1edc1c` contains only accepted source plus team records. Main, staging and preexisting machine `.mcp.json` were untouched.

The table reuses shared entity presentation: Number, Severity, Event, Message, Status and Actions. Comparison is secondary message context; full names and descriptions wrap. Exact finding comment/history targets, sidebar/event links, separate current/report row anchors and original Markdown export remain. Public documents project open findings, so Open is the finding state, distinct from discussion status.

Owner build/TypeScript/color lint passed. Owner and separate reviewer/QA each passed 15 focused tests across three files. Actual desktop/narrow browser visual geometry was not checked: agent CUA still fails Windows sandbox setup refresh while the user's browser works. The user explicitly directed proceeding with SDK release; this limitation is disclosed rather than treated as a blocker to the authorized release.

## Deployment evidence

02 and 03 dry runs preceded actual build/push/deploy. Google SDK reauthentication was completed by the user. New immutable image was cached on VM before maintenance. Fresh full data/config snapshot:

`/var/backups/e3-tracking/pre-collaboration-0040-20261012T104906Z`

It pins previous image `sha256:d7f42dc234e78c1acc551de5a1832c6599df37ab7d4b76a06843a1ad86203dcf`. Use the existing reviewed schema0040 full-snapshot rollback helper; do not perform an image-only downgrade or overlay old SQLite with newer WAL files.

Health HTTP200, database writable. Before/after schema, integrity, foreign keys and sequence audit pass. Counts preserved: 2 clients, 2 projects, 13 comments, 244 properties, 303 definitions, 38 events, 77 findings, 1 real QA report, 59 report findings, 2 counters, 4 attachments and 9 reactions. No test comments or comparisons were created in production.

Private `.env` excluding IMAGE SHA256 `3f9d6821d201e6aa1a4d95ba2ef833557966487a49c71bb9e18bfc243c1e8c59`, compose `2d4450b8f88b0fbdc2f64394a9fa507f136a35c0ef18dcc20984542acead3991`, Caddy `02d8b7b5286f784443513cc29a5b6ded76b76282feb3b2c84fb8b1a27ac4515e` unchanged. Active Caddy JSON token-header audit passes. Public `/tracking-plan/assets/index-CGdTnKlq.js` HTTP200 (1460378 bytes) contains the new table/current-finding anchors; CSS index-CoxlLEa9.css HTTP200 (60424 bytes). These asset checks are not a screenshot or browser rendering claim.

## Narrow Airshoppen data corrections (T-5-27)

The customer phone/general example now remains a primitive string array with `+421949336382`; already-correct event phone is unchanged. `email_invalid` has explicit `system_customer` category override. Property/general description now states that Bloomreach invalidation excludes future email campaigns but does not block transactional email, according to the supplied bounce-management document.

Reviewed operator helper `ops/e3-correct-property-data.cjs`, SHA256 `E6EECF50544D74D5EB6547C52EF03F5C4DD26D4BDB872802B45C1DC52D88B6F2`, uses existing explicitly trusted loopback API and honest actor `e3-maintenance@localhost`. No Google impersonation, auth-mode change, new scopes or raw SQL writes. Initial dry run failed closed on legacy primitive example shape with zero writes. Revised helper passed nine independent pure fixtures plus actual isolated legacy/object API contracts before reviewed replacement.

Successful dry run wrote no API data and captured original private baseline. Three minimal PATCHes produced five exact audit-history rows, with unrelated fields unchanged; reapplying the same private plan produced zero writes. Private original/after evidence remains `/data/t27-correction-20261012/plan.json` in a secured directory; temporary in-container helper was removed. Internal and anonymous shared tracking-document assertions pass for the phone, category and both descriptions; event-phone preservation passes. No global reserved-property registry change was made.

## Backup and connector checks

Pre-release off-site backups `2026-10-12T10-46-50-244Z` and final backups `2026-10-12T11-02-42-805Z`: two uploaded, zero failures each. Both actual SDK downloads and both restore rehearsals pass with zero warnings. Sandbox retains its genuine 1 report/59 report items/12 comments; Airshoppen retains 1 comment. Final health confirms backup/upload success. 07 dry run plus actual MCP initialize/tools-list handshake passes with 29 tools. No monitoring configuration change or new alert-delivery test was part of this UI/data release.

## Final independent data acceptance
Independent full canonical off-site JSON comparison PASS. Airshoppen has exactly four changed target rows and five new single-field update histories (663 original rows retained identically, final 668). Only approved example/category/description fields and four updated_at timestamps differ; every unrelated row/table/file/client/project/app value is identical. Event-phone entire row is identical. Sandbox whole backup is identical except exported_at, including genuine report evidence and attachments. T27/T28 delivery complete; actual browser visual geometry remains the disclosed limitation under the user's explicit direction to proceed.
