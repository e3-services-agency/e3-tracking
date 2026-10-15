# Release readiness: client portal v2 (D-88, T-5-40..T-5-46)

Date: 2026-10-15. Author: implementer (T-5-46). Status: **ready for the user's decision. Nothing
has been deployed, pushed or run against GCP.**

## 1. What is released, and from which commit

| | |
| --- | --- |
| Live now | `tracking.e3-services.com`, image c5864b1 (digest `sha256:597bc0f2…200c4`), schema `0044_mcp_grant_all_projects.sql` (T-5-38, 2026-10-14) |
| Merged candidate | `agent-setup` 0599495 (`05994959342002b901af80b7822f8895d0dc311f`, 2026-10-15 17:34): T-5-40..T-5-45, each with reviewer and QA PASS, plus the whole-portal QA PASS |
| Recommended candidate | `agent-setup` 15abadb (`15abadb53f8fd5a8ce1688c8c21d77ab5bb637b0`, 2026-10-15 17:58): T-5-46 merged on top of 0599495 (docs, the sign-in wording fix, the summary expiration); reviewer PASS on `git diff 0599495 15abadb`. Later commits on `agent-setup` that only touch `.claude/team/` records change no shipped code |
| Migrations since live 0044 | exactly one: `0045_share_audience.sql` (additive: `projects.share_audience` with default `anyone_with_link`, new table `share_members`, nullable `comment_auth_sessions.email`). No table rebuild, no data rewrite |
| Deploy/edge config changes since c5864b1 | none (`git diff c5864b1 0599495 -- deploy/ docker-compose.yml Dockerfile` touches nothing; the Caddyfile's public matcher `/tracking-plan/shared/*` already covers the new deep paths). No new environment variable: listed mode uses the existing `GOOGLE_COMMENT_CLIENT_ID`, `E3_PUBLIC_ORIGIN`, `COMMENT_STAFF_SESSION=1`, `WORKSPACE_DOMAIN` |
| Also included | two UI commits on `agent-setup` before D-88 with no board record: 7a5ee74 "lighter client portal tables" and 8817e0d "show description and business name in the Events table" (both are in the tree the whole-portal QA tested) |
| Not pushed | `origin/agent-setup` is at f4fb146; everything from 8817e0d on is local. `02-build-push.sh` builds from the local checkout, so the image does not need a push, but pushing `agent-setup` afterwards keeps the record. Pushing is the user's call |

Behaviour for existing shares after the upgrade: every project gets `share_audience =
anyone_with_link`, so every existing link keeps working exactly as before, now through the portal
v2 views. Old single-page links (`#event-…`, `#property-…`, `#findings…`, comment links) redirect.

## 2. Local evidence (this task)

- `npx tsc --noEmit`: 0 errors. `npm run lint`: pass. `npm run build`: pass.
- `npx vitest run --pool=forks --poolOptions.forks.maxForks=2`: Test Files 2 failed | 249 passed
  (251); Tests 2403 passed (2403); 1 unhandled "Timeout calling onTaskUpdate". The two files are the
  known worktree load errors (CommentBody.test.tsx, CommentIdentity.test.tsx: react-syntax-highlighter
  resolves to the main checkout's node_modules); the timeout is the known intermittent vitest one.
- Help page (production build served by the worktree API on 127.0.0.1:3546, in-memory DB): the
  Sharing reference, the "Sharing and access" guide and the Tracking document reference render
  (headings, the views table, no raw Markdown), no console errors.
- Portal on the same server: Events list shows Expiration ("6 months", "project default") from the
  summary, with no `card.json` request; listed-people mode shows only "Sign in to open this link"
  with no project or client name. Server stopped afterwards.
- Earlier (board): whole-portal QA PASS on 4518a6d (about 490 public requests with planted secrets,
  zero leaks; listed mode returns the identical 404 on every data route; at most 4,183 DOM elements
  per view; 375 px without horizontal scroll).

## 3. Gates before the upgrade (from T-5-36 / T-5-38)

1. **The user's explicit go-ahead** for this release, and for each remote step below.
2. **Clean build source.** Build from a clean checkout of the release commit (a separate worktree),
   because `02-build-push.sh` tags with `git describe --always --dirty` and the main checkout has
   local changes (`.claude/launch.json`, `scripts/profiles/armedangels.json`). Record the full
   commit id, the tag and the registry digest.
3. **Dry runs first.** `bash deploy/gcp/02-build-push.sh --dry-run`, then `--yes`;
   `bash deploy/gcp/03-deploy.sh <tag> --dry-run` before the real run (both scripts support
   `--dry-run`; the release script below has `--dry-run` too).
4. **Read-only preflight.** `gcloud config get-value project` is `e3-tracking`; `/api/health` shows
   `0044_mcp_grant_all_projects.sql`; the last nightly backup uploaded (the T-5-38 record shows
   "backup+upload ok").
5. **Verified, quiesced pre-upgrade snapshot** of the 0044 state with
   `~/e3-upgrade/e3-maintenance-mcp-schema0044.sh snapshot` (already on the VM since T-5-38). It
   stops app, backup and MCP, packs `/data` and `/opt/e3-tracking`, checks the archives, and verifies
   integrity, foreign keys, schema 0044 and row counts from the extracted copy. Proceed only on the
   printed `Verified snapshot: /var/backups/e3-tracking/post-mcp-0044-<timestamp>` line. Known issue
   (T-5-38): the SSH call can exit non-zero after a good snapshot; the release script below decides
   on the printed line, not on the exit code.
6. Keep the snapshot and the prior image (c5864b1, digest above) until every post-deploy and host
   check in sections 4 and 5 passes.

## 4. Release plan (step by step)

Prepared files (on this branch, not run):

- `.claude/team/reports/ops/release-T-5-46-portal-0045.sh`: preflight, snapshot (exit-code-safe),
  upload of the 0045 maintenance script, `03-deploy.sh <tag> --yes`, smoke. `--dry-run` changes nothing
  but is not offline: its preflight reads `gcloud config get-value project` and the live
  `/api/health` (read-only), then it prints the plan and runs `03-deploy.sh --dry-run`.
  `EXPECTED_DIGEST` is only printed, not compared (deploy is by tag), and the 0044 schema and the
  backup freshness are read off the preflight output by the operator, not enforced (review LOW). Refuses to run for real until `TAG` and
  `EXPECTED_DIGEST` are filled in.
- `.claude/team/reports/ops/e3-maintenance-portal-schema0045.sh`: the 0044 maintenance script
  for the 0045 state (expects `0045_share_audience.sql`, counts `share_members` too, and on a restore
  also ends every shared Google session so a signed-out session or a removed member's session
  cannot come back). For later releases and post-release recovery; not needed to roll this release
  back.

Steps (Git Bash with `. .claude/team/reports/ops/gcloud-wrapper.sh`, see docs/DEPLOY.md "Windows SDK
and maintenance invocation"):

1. Commit and merge T-5-46 into `agent-setup` (user asks), rerun build/tsc/lint/tests on the merged
   tree, note the full commit id.
2. Create a clean worktree at that commit; `bash deploy/gcp/02-build-push.sh --dry-run`, then
   `--yes`. Note the tag and read the digest from Artifact Registry.
3. Put the tag and digest into the release script; run it with `--dry-run` and read the 03-deploy
   plan.
4. Run the release script for real. It: (0) prints the project and live health; (1) takes the
   verified 0044 snapshot and prints its path (record it); (2) uploads the 0045 maintenance script;
   (3) deploys the tag (migration 0045 runs on start; 03-deploy waits for health); (4) smoke.
5. Post-deploy checks (script output plus by hand):
   - app digest equals the pushed digest; `/api/health` shows `0045_share_audience.sql`, `ok: true`,
     `db_path_writable: true`;
   - on the VM, read-only: `PRAGMA integrity_check` ok, `foreign_key_check` clean, project and event
     counts unchanged (2 projects, 39 events at the T-5-38 release; compare to the snapshot's
     counts), every project `share_audience = 'anyone_with_link'`, `share_members` empty;
   - unknown token: `document-summary.json`, `findings.json`, `events/x/card.json`, `history` all
     404 `SHARE_NOT_FOUND`; `/tracking-plan/shared/<anything>/events/<name>` returns `index.html`;
   - staff pages still redirect to the Workspace sign-in when signed out; `POST /mcp` still 401;
   - `bash deploy/gcp/04-backup.sh --run-now --dry-run`, then for real, and confirm the upload.
6. Host-only checks (section 5). Close T-5-46 on the board only when they pass.

## 5. Host-only checks still owed

These cannot run on localhost (no External OAuth client, no Workspace proxy, no live data).

1. **Real Google sign-in in listed mode (External OAuth client).** On a test project (the sandbox
   project, not a client's), set **Only listed people** and list one Google account as commenter
   with a `comment` link.
   - a listed, verified email: signs in, the portal opens, comments can be posted; "Commenting as"
     shows its name;
   - an unlisted Google account: "Sign in to open this link" plus the no-access notice, **Signed in
     as** and **Sign out**; every data route 404 (network panel); no project or client name anywhere;
   - signed out: only the neutral screen and the Google button;
   - an unverified Google email (if one is available, for example a Google account on a non-Gmail
     address that was never verified): the neutral screen, as unlisted. If no such account exists,
     record that it is covered by `shareAudience.route.test.ts` only;
   - remove the listed email: the next page load shows the neutral screen;
   - at 375 px: the Google button and sign-out on the sign-in screen are usable; inside the portal
     the identity and downloads are in the drawer (T-5-42 LOW, kept as is; see the board entry).
2. **Staff via the Workspace proxy.** Signed in to `tracking.e3-services.com` as E3 staff, open the
   listed-people link: the portal opens without being listed, with the link's access.
3. **An existing `anyone_with_link` share keeps working.** Open each live client's existing link
   (ARMEDANGELS and the second project): overview, Events, an event page (card loads), Properties,
   QA; comments visible as before; the comment composer appears only on comment links.
4. **Old client links redirect on the live host.** On an existing link open `#event-<a real event>`,
   `#property-<a real property>`, `#findings` and one copied comment link from before the release:
   each lands on its page with the hash handled and the comment focused.
5. Afterwards set the test project back to **Anyone with the link** (or revoke the test link) and
   remove the test member.

## 6. Rollback

Only for a failed release (failed health, failed checks in section 4, or a blocking host check):

```
sudo bash ~/e3-upgrade/e3-maintenance-mcp-schema0044.sh rollback /var/backups/e3-tracking/post-mcp-0044-<timestamp from step 4>
```

Run through the SDK wrapper (`gcloud compute ssh e3-tracking --tunnel-through-iap … --command=… -- -T`).
It stops the writers, moves the failed live data and config aside to
`/var/backups/e3-tracking/failed-upgrade-<timestamp>`, restores the verified 0044 data and config,
re-verifies them, revokes HTTPS MCP grants restored from the snapshot (fresh Claude connector
consent is then needed), and starts the recorded previous image digest. Never start c5864b1 on the
migrated 0045 database without the restore. Data written between the snapshot and the rollback
(comments, listed people) stays only in the failed-upgrade folder.

Not a rollback, but a quick containment if only listed mode misbehaves: switch the affected project
back to **Anyone with the link** in Settings (or revoke its link).

## 7. Open items and decisions for the user

- Go-ahead for: commit and merge T-5-46; build and push the image; the release run; pushing
  `agent-setup` to origin.
- Release commit: the T-5-46 merge (recommended) or 0599495 without the T-5-46 code changes.
- T-5-42 LOW (sign-in and downloads only in the drawer below 1024 px): kept as is. Listed-mode
  sign-in has its own full screen at every width; inside the portal the identity control stays
  mounted (One Tap still prompts) and the drawer is one tap away. Revisit only if clients ask.
- Carried LOWs, not blockers: `GET /api/mcp/connections` returns `projects: "all"` as a string for
  all-project grants (T-5-38); a catalog field change in Recent changes links to the Catalogs list,
  not its catalog (T-5-43); a `card.json` 404 shows "Try again" instead of a distinct not-found
  state (T-5-44); no test for an expired session or a member of another project only (T-5-45).
