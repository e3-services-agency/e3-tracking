# Current deployment handover — UI consistency

Current live release240efde-dirty/schema0038, manifestsha256:c13f97dee02182d0d23a2ed42dc18fdee0a9ba6ec70c660d93c1cc0f05cde39e. T18/T19/T20 complete; accepted counts/hierarchy/shared presentation,2115tests/215files and actual live desktop/390px checks PASS. Current verified data2clients/2projects/11comments; auth/settings and edge containers unchanged. Current private recovery snapshot `/var/backups/e3-tracking/pre-ui-0038-20261008T142650Z`; final off-site backups2026-10-08T14-36-58-362Z restore0warnings, MCP29tools PASS. See [complete current evidence](UI-CONSISTENCY-2026-10-08.md) and [current runbook](GO-LIVE-RUNBOOK.md). Historical records below remain recovery/history evidence, not current operational pointers.

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

## Verified upgrade checkpoint
Candidate `01b4230-dirty` built and pushed successfully; immutable registry manifest `sha256:174829aecdaa55876d29aa3fd98d1d45a471cc51de81f86f062f88a01ffb0128`. The dirty suffix comes only from the preserved machine `.mcp.json`, which is excluded from Docker's explicit COPY inputs. The candidate was pre-pulled to the VM and final `03-deploy` dry-run passed.

Reviewed maintenance script local/VM SHA256 matches `81b52faebb782dba1d4e51c84f5d747de00bed70f62435ba5565b3210745d694`. Complete root-private data/config snapshot verified at `/var/backups/e3-tracking/pre-0037-20261008T122119Z`: schema 0036, SQLite integrity/FK checks pass, clients 2, projects 2, comments 9. App/backup writers stopped; edge services retained. Public commenter configuration was then added without printing or replacing staff credentials. Deployment is underway; do not infer live acceptance from this checkpoint.

## Dependency audit follow-up
Production audit reports existing proxy-addr 2.0.7 (critical), MCP SDK 1.30.1 (high), and qs 6.14.2 (moderate), all also present at 18b7883. Independent reviewer finds no release blocker under the actual configuration: plain IPv4 trusted subnets and independent socket-peer authentication; stdio MCP server without SDK OAuth client; no runtime qs.stringify round-trip or comma parsing. Forged-peer and query probes passed. This is scoped exposure triage, not a clean dependency audit.

Follow up with reviewed lockfile updates to proxy-addr >=2.0.8, SDK >=1.31.0 and qs >=6.16.0, targeted proxy/shared-auth/query/MCP checks and another production audit. Primary advisories: [proxy-addr](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h), [qs stringify](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g), [qs comma parsing](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx). No secret rotation is indicated by these reviewed paths.

## Live release verification
Deployment completed successfully after correcting a stale temporary SDK wrapper to translate the local Git Bash `/tmp/.../env.template` path. The accepted documentation already handles existing absolute local paths; no application change was needed for this upload retry. Staff OAuth configuration was preserved. App and backup run `01b4230-dirty` with manifest `sha256:174829aecdaa55876d29aa3fd98d1d45a471cc51de81f86f062f88a01ffb0128`; Caddy/oauth2-proxy remained running on their existing images.

HTTPS health: schema `0038_comment_auth_sessions.sql`, writable data, backup/upload successful. Independent SQLite check: integrity `ok`, foreign-key errors0, clients2/projects2/comments9, matching snapshot counts. Snapshot directory permission700; both complete data/config archives600. Public auth client/origin and Workspace-session bridge configured and checked without exposing secrets.

Post-upgrade backup timestamp `2026-10-08T12-27-00-412Z`: uploaded2, failures0. Independently described and downloaded Cloud Storage objects: Airshoppen1068608 bytes (MD5 OjywkXNZkH8rs6ScncVoCw==), sandbox445484 bytes (MD5 eij91hxHcord4fYjhq2zWw==). Both actual off-site backups restore with0 warnings. Airshoppen23events/194properties/1comment; sandbox15events/50properties/8comments. Backups remain outside Git. Google required SDK reauthentication during the final download; user completed it, and both restore checks then passed.

Actual live browser: sixteen semantic tables, full long event name and descriptions, column headings/icons; existing first_name comment, comment/thread Markdown and link controls; `Markdown copied.` success status. Existing Workspace session resolves verified jan.pan; guest switch resolves stable Blue Owl, and entering Jan synchronizes root/reply name fields. No production test comments created. Explicit Google button is available; real Google Ján Pan/photo/root/reply flow passed in the final local build, while no consumer Gmail account was tested. Embedded-browser production Google popup completion was not observed, so it is not claimed as a live pass.

Full MCP SDK handshakes PASS through both app exec and the exact on-demand compose-run configuration:29tools,2clientgroups/2projects, no write tools called. Historical07 fixed20s stdin probe failed on slow IAP startup; response-driven correction56c47df accepted after independent24/24 checks and integrated as dbe81d0, with Windows troubleshooting docs b8d36a0. Final live07 dry-run and actual probe PASS29tools. This operator-only correction does not change the deployed application image. Existing monitoring uptime check: HTTPS `/api/health`, SSL validation enabled. Alert delivery was not deliberately triggered.

T16 is complete. Owned temporary QA servers30384/39424/46452 stopped and QA tabs closed; live preview retained. Staging container, main and machine.mcp remain untouched. Keep the verified recovery snapshot and old immutable image until the next reviewed retention decision. Concrete dependency update follow-up and account-specific Google test limits above remain visible; they are not claimed resolved by this feature release.
