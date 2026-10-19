# Internal Findings pagination and overview — T-5-55

Status: accepted local candidate; immutable image release and hosted preservation/browser gates pending. D-91 implements the human request verified in Review One Day Only statuses. Existing scoped commit/integration/release authorization applies.

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
