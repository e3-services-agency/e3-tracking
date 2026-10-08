# Live GCP upgrade runbook: e3-tracking

## Current release — compact UI and Google photos, 2026-10-08

Live `b2b31be-dirty`, exact schema `0040_qa_reports.sql`, immutable manifest `sha256:d7f42dc234e78c1acc551de5a1832c6599df37ab7d4b76a06843a1ad86203dcf`. T25/T26 complete: compact Markdown row icons,14px finding text, available Google photos. Full2196tests/228files, lint/build and separate source/browser/real-photo QA passed. Live integrity/FK/sequences and latest genuine user data retained:13comments/77findings/1QA-report59items/4attachments9reactions plus all existing projects/entities.

Complete recovery snapshot `/var/backups/e3-tracking/pre-collaboration-0040-20261008T210221Z` pins prior6548b941... manifest; use the reviewed0040 helper, never the historical0038 helper or image-only downgrade. It preserves failed-release data/config before full restore. Restore proxy config disabling access-token forwarding before accepting old edge config. Active edge strips allthree public OAuth tokenheaders bothways, verified/reloaded BEFORE the proxy access-token flag. Private settings exceptIMAGE are unchanged; no new scopes or identity changes. Final04offsite2026-10-08T21-09-56-204Z both downloaded/restored0warnings; MCP29tools PASS. Authoritative [final release evidence](COMPACT-UI-PHOTO-RELEASE-2026-10-08.md).

## Previous release — collaboration, 2026-10-08

Live `52f986a-dirty`, schema `0040_qa_reports.sql`; manifest `sha256:0152966e6db99a8b99f2fe3f2b7c11f7e77f116e513768557411c51500fb9f39`. Full2166tests/223files, lint/build and independent review/QA passed. Live integrity/FK/sequences passed;2clients/2projects/12comments retained with244properties/303definitions/38events. Reports begin with the next real comparison. OAuth/configuration and edge services verified unchanged.

Fresh rollback snapshot `/var/backups/e3-tracking/pre-ui-0038-20261008T185841Z` pins previous240efde-dirty/c13f97de. Final off-site backups2026-10-08T19-02-50-420Z both restored0warnings. MCP29tools passed; existing HTTPS monitoring/alert email verified. Full evidence and recovery details: [COLLABORATION-RELEASE-2026-10-08.md](COLLABORATION-RELEASE-2026-10-08.md).

For a future upgrade FROM0040, take a fresh snapshot with the reviewed0040 helper. For THIS release's rollback TO0038, use the0038 helper with the exact fresh snapshot above, preserving failed-upgrade data/config first. Never image-only downgrade or overlay old SQLite/new WAL. Historical procedures below retain their original schema-specific assertions.


## Historical release — UI consistency, 2026-10-08

Live240efde-dirty, schema0038; registry manifest `sha256:c13f97dee02182d0d23a2ed42dc18fdee0a9ba6ec70c660d93c1cc0f05cde39e`. Reviewed image input240efde; T18/T19 source commits4b18de7/2f3283a. Full2115tests/215files, build/lint, separate review/browserQA and live internal/shared desktop/390px checks PASS. Current data:2clients,2projects,11comments,244properties,303definitions,38events; integrityok/FK0. Existing OAuth/settings and edge services verified unchanged.

Complete current-schema snapshot `/var/backups/e3-tracking/pre-ui-0038-20261008T142650Z`, directory700/archives600, checksums/schema/counts verified. It pins the previous01b4230-dirty image for recovery. Use [the independently reviewed current0038 helper](ops/e3-maintenance-ui-schema0038.sh); SHA256 `A517588CD6BFE2DF3D998DDBD1F5465BD23B7C2BE4DAE96A9759DE269CC11306`. The historical0036 helper below is retained only for the earlier migration recovery.

Final off-site backups2026-10-08T14-36-58-362Z uploaded2/failures0; both actual downloads restored with0warnings. MCP07 dry-run/actual PASS29tools. Credentials/backups remain outside Git. See [UI acceptance and live evidence](UI-CONSISTENCY-2026-10-08.md).

## Historical procedure for a UI-only upgrade on schema0038

1. Require approved source, independent review and local browser QA, then full tests/build/lint. Run02-build-push with --dry-run before --yes; record source commit/tag/immutable manifest and pre-pull the candidate before downtime. Main, staging and machine-specific MCP config are separate.
2. Run04-backup --run-now with its dry-run first; independently download/restore the objects. Confirm current image/schema, required tools and free space. Upload the current0038 helper through the Windows SDK wrapper documented in DEPLOY.md; verify its hash. Suspend app/backup/MCP writers and run its snapshot mode. Require its exact verified private snapshot path and current counts. Services remain stopped after snapshot.
3. Run03-deploy REVIEWED_TAG --dry-run, then --yes after snapshot acceptance. Existing .env must stay intact except IMAGE; compare against the snapshot privately, without printing secrets. Edge images remain unchanged unless separately approved.
4. Verify expected app/backup manifest,0038/writable health, SQLite integrity/FK/current counts, public logo asset200, internal/shared counts/hierarchy/full text and mobile navigation. Verify comments/identity/read/export boundaries appropriate to the approved change.
5. Run04 final backup and07 MCP, each dry-run first. Download and restore the final backups; retain snapshot and previous immutable image. Refresh BOARD/TASKS/CONTEXT/DECISIONS and the deployment handover with actual evidence and limits. Retire only owned QA services/tabs.

For recovery, use the current0038 helper's rollback mode with the exact verified snapshot path. It stops writers, preserves failed-release data/config before restoring, verifies0038/ownership, and starts the recorded old image without pulling. Do not start18b7883 on a0037/0038 database. Future migrations require reviewed helper version checks matching that future schema; do not silently reuse a0038 assertion.

## Historical shared-portal upgrade (completed before the UI release)

Production is running at https://tracking.e3-services.com. The user authorized reviewed upgrades and task commits/integration (D-73). Local staging stays untouched. This runbook records the completed shared-portal upgrade from18b7883/schema0036 to01b4230-dirty/schema0038. Credentials remain outside Git.

### Historical operator checkpoint

Live release manifest: `sha256:174829aecdaa55876d29aa3fd98d1d45a471cc51de81f86f062f88a01ffb0128`. Verified complete pre-upgrade snapshot: `/var/backups/e3-tracking/pre-0037-20261008T122119Z`, root-private directory700/archives600. Both post-upgrade off-site backups timestamp2026-10-08T12-27-00-412Z restore with0warnings;29-tool read-only MCP discovery and HTTPS monitoring check pass. Detailed evidence/remaining account-specific limits: DEPLOYMENT-HANDOVER-2026-10-08.md and PORTAL-QA-2026-10-08.md.

Final07 operator probe uses the accepted response-driven handshake56c47df; independent24/24 and live dry-run/actual29tools PASS. It fixes slow Windows/IAP startup without changing the deployed image. T16 complete; application source is01b4230 and later operator/docs integration isdbe81d0.

The snapshot verification script below specifically expects schema0036 and is retained for this completed upgrade/recovery. Do not rerun it against the current0038 database as a future upgrade recipe. Future schema changes need matching version checks and a fresh reviewed data/config snapshot.

## 1. Verify and build

Complete separate code review, local browser QA, build/lint/tests and a project backup restore rehearsal. Use the Windows short-path SDK wrapper in [DEPLOY.md](../../../docs/DEPLOY.md#windows-sdk-and-maintenance-invocation). Confirm project e3-tracking, VM e3-tracking in europe-west1-b, health, image digest and free disk space. Record the exact reviewed commit and registry digest. No infrastructure recreation or local staging rebuild is part of this upgrade.

```bash
bash deploy/gcp/02-build-push.sh --dry-run
bash deploy/gcp/02-build-push.sh --yes
bash deploy/gcp/03-deploy.sh REVIEWED_TAG --dry-run
bash deploy/gcp/04-backup.sh --run-now --dry-run
bash deploy/gcp/04-backup.sh --run-now --yes
```

Verify the off-site project backup upload. It complements the full snapshot and cannot substitute for it.

## 2. Quiesce and snapshot

Suspend MCP clients/host jobs. Follow the complete [maintenance snapshot and rollback commands](../../../docs/DEPLOY.md#upgrade-and-rollback-across-schemas-00370038). Save that LF/UTF-8 maintenance script locally, syntax-check it, upload using the Windows SDK, and run `sudo bash ~/e3-upgrade/e3-maintenance.sh snapshot` on the VM.

The script stops app/backup/one-off MCP data writers, preserving running Caddy/oauth2-proxy, refuses other live-volume containers or host database writers, archives complete `/data` and `/opt/e3-tracking` into a root-only directory (mode 700) with mode 600 files, verifies archive/hash/path safety, and checks an extracted copy with the pinned old image without running app migrations. Require schema 0036, integrity/foreign-key success and expected counts. Record the exact verified snapshot path. Services remain stopped until deployment.

## 3. Configure and deploy

While stopped, use the private root SDK/script channel to add the four public keys from DEPLOY.md:

```text
GOOGLE_COMMENT_CLIENT_ID=1001419691959-vjn2nb335rn91u33gs1so12kj8mhau45.apps.googleusercontent.com
E3_PUBLIC_ORIGIN=https://tracking.e3-services.com
COMMENT_STAFF_SESSION=1
WORKSPACE_DOMAIN=e3-services.com
```

The existing Internal staff OAuth values and cookie secret stay intact. Do not print `.env`, resolved compose configuration or container environment.

```bash
bash deploy/gcp/03-deploy.sh REVIEWED_TAG --yes
```

The script pulls app/backup only (on-demand MCP uses the same cached image); cached edge images remain unchanged. If reviewed edge config changed, explicitly recreate edge services with the documented no-pull command after installation; otherwise leave them running. A health failure exits nonzero and requires investigation; no automatic image-only rollback is attempted.

## 4. Verify before closing the maintenance window

Require expected app/backup image digest, health writable data and `0038_comment_auth_sessions.sql`, guest identity and required-name behavior, Google sign-in/profile/sign-out, trusted Workspace identity reuse, read-only/revoked/private visibility boundaries, table wrapping and reply-link reload. Actual Google browser flow is a separate check from local token fixtures. Compare project/client/comment counts with the snapshot; schema/session changes are additive.

```bash
bash deploy/gcp/04-backup.sh --run-now --dry-run
bash deploy/gcp/04-backup.sh --run-now --yes
bash deploy/gcp/07-mcp.sh --dry-run
bash deploy/gcp/07-mcp.sh
```

Verify off-site upload and restore rehearsal, then read-only MCP smoke against the new image. Existing monitoring is inspected; do not stop production merely to test notification delivery. Retain snapshot/previous images until acceptance.

## 5. Recovery on failure

**Never start 18b7883 on a 0037/0038 database.** The old public projection can expose participant metadata. Follow DEPLOY.md's reviewed rollback script with the exact verified snapshot path: stop every writer, move all failed-upgrade data/config entries into secured recovery staging, archive/hash-verify that staging, restore the complete old data and configuration, verify schema 0036 with the old SQLite client, and start the pinned old image with no pull. Never overlay an old SQLite file onto newer WAL/SHM.

Preserve newer comments in failed-upgrade staging for recovery; after rollback they are absent from the active database. If recovery fails, leave writers stopped and retain both snapshots/staging. Confirm old digest, schema 0036, counts and privacy before reopening.

## Existing infrastructure and first-deploy reference

Production infrastructure, DNS and staff OAuth are configured. Verify existing project/cutover counts rather than repeating import. Run their dry runs and actual actions only when a verified prerequisite is missing; do not recreate the VM/data disk. Staff OAuth remains Internal with redirect `https://tracking.e3-services.com/oauth2/callback`; shared commenter auth uses its separate External client. Monitoring alerts use jan.pan@e3-services.com. Full setup details, first-deploy placeholder handling, costs and machine upgrade instructions are in DEPLOY.md.

## Completed collaboration upgrade: 0038 to 0040

T21..T24 are complete. The reviewed procedure below was executed successfully; production is now52f986a-dirty with exact final migration `0040_qa_reports.sql`. See COLLABORATION-RELEASE-2026-10-08.md for actual evidence.

Require separate review and API/browser QA, integrated full tests/build/lint, populated migration and immutable-report/typed-restore gates. Run each deployment script with --dry-run first. Fresh portable backups2026-10-08T16-39-17-553Z already uploaded and independently restored with zero warnings; repeat if necessary and always capture current counts at maintenance.

For this release, pre-pull the reviewed candidate and retained old digest, then run the unchanged reviewed0038 helper to take a NEW private complete data/config snapshot immediately before deployment. It pins the currently running0038 image. Leave app/backup/MCP stopped until snapshot acceptance; edge services stay up. Record the exact snapshot path and counts. Do not substitute a prior snapshot.

Deploy the reviewed tag, preserve every setting except IMAGE, and require exact0040 schema, integrity/FK checks, original record counts, positive project-unique finding/report numbers, next sequence allocation above existing maxima and public privacy. Report counts start at zero unless a real comparison runs; do not fabricate historical reports. Final off-site backup restore must retain snapshots/numbers/new comment anchors and suppress report capture during validation; MCP smoke is read-only.

Rollback across this migration uses the fresh0038 snapshot and the unchanged0038 helper, restoring complete data/config before starting the recorded old digest. Never downgrade only the image or overlay a database file.

The independently reviewed future helper [e3-maintenance-collaboration-schema0040.sh](ops/e3-maintenance-collaboration-schema0040.sh), SHA256 `4DF03A5EED6650FB18E0300F0BBEA39CF72D4D1ED95D3671C826018E37326695`, is for a later upgrade FROM0040 and snapshots with prefix `pre-collaboration-0040-*`. It is not the pre-upgrade helper for the pre-upgrade0038 baseline. Keep both versions and their recorded snapshot/image pins.
