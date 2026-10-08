# Live GCP upgrade runbook: e3-tracking

Production is already running at https://tracking.e3-services.com. The user authorized reviewed upgrades and task commits/integration (D-73). Local staging stays untouched. Current release baseline: image 18b7883, schema 0036; independently confirm both before an upgrade. The shared-portal release targets schema 0038. Credentials remain outside Git.

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
