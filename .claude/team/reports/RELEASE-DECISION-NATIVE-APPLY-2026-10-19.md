# Native Decision inbox execution — VM release

T-5-56 / D-92. The user verified the local Approve and apply flow and explicitly requested the VM update. The reviewed release is now deployed and verified on tracking.e3-services.com.

## Scope

New proposals can carry exact native use-case status transitions and event variant creates. Approval applies those operations, documentation and an immutable execution receipt atomically. Preview checks run in a rolled-back savepoint. The approval hash binds the documents and native target baselines; stale or invalid proposals cannot partially execute. Replays return the original receipt without duplicate variants. Overlapping variant predicates are rejected. Source-change follow-ups remove executable operations, and restored history remains read-only.

The UI shows the exact actions, bounded amendment controls, resulting native record IDs and a separate E3 changes applied / QA pending state. Existing documentation-only proposals and approvals retain their original authority. Local synthetic approvals are not imported into hosted ODO. No schema, dependency, auth, grant, certification, observation or external Bloomreach changes are included.

## Clean source and preservation

Release source is isolated in the managed decision-native-release worktree, based on agent-setup 144cfa245f47febda99c7b32bfd021304c15b9a8 (docs-only successor of deployed application dd6f823). The exact ten-file manifest is T-5-56-release-source-manifest.json. Independent source review verified all ten hashes and passed the final overlay. Existing promotion-aware documentation baselines, route Origin enforcement, Findings hints and deployment configuration were preserved. The dirty primary checkout is retained unchanged outside task records.

## Verification before image build

Clean production build and type/color lint passed. Native/inbox/source/HTTP/promotion/database/catalog-restore checks passed 73 tests across seven files. In the initial bounded eight-file run, eleven existing restore tests exceeded their 15-second timeout under machine load; no assertion failure was reported, and a full roundtrip with a 60-second allowance passed. The restore fixture was rerun alone with one worker and a 90-second per-test limit; no source or assertions were changed.

The isolated restore rerun passed all 16 assertions, including stale/replay/hash/batch cases and the full roundtrip, in 284 seconds; maximum fixture duration was 33 seconds. Its runner still exited with one onTaskUpdate transport timeout. This is retained as an infrastructure error, not silently represented as a clean exit. Four actual offsite restore rehearsals bypassed the Vitest worker transport and all passed.

The earlier primary full run is recorded in DECISION-NATIVE-APPLY-2026-10-19.md, including corrected hint failures, the older default Docker MCP failure and Vitest RPC timeout. It is not represented as a green full suite. Final clean-source UI/hint checks passed13 tests. Exact candidate image Docker checks passed all3 assertions across2 files with zero skips, including strict32-tool MCP stdio and both Caddy identity/security checks. The first MCP attempt failed before the server started because the local test subnet overlapped an existing stack; a private invocation-only COMPOSE_FILE network override allowed an isolated allocated subnet. No source, production network or existing local stack was changed. Total focused assertions passed:105 (73+16+13+3). Original runner limitations remain disclosed.

Actual local browser verification and the user's own review confirmed stale blocking, fresh amendment, one-click status plus five variants, receipt IDs and native page readback. This did not set certification or add observations.

## Recovery and remote gates

Fresh project backups uploaded successfully at 2026-10-19T12-45-18-760Z.json: four written/four uploaded, zero failures. Downloaded byte sizes and hashes are retained privately under data/T-5-56-qa. All four independent actual clean-source restore rehearsals passed with exit0 and zero warnings. ODO retained 17 events, 32 variants, 425 event-property links, 33 use cases, 24 decision revisions, two historical source records and three reports; no observations were added. No client backup is staged.

Initial VM audit passed schema0050, integrity and foreign keys. App and backup use old digest ef47f61260d6d39a149819ab34ecf9206236a5604ea0235595fe0bc96ce6c8c2. Current compose and Caddy configuration exactly match the clean release source. Recovery helper SHA256 is 287985e41887577ed8172fea4d7da92f6fc719a7197aa2c25d4cb52174e9a897. A fresh pre-deploy audit and verified quiescent full data/config snapshot precede rollout. Any failure after stopping writers requires recovery of the old services before ending work.

## Final deployment evidence

Exact ten-file feature commit: 9b6ca2fe85ced77c87f278dac3c2f8ed2d99a12d, clean branch codex/T-5-56-native-decision-apply, integrated by checked fast-forward into agent-setup. Main and the dirty primary application work were preserved.

Immutable deployed image:
`europe-west1-docker.pkg.dev/e3-tracking/e3-tracking/e3-tracking@sha256:be90854055c22343ef81ba2640c072addb1cc8245b8bd1bf3e0863d2f3ea6a6a` (tag9b6ca2fe).

Build/push and deployment dry runs and actual operations passed. The candidate was preloaded before downtime. Fresh quiescent whole-data/config recovery point: `/var/backups/e3-tracking/post-portal-0050-20261019T132505Z`. Archive/image-reference checksums passed, extracted database integrity/FKs/schema0050 passed, and the complete extracted configuration was identical to live configuration before rollout. The old image remains recorded in that recovery point.

Expected and running digest match. App, backup and an owned one-off MCP container resolved the exact candidate image; the MCP image probe imported no application code and opened no database. Its random ownership label was checked before removing that proof container. Production compose/Caddy file checksums passed. Health confirms ok, schema0050, writable database and successful upload (last backup at2026-10-19T13:28:23.595Z).

Final preservation receipt T-5-56-preservation-result.json verifies all53 database table counts and full row hashes identical before/after deployment, with zero exceptions. Access policies, protected ODO identity, configuration exceptIMAGE and both Caddy/oauth2-proxy container IDs were identical. No business, decision, observation, status or certification mutation was performed for hosted QA.

Actual authenticated hosted UI verification passed at https://tracking.e3-services.com/tracking-plan/p/one-day-only-production/decisions. The new immediate-native-application header and separate applied count are visible. The preserved current inbox showed8 awaiting review,16 documented and0 native applied. Existing prose-only cards correctly retain documentation authority; this release does not convert or execute them. No browser warnings/errors were reported. The live tab is retained for the user.

Screenshot: C:/Users/Ján Pan/.codex/visualizations/2026/10/19/01a1535e-8ffd-76b3-a23b-2ae38a90bda0/odo-tracking-qa/native-approval-vm-live.png. Private independent QA receipts and backup bytes remain ignored under data/T-5-56-qa. No client source, backup, database, screenshot or credentials are committed.
