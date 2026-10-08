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
