# Deployment reconciliation (T-5-10)
Read-only checks on 2026-10-08:
- Local base: agent-setup 18b7883.
- Google Cloud SDK confirms e3-tracking VM RUNNING, europe-west1-b, e2-micro.
- HTTPS GET https://tracking.e3-services.com/api/health returns ok true, version 0.5.0, migration 0036_enum_examples_cleanup.sql, db_path_writable true.
- Health reports last_backup_at 2026-10-08T09:01:51.047Z and last_upload_ok true. This is service-reported backup health, not an independent bucket restore rehearsal.
- Existing deployment code diff preserved in DEPLOYMENT-BASELINE-2026-10-08.patch (5 files, 18 insertions/6 deletions). Machine-specific .mcp.json remains untouched and excluded from the patch.
- VM image tag, bucket object inventory/restore, monitoring delivery, MCP live smoke and cutover counts not yet independently verified. Historical deployment claims are not substituted for these checks.
- SDK SSH currently fails with non-ASCII bundled Python path in ProxyCommand. Recover Windows short-path/SDK Python invocation before deployment; do not change production to address a local tooling issue.
- Existing OAuth credentials remain outside Git. External personal-Gmail commenter credentials have not been established.
This reconciliation closes the stale "user executes" handover; remaining integration checks belong to T-5-16. Production is serving healthy requests. No production modifications performed.

## Additional independent read-only checks (auth-planner)
- VM IP34.53.243.2. App/backup image tag18b7883, digest sha256:481fb2ceff644b21cec7d4482e79379e410bcb6b6d28c51ecf2df83391d18656; app healthy, Caddy/oauth2-proxy running.
- Cloud Storage has Airshoppen and sandbox-acme-eu backup objects timestamp2026-10-08T09-01-51-047Z.
- HTTPS /api/health uptime check configured with validSSL true; enabled e3-tracking-health failing policy and email channel. Delivery not independently tested.
- SSH recovered locally: CLOUDSDK_PYTHON=C:/Users/JNPAN~1/AppData/Local/Programs/Python/PYTHON~1/python.exe, CLOUDSDK_SSH_PUTTY_FORCE_CONNECT=false, CLOUDSDK_CORE_DISABLE_PROMPTS=1. Invoke that interpreter with -S C:/Users/JNPAN~1/AppData/Local/Google/CLOUDS~1/GOOGLE~1/lib/gcloud.py. IAP compute ssh with -- -T works.
- Pending: restore rehearsal from current bucket backup, notification delivery, MCP live smoke, current cutover counts.

## Integration follow-up
Current Airshoppen backup object2026-10-08T09-01-51-047Z.json downloaded to OS temporary directory (1068545 bytes) for T16 final integrated restore rehearsal. Contents are outside Git and not printed. External public-auth client is established; current status is in GOOGLE-SHARED-AUTH-2026-10-08.md. Preserved deployment baseline accepted as2b03efd after independent review and QA, then merged into agent-setup. Machine .mcp.json remains local.

## MCP baseline check
Read-only MCP SDK smoke through SDK/IAP SSH succeeded: initialization,29 tools and list_projects2clientgroups/2projects. Connection closed, no write tools used. Known baseline18b7883; repeat against final deployed image. Notifications were not exercised.

## Concrete rollback prerequisite
Independent migrated fixture reproduces new identity-column exposure when18b7883 old SELECT* row mapping and old public projection run on a0037 database. Image-only rollback is unsafe. Before upgrade retain and verify a consistent secured snapshot of the complete data volume (SQLite/WAL/uploads) with all app/backup writers stopped. If reverting to18b, stop writers, preserve the failed-upgrade volume for recovery of newer comments, then restore the pre-migration data/config snapshot before starting the old image. Do not overlay an old SQLite file onto a newer WAL. A frontend-only rollback retaining participant-aware backend is another compatible option. Operational session credentials were not exposed in the reproduction.

## Final pre-upgrade evidence
Fresh pre-upgrade run-now uploaded both project backups with0 failures, timestamp2026-10-08T11-45-06-886Z. Airshoppen object independently described/downloaded and final restore rehearsal passes with0 warnings,23 events/194 properties/1 comment. Bundled sandbox restore also0 warnings,15 events/50 properties/4 comments. Old immutable Artifact Registry manifest is sha256:62bbaedfda4340c3f0070bd14935b517a3842c4c122fb2f333ead10ae9ec7bbc;481fb... is the Docker image ID. Live mount/data7.6MB, boot14GB free. Complete consistent snapshot still waits pre-pulled reviewed image and maintenance quiescence.
