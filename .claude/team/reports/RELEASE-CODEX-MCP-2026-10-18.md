# T-5-52 Codex MCP compatibility release

2026-10-18. Status: **complete, released and healthy; real Codex OAuth and authenticated MCP reads passed.**

## Delivered

Source commit30a9714c9345efc2a97e1c5be6d90d48cde68ae0, integrated into agent-setup by verified fast-forward fromf5de6ed. Six reviewed files: OAuth service/route, service and native route tests, Settings connection label and MCP instructions. Clean isolated worktree: C:/Users/Ján Pan/.codex/worktrees/codex-mcp-oauth/e3-tracking.

Strict native Codex loopback callbacks now work alongside the exact Claude callback. Raw callback validation rejects malformed or foreign redirects before SDK error redirects; registration/authorization/consent preserve the registered host/path with native port variation only. Code exchange remains bound to the actual authorized URI/port and client. PKCE S256, exact resource, staff identity/CSRF, explicit project/write/template selection, approved all-future-project opt-in, token rotation and revocation remain unchanged. Trusted labels and callback-specific CSP do not authenticate a public client's publisher. No schema, dependency, Google scope or infrastructure addition.

The main task/captured-evidence-import working tree and all uncommitted ODO work were preserved at their original baseline. Local3020/3021 and Cortex8766 were untouched; a future ODO image build needs deliberate integration of this accepted OAuth commit.

## Review and QA

Independent architecture/source/security and operator-script reviews PASS. All77OAuth checks plus an independent65-request HTTP probe PASS for Claude, native plain and callback-ID paths, malformed redirects without Location, deny/default read-only, exact exchange-port/client/resource/PKCE binding, replay/rotation/revocation and permission limits.

Aggregate regression coverage:255files/2521passing checks. The first full run was not clean: one fixed-subnet Docker collision and two shared-dependency junction collection failures. Exact isolated reruns passed using temporary environment-only network/config overrides; no source/dependency fixes were made for these failures. Independent production build, TypeScript, color lint and diffcheck PASS. Frozen six-file manifest SHA256:8C4D3BFAC9C0AAA2C25A1A23D842BE9CAFD6A9CC5867C375F3ED42EA643F2AD7. Detailed local QA evidence: C:/Users/JNPAN~1/AppData/Local/Temp/e3-codex-oauth-independent-qa/.

04-backup dry run and actual --run-now passed. All four GCS objects at2026-10-17T22-52-34-020Z.json were downloaded and restored into fresh in-memory schema0045 databases with zero warnings each: armedangels, sandbox-acme-eu, airshoppen, one-day-only-production. Backup payloads remain in ignored isolated data/T52-backups, outside Git/image context.

## Hosted deployment proof

02-build-push dry run and clean exact-source actual build/push PASS. Image tag30a9714; pushed and running digest both sha256:f267a8a7290956e83a310708615cec3bf512a148da25b9361e1a636861b2182e.

Verified full data/config snapshot: /var/backups/e3-tracking/post-portal-0045-20261017T230649Z. Its extracted database passes integrity/FKs at0045, with4clients/4projects/16comments/0share_members.03deploy dry run and actual PASS; no migration. Health is healthy, schema0045_share_audience.sql and last backup uploaded successfully. Every audited business-table count/hash, config excluding IMAGE, and Caddy/oauth2-proxy container ID exactly matches before/after. Integrity/FKs PASS.

HTTP checks: authorization/resource metadata200, unknown share summary/findings/card/history404, public portal deep path200, signed-out staff302, unauthenticated MCP POST401. Operator logs remain in the main checkout's .claude/team/reports/T-5-52-{build-push,snapshot,deploy}.log and pre/post-release-audit.txt; they are not a portable data backup.

## Final native authorization gate: PASS

The prior pending login expired while waiting for the user. On the user's retry request, a fresh normal interactive Codex login was started. The user approved the new grant in the browser and replied done. Codex CLI reported successful login, and native e3_tracking tools loaded directly into Codex without reading/extracting credential storage.

Authenticated read-only verification passed: list_projects returned all four hosted projects; scoped sandbox-acme-eu list_events returned 10 custom events; hosted one-day-only-production list_events and list_use_cases each returned 0. No mutation tool, comparison or observation submission was called.

The staff management page independently confirms the actual user-selected grant: All projects including future ones, projects:read and projects:write; global templates scope was not selected. Existing Claude grant remains present. Local screenshot evidence: main checkout .claude/team/reports/qa/T-5-52-codex-connected.png. No tokens, authorization codes or credentials are included in this report or Git. Task T-5-52 is DONE.

## Data authority and proposal boundary

Hosted One Day Only is an empty shell:0events/properties/definitions/catalogs/rules/usecases/observations/QA runs/reports/findings. HTTPS reads hosted GCP, not the local3021 ODO pilot. Choose an authoritative destination and a separately reviewed promotion/import before claiming native ODO validation.

PLAN-NATIVE-FILE-VALIDATION-2026-10-18.md proposes a native preview/apply adapter, immutable file-validation reports with exact source hashes/references and definition/rule/engine revision, scoped thin MCP wrappers and separate historical-file semantics. No CSV intake, fake timestamps or observations, certification changes, or parallel validation engine were implemented.

## Recovery

Previous code-only image:f5de6ed at the same0045schema. Redeploy that image for a code rollback, preserving valid current data. Only restore full data/config if damaged, using the exact verified snapshot and reviewed operational grant-revocation procedure; never overlay an old SQLite database with newer WAL files. Existing Google configuration is preserved.