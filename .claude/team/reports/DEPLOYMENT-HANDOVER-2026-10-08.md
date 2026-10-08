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
