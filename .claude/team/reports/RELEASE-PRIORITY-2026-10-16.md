# Release readiness: finding priority and tag-style selects (T-5-47..T-5-49)

Date: 2026-10-16. Status: **prepared, not run.** Needs the user's go-ahead for the build/push and for the release run.

## 1. What is released

| | |
|---|---|
| Live now | `tracking.e3-services.com`, image `15abadb` (digest `sha256:398cfbf8…cc66f`), schema `0045_share_audience.sql` (T-5-46, released 2026-10-15) |
| Release commit | `agent-setup` `f5de6ed` (`f5de6ed746594a56481e7f65663af0973cf72272`). Code is identical to `7bbf8df`; the last commit only touches `.claude/team/` |
| Contents | T-5-47 finding priority on the backend (D-89); T-5-48 priority in the UI (internal Findings, event card, portal QA, overview "Open P1", QA reports); T-5-49 enum selects wear their badge. Each has reviewer and QA PASS. Merged tree: build, lint, 254 files / 2,471 tests pass |
| Migrations | **none** (live and target are both 0045). Priority is derived at read time; QA report items gain additive JSON fields |
| Deploy/compose/Dockerfile/dependency changes since `15abadb` | none (`git diff 15abadb f5de6ed -- deploy docker-compose.yml Dockerfile package.json package-lock.json` is empty) |
| Not pushed | `origin/agent-setup` is at `04045f0`. The image builds from the local clean checkout, so pushing is separate and the user's call |

**Effect on clients after the upgrade:**
- The portal QA view and the event pages sort findings by priority, with P1–P4 badges, and the overview shows "Open P1".
- No change to access, sharing or data.
- Certification is unchanged.

## 2. Gates (same as T-5-46)

1. The user's explicit go-ahead for each remote step.
2. **A clean build source:** a fresh detached worktree at `f5de6ed`, with the local `deploy/gcp/config.env` copied in, so the tag has no `-dirty`.
3. **Dry runs first:** `02-build-push.sh --dry-run`, then `--yes`; the release script `--dry-run`, then the real run.
4. **Preflight, now enforced by the script:** the gcloud project is `e3-tracking`, live `/api/health` shows schema 0045 and `last_upload_ok: true`. The script stops otherwise.
5. **A verified snapshot of the 0045 state** with `~/e3-upgrade/e3-maintenance-portal-schema0045.sh snapshot`. It was uploaded to the VM in the T-5-46 release. The script continues only on the printed `Verified snapshot: /var/backups/e3-tracking/post-portal-0045-…` line. If the script is missing on the VM, no line is printed and the release stops before anything is stopped or deployed.
6. After the deploy, the script **compares** the running app digest with `EXPECTED_DIGEST`. Last time the digest was only printed.

## 3. Steps
1. **Clean checkout:** `git worktree add --detach ../e3-release-f5de6ed f5de6ed`, then copy `deploy/gcp/config.env` into it.
2. **Build:** in it, in Git Bash with the gcloud wrapper, run `bash deploy/gcp/02-build-push.sh --dry-run`, then `--yes`. Record the tag (`f5de6ed`) and the digest.
3. **Configure the script:** put `TAG` and `EXPECTED_DIGEST` into `.claude/team/reports/ops/release-T-5-49-priority.sh`.
4. **Dry run:** `bash .claude/team/reports/ops/release-T-5-49-priority.sh --dry-run`. Read the preflight and the 03-deploy plan.
5. **Real run:** `bash .claude/team/reports/ops/release-T-5-49-priority.sh`. It runs, in order:
   - the preflight
   - the snapshot (brief downtime; record the path)
   - `03-deploy.sh f5de6ed --yes`
   - the digest comparison
   - the smoke checks: health 0045, unknown token 404 on the summary, findings, card and history routes, portal deep path 200, staff app signed out 302, MCP 401
6. **Remove the clean checkout:** `git worktree remove --force ../e3-release-f5de6ed`.

## 4. Checks after the deploy

**By the agent, read-only:**
- the smoke checks above

**By the user in a browser** (the agent's on-VM DB check was blocked last time):
- **Internal Findings page on ARMEDANGELS:**
  - Priority column, P1 first, reasons on hover
  - the P1 filter
  - Resolve still works on a test finding (reopen it afterwards)
- **Event editor (e.g. `purchase`):** Class, Implementation method, Priority and Status show as one tag-style select each, with no duplicate badge.
- **ARMEDANGELS portal link:**
  - the overview "Open P1" count
  - the QA view: priority order, the P1 filter, "Show 100 more"
  - an event page with priority badges
- **QA reports:** an older report still opens, without badges.

## 5. Rollback

This is a code-only release with the same schema, so **rollback is redeploying the previous image** and needs no data restore: `bash deploy/gcp/03-deploy.sh 15abadb --yes`. Data written in between stays valid, because report items with extra priority fields are ignored by the older code.

Only if data were damaged: `sudo bash ~/e3-upgrade/e3-maintenance-portal-schema0045.sh rollback <snapshot path from step 5>`, run on the VM through the gcloud wrapper.
