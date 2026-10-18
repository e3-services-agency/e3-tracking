# Hosted ODO authority and historical-file validation release

Completed 2026-10-18 under D-90, after independent implementation, source/security review, QA, actual hosted execution, native MCP and browser readback, and fresh off-site restore proofs. T-5-53 and T-5-54 are DONE. The original dirty checkout/local3020/local3021/Cortex remain preserved.

## Accepted deployment

Application input: clean commit `41a21a8e84844fe0847fca7a91ea926111a88206`, integrated on agent-setup. Immutable image `europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:bcf88eb3747df57dab84746c0030793a38488b31bfdcf5c59ef91c30a1d979fd`; exact schema `0050_historical_file_validation.sql`. Running digest, health, integrity and foreign keys passed. No VM resize, heap override, new infrastructure, Google scope or grant expansion.

The first candidate22d2f53 was withheld after a late restored-backup HTML-count injection proof. Corrective ec4c2fd escaped every report count and retained frozen evidence; it deployed schema0050 and the scoped promotion. Actual-file preview then exposed ~484MiB retained heap on the VM's ~497MiB default V8 limit, before any report existed. The final parser-only41a21a8 replaces per-character cons-string chains with contiguous source spans. Its actual deployed engine fingerprint is recorded below. Both original uploads were reused; no duplicate source/report or invented observation.

Final75-file source manifest SHA256 `b73d990b5d41d3e82e7b14fb448b18d9f939994a2a9e42968a637ad26796b3d6`. Application code remains that exact accepted source; later release-record commits do not change the running image input.

## Existing-project promotion and preservation

Existing hosted target `c992ddce-ef2f-49c1-8275-84806f08f744`, key `one-day-only-production`, retained its identity, client, name and security/sharing fields. Source local3021 project `7b32a76a-4f13-4e1c-98eb-c930c1a4d89c`; exact source packet SHA256 `c66e28f0d1aa0e19af1ada84e8404a4343f74185e51b6bb3b28e5de7214739fc`. Read-only current export matched the packet before execution except natural exported_at.

Promotion receipt `4b26acac-9ae6-449f-8a97-6672437037d5`, plan `a2380b59b2d2afd7263f95f3d7f0b3c9a8260ffe4087a33ac9ddc4e54dff71f5`, result `b6d64c14822af731c9de784c4c96f86b3e1ba7b7d18f2f53740e69427283d6a1`. Exact replay reused that receipt. Immediate pre-file-validation hosted backup SHA256 `2b16c771ecd7e340d9200b6921d2fb919984d75f69171dcebf142930b6c20527` passed the independent36-table source verifier and strict JSON-type comparison with zero differences except authorized outer operational project_id translation.

Preserved:12events,125properties,435definitions,312event-property links,33use cases,86requirements,327original findings,3archived captured QA runs,0observations,15decision revisions/46events/1source capture,5mapping packages/9asset links,10comments. History914→915 adds one explicit promotion audit. All15 derived decision cards and the complete33-use-case implementation response match the source, including all7already-stale decisions and0restored; identity_mode changes local→proxy. No business approval/current platform state/runtime implementation/certification is inferred from captured evidence.

Final consistent whole-host audit confirms73 unrelated project/global row groups, all OAuth client/grant/project/member/share policies, protected target fields, stable configuration and edge container IDs unchanged. Original ODO events/properties/definitions/links/use cases/requirements/findings/runs/observations/decisions/source/link/comment groups are unchanged after historical validation. Only intended source/report/counter rows were added or advanced.

`DECISION_INBOX_ENABLED=true`; `PROJECT_PROMOTION_ENABLED=false`. The temporary promotion flag was disabled after promotion, parity and replay; private runtime operator helpers/receipts were removed after retention. Other environment bytes stayed identical; stable configuration SHA256 `707cfb6ba1a6dcac19fa229f72cc02da56666aedc0fcb0f1490363cd1b7540c9` excludes only image and these two authorized flags.

## Actual sources and immutable report

- Purchase `events_1792067023.csv`:5136236bytes/4885records/35headers; SHA256 `5f34ab89ed707fd0c77569228e4e0b28726504a1e3b1191beea3adfadf6aab34`; native source `9462f058-28a4-4e88-b4a5-1cf3d03977c6`.
- Item `purchase_items_1792067024.csv`:16181517bytes/8644records/44headers; SHA256 `d6d6e3f7b5e05f7345f75316ebbd8e2903bff6d5881f1e4967559d3b9a527f56`; native source `3cd5129a-e35d-4b18-832f-d6719910096e`.
- Reviewed original manifest SHA256 `00fa424d4d02df8438e58ca76e3dcce6a588b5a3ddf749dca25eb3fcde4834e2`:72exact native event/property/definition links,7explicit source-only purchase columns, optional category_1..category_10 suffix padding, one-to-many purchase_id join. Only uploaded source IDs/join references were rebound.

Native historical report **#001**, report ID `e24aa201-9048-4d31-9599-8b0b8dfd00b6`.

[Open staff report](https://tracking.e3-services.com/api/projects/c992ddce-ef2f-49c1-8275-84806f08f744/historical-files/reports/e24aa201-9048-4d31-9599-8b0b8dfd00b6/view).

Identity/preview hash `0ae1fd9b2690be424eafa984e495d03c0ef0082b3e6719b7981972555b4bbabb`; frozen definition hash `ceb80a9762b917e96a3454ea70703e092bca6575b2b9fe1064ee2c99066902ad`; actual Docker-runtime engine hash `97a2c681dc7eab03d3f21b013b084bdf01f91150ce0a46bc47cf9ef2d1be85d5`. Local transpiler fingerprints differ; this actual hosted value is authoritative for this report.

110aggregated checks:446615passed/953failed/140577skipped check instances,447568checked,7unmapped source-only columns. Failed groups are609purchase discount_value and344item is_best_seller lexical/draft-policy conflicts, each with20bounded logical CSV record references and no source cell values. These are check instances, not order counts. All joins have zero failures. Original event timestamps, temporal/freshness/live coverage, arithmetic and discount semantics remain explicitly unverified. Upload capture time remains null; separate18Oct10:50UTC Drive recheck matched original bytes and does not invent event time. Historical validation creates no runtime observations/findings/status/certification or business approval changes.

## Actual MCP, UI and security proof

The existing Codex grant was reused without sign-in/new consent/config persistence. Fresh client catalog30 includes `preview_historical_validation`, `apply_historical_validation`, `get_historical_validation`; template scope was deliberately not selected. Full image stdio catalog32 passed strict independent smoke without skip. Current long-lived chats may need a client catalog refresh to see the three added tools; no expanded grant is needed.

Actual authenticated HTTPS MCP preview matched the concrete native API preview; apply was called once and created report#001; get read100+10 checks. Independent staff API also read all110 and exact apply replay reused the same report/identity. Source availability2/2 and hashes were verified. The corrected application had0automatic restarts/OOM events through this successful sequence. Actual hosted QA-row Open historical report navigation, fully usable HTML viewport and post-snapshot reload passed; local screenshot is retained outside Git at the main checkout's `.claude/team/reports/qa/T-5-54-hosted-native-report.png`. Canonical /api and the clicked /tracking-plan/api alias both work.

Independent review/QA covered exact source binding, stale/replay guards, composite project/report backup FK, staff Host/Origin, grant/project/read-vs-write enforcement, private report/comment/history exclusion, encoded/case raw-file denial, count escaping and restored event-link provenance. Actual diagnostics contain none of20sample source email values. No raw client CSV, backup, report bodies or credentials are committed or embedded in the image.

## Verification and recovery

Independent coverage:268test files/2619distinct checks across the initial full run and explicitly documented affected/environment reruns. The initial full run was not green: two new failures (header hints and failed-row example budgeting) were fixed; two preexisting dependency-junction collection failures passed isolated preserveSymlinks reruns. Later count-escaping/parser cases passed affected suites. Final parser review26edge/limit tests plus23000deterministic old/new differential and valid round-trip cases,34affected tests, production build/full lint and exact-image32tool smoke passed.

Actual two-file full HTTP preview/apply/replay/backup/restore passed at256/384MiB old-space caps with identical110checks, policy/reasons/row references/files/totals. Parser/engine RSS~208MiB, HTTP preview~314MiB/after apply~366MiB; broader export/restore harness peak~509MiB. No host memory setting was increased.

Verified full data/config snapshots with checksum, extracted DB integrity/FK/schema and extracted configuration comparison:

- Pre-upgrade0045 `/var/backups/e3-tracking/post-portal-0045-20261018T111110Z` pins prior30a9714/f267 image. Only for recovery to that pre-promotion point, using the0045helper.
- Pre-parser-correction0050 `/var/backups/e3-tracking/post-portal-0050-20261018T114032Z` retains promoted ODO and both exact uploads, before report capture.
- **Final accepted0050 `/var/backups/e3-tracking/post-portal-0050-20261018T115340Z`** retains the corrected image, both sources and actual report#001. Use `ops/e3-maintenance-odo-schema0050.sh` for a later full0050 recovery. Restore full data AND configuration with the recorded pinned image; preserve failed state and revoke restored operational credentials/shared sessions. Never run an old image on migrated data or overlay old SQLite/new WAL.

Final off-site job2026-10-18T11-50-02-368Z uploaded all4existing projects with zero failures. All4actual downloaded GCS backups independently restored through the real service into fresh databases with0warnings. ODO object31920767bytes, SHA256 `357f985fd0c640a6a23483ab7031f5e8497e8e339e1860a25290d6725ebe6e11`. Both restored source bytes rehash exactly/available2of2; frozen manifest/snapshot/result/hashes and all110checks are exact; integrity/FK/reexport warnings pass. Historical provenance stays frozen while operational IDs remap and restored OAuth authority is cleared. Strict final original36-table proof has exactly one expected field change: report_next1→2; finding_next328 stays unchanged. The unadjusted verifier's counter exception is retained honestly.

Private local receipts are under the managed worktree `data/odo-hosted-execution-20261018/`, including independent-final-qa-receipt.json, independent-final-offsite-restore.json, independent-final-business-preservation.json, independent-derived-decision-implementation.json, native-mcp-validation.json/raw events and final-native-report-full.json. Actual4GCS downloads are in data/odo-final-offsite-backups-20261018. VM operator stage is private0700 at ~/e3-upgrade/odo-authority-20261018; no raw client evidence enters Git. Source chat Review One Day Only statuses owns final briefing/Cortex synchronization and received actual URLs/hashes/receipts plus final-gates PASS.
