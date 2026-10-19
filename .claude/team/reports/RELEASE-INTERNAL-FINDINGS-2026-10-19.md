# Internal Findings pagination and overview — T-5-55

Status: complete; reviewed source, independent QA, immutable hosted release and preservation/browser gates passed. D-91 implements the human request verified in Review One Day Only statuses. Existing scoped commit/integration/release authorization applies.

## Result
Internal Findings now uses the shared table frame, toolbar, search and density. Numbered pagination defaults to50 rows with25/50/100 choices, a full filtered range, first/previous/next/last controls and reset/clamping. The always-visible overview uses canonical runtime summary semantics across the entire project: open severity counts, manual acknowledgements and automatically resolved findings stay separate. Detailed problem-family/comparison summaries collapse independently. Historical CSV check instances remain in immutable QA reports.

Preserved backend priority order, event navigation, Resolve/Reopen, full filtered QaReports.currentFindingIds, current and historical comment/report links. Links to current findings outside the active page reveal their actual page and clear incompatible filters once. Keyed project state and request guards prevent stale project/filter/mutation reads. Overview failure does not block report fallback. All filters and page-size controls have accessible labels/hints. A final scoped width constraint prevents intrinsic native-select clipping on narrow screens.

## Changed source
- src/pages/Findings.tsx and Findings.test.tsx
- src/features/findings/FindingsOverview.tsx
- src/features/findings/FindingsPagination.tsx
- src/features/findings/internalFindingsModel.ts
- src/features/findings/QaReports.tsx
- src/domain/fieldHints.ts

Seven-file final manifest is retained privately at data/T-5-55-source-manifest.json. Final Findings.tsx SHA256:5006dcddb32a4f26c2b30b031a1b91c6dc37b99cb52acddbc81dd229f7c5623d. No backend/schema/dependency/access-policy changes.

## Verification
Independent reviewer read every changed source/test and verified final manifest.20 affected tests passed independently; final amended17 component/hint checks, production build and lint/types passed. QA also verified25 public regressions and real327/510/0/3-row model scopes.

Required initial full suite executed269 files/2630 cases:266 files passed, one existing restore test timed out, two Docker files skipped;2626 tests passed, one timed out, three skipped, plus a generic Vitest onTaskUpdate RPC error under concurrent build/QA load. This initial run is not claimed entirely green. The entire16-test backupRestore suite subsequently passed in isolation, including the original timeout case at4.59s. No coverage file was missing. Independent reviewer accepted this accounting; Docker smoke gates will run against the exact release image once built.

Root final-build browser acceptance: default50/page, next via keyboard,100/page reset and final27 rows, priority filter45 with full327 overview, empty search, linked current finding#327 on page5 with expanded discussion, project switching, explicit1open/1manual acknowledged/1automatic resolved and empty0, detailed326 Data Manager+1coverage, actual historical report HTML navigation and return. No browser errors/warnings. All seven toolbar inputs/selects fit actual containing bounds at375px,390px and default1280px; pager wraps and wide table stays inside its own scrolling region. Existing mobile brand-header overlap is unchanged and outside this slice.

Screenshots retained locally outside scoped Git staging:
- main .claude/team/reports/qa/T-5-55-local-desktop.jpg
- main .claude/team/reports/qa/T-5-55-local-narrow.jpg
- main .claude/team/reports/qa/T-5-55-local-narrow-controls.jpg

Fresh four GCS backups at2026-10-19T08-31-30-364Z downloaded and restored independently into separate schema0050 databases with zero warnings/missing files/FK violations. ODO frozen report/all110 checks/953failed/446615passed/140577skipped/7unmapped and both raw-source hashes/availability remain exact. Private receipts are under data/T-5-55-qa; no client backup/raw CSV is staged or included in Docker context.

## Release gates
Fresh read-only host audit captured schema0050/integrityOK/FK0. Reviewed schema0050 maintenance helper matches remote SHA256287985e41887577ed8172fea4d7da92f6fc719a7197aa2c25d4cb52174e9a897. Build/push and backup dry runs passed; backup actual uploaded4 with zero failures. Before deployment: clean exact commit, Docker smokes, fresh full data/config0050 snapshot and extracted DB/config verification. After deployment: exact running digest, health/browser and all business-table/access-policy/config/edge preservation. Full0050 recovery restores data AND configuration with the pinned old image, never an image-only switch across schemas.

Primary dirty task/captured-evidence-import remains at e6d398fe01559c29e07f2ea5544323bd275f5478; all38 original source hashes still match. Existing3020/3021/Cortex containers are preserved. Only owned QA3032 will be stopped after final acceptance.
## Final hosted acceptance — completed

Deployed application input dd6f823e2906b0f6c7a88aebecc929cedbffcd04 (tag dd6f823), clean scoped source integrated into agent-setup. Running immutable image:
`europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:ef47f61260d6d39a149819ab34ecf9206236a5604ea0235595fe0bc96ce6c8c2`.

02 build/push and03 deploy dry runs and actual executions passed. Exact-image container QA executed all three checks with zero skips: two Caddy identity/public-path checks and one strict32-tool MCP stdio check. Today’s isolated test resources were removed; older unrelated resources were retained. This closes the Docker skips from the initial full run without another broad rerun. Initial Vitest RPC/restore-timeout history above remains disclosed; the entire16-test restore suite passed independently.

Fresh full recovery point: `/var/backups/e3-tracking/post-portal-0050-20261019T085155Z`. Both archives and recorded image references passed checksums. Extracted database integrity/FKs/schema0050 passed. Extracted complete configuration was identical to live configuration before deployment. The reviewed recovery helper and separate configuration verifier are retained under reports/ops/.

Post-deploy health: ok=true, schema0050_historical_file_validation.sql, database writable, last upload successful. Expected and running digests match exactly. A final pre/post audit found **all53 database tables identical in both counts and full row hashes**, without needing any operational-table exception. Access policies, protected ODO identity/security, configuration except IMAGE and both Caddy/oauth2-proxy container IDs were identical. Thus all projects, original findings/statuses/comments/decisions, frozen historical report/source records and OAuth grants were preserved.

Actual hosted staff browser acceptance passed at:
https://tracking.e3-services.com/tracking-plan/p/one-day-only-production/findings

Live overview remained327open (158warning/169info) while actual page2 showed rows51–100 with50 rendered rows. Native controls fit their containing toolbar at390px and1280px in the deployed image; local final source also passed375px. No console warnings/errors. Existing staff session was reused. Browser viewport override reset and the live tab retained as the deliverable.

Final hosted screenshots (local, outside Git staging):
- C:/Users/Ján Pan/Documents/Business/E3 Github/e3-tracking/.claude/team/reports/qa/T-5-55-hosted-desktop.jpg
- C:/Users/Ján Pan/Documents/Business/E3 Github/e3-tracking/.claude/team/reports/qa/T-5-55-hosted-narrow.jpg

Fresh off-site restore receipts and complete browser/test evidence remain in ignored data/T-5-55-qa; hash-only pre/post host preservation receipts and release logs remain in the primary reports folder. No client CSV, database, backup, screenshot or credential was staged. No business/status/comment/approval mutation was used for hosted QA.

Final cleanup: verified owned QA process36960 and closed port3032; retained private fixtures/backups/evidence. User3020/3021/Cortex containers and unrelated QA leftovers were not changed. No required deployment or authentication step remains pending.
