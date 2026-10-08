# Go-live runbook: e3-tracking on GCP (D-72)

Branch `agent-setup` a7ed51d. You run every step from Git Bash in the repo root. Every script accepts `--dry-run` (prints the exact gcloud commands, executes nothing) and asks y/N once before its first change. Run each step with `--dry-run` first. Full reference: `docs/DEPLOY.md`, chapter "GCP deployment".

## 0. One-time preparation (you, about 10 minutes)
1. `gcloud auth login` is done; confirm with `gcloud config get-value project` → `e3-tracking`.
2. Config file: `cp deploy/gcp/config.env.example deploy/gcp/config.env`, then set `ALERT_EMAIL`. Defaults already hold project `e3-tracking`, region `europe-west1`, zone `europe-west1-b`, hostname `tracking.e3-services.com`, Workspace domain `e3-services.com`, machine `e2-micro`.
3. OAuth client (console, done): keep the downloaded JSON outside the repo. Verify: consent screen "Internal"; authorized redirect URI exactly `https://tracking.e3-services.com/oauth2/callback`.
4. Your account needs Owner on the project (it has: you created it). The scripts grant nothing to you.

## 1. Preflight
```bash
bash deploy/gcp/00-preflight.sh --dry-run
bash deploy/gcp/00-preflight.sh
```
Enables Compute Engine, Artifact Registry, Cloud Storage, IAP and Monitoring APIs. Takes a few minutes.

## 2. Infrastructure
```bash
bash deploy/gcp/01-infra.sh --dry-run
bash deploy/gcp/01-infra.sh
```
Creates: static IP, firewall (80/443 from anywhere, 22 only from the IAP range), service account with write-only access to the backup bucket, versioned bucket with a 90-day lifecycle, 20 GB data disk, e2-micro Debian 12 VM whose startup script installs Docker, mounts the disk at /data and adds a 2 GB swap file. It prints the static IP at the end.

**DNS (you):** create an A record `tracking.e3-services.com` → the printed IP. Caddy needs it resolvable before step 4 to obtain the certificate.

## 3. Build and push the image
```bash
bash deploy/gcp/02-build-push.sh --dry-run
bash deploy/gcp/02-build-push.sh
```
Builds the Dockerfile locally and pushes it to Artifact Registry tagged with the git describe value and `latest`. Note the printed tag.

## 4. Deploy (two passes on the first run)
```bash
bash deploy/gcp/03-deploy.sh <tag> --dry-run
bash deploy/gcp/03-deploy.sh <tag>
```
First pass: copies the compose files and the edge config, writes `/opt/e3-tracking/.env` with placeholders, and stops with exit 3 saying the OAuth values are missing. Then:
```bash
gcloud compute ssh e3-tracking --tunnel-through-iap --zone europe-west1-b --project e3-tracking -- -t "sudo nano /opt/e3-tracking/.env"
```
Replace `OAUTH2_CLIENT_ID=REPLACE_ME` and `OAUTH2_CLIENT_SECRET=REPLACE_ME` with the `client_id` and `client_secret` from the JSON. Save. The first `gcloud compute ssh` generates an SSH key; accept the prompts.
```bash
bash deploy/gcp/03-deploy.sh <tag>
```
Second pass: pulls the image and starts app, Caddy and the OAuth proxy, then waits for `https://tracking.e3-services.com/api/health`. Open the URL in a browser: Google sign-in with your Workspace account, then the app. A share link (`/tracking-plan/shared/<token>`) must open without sign-in.

Rollback at any time: `bash deploy/gcp/03-deploy.sh <previous tag>` (the script prints the previous tag before each deploy).

## 5. Backups
```bash
bash deploy/gcp/04-backup.sh
bash deploy/gcp/04-backup.sh --run-now
gcloud storage ls gs://e3-tracking-backups-e3-tracking/ --recursive
```
Nightly backup.json per project stays on the VM and is uploaded to the bucket. `/api/health` shows `last_backup_at` and `last_upload_ok`.

## 6. Cut-over of the local data
```bash
bash deploy/gcp/05-cutover.sh airshoppen sandbox-acme-eu
```
Downloads each project's backup.json from your local container (3020 must be running) and prints the steps: in the deployed app create the client, open Clients → Restore backup, pick the file, confirm the preview. Repeat per project. (`--via-tunnel` automates it; use the browser path the first time.) Afterwards run a comparison in the deployed project and compare counts with the local one.

Restore rehearsal (do once now, then quarterly), locally:
```bash
npm run restore:rehearsal -- <downloaded backup.json>
```

## 7. Monitoring
```bash
bash deploy/gcp/06-monitoring.sh
```
Uptime check on the health endpoint with an email alert to `ALERT_EMAIL`. Check the alert policy once in Cloud Monitoring (the script notes it).

## 8. MCP for Claude Code
```bash
bash deploy/gcp/07-mcp.sh
```
Prints the `.mcp.json` block for your machine (gcloud ssh over IAP into the mcp container) and runs a smoke test listing 29 tools. Paste the block into your Claude Code MCP config. Requires `roles/iap.tunnelResourceAccessor` and `roles/compute.osAdminLogin` (Owner has both).

## 9. After go-live
- The local container stays your staging. Rebuild it when `agent-setup` changes; deploy to the VM with steps 3 and 4.
- Costs: about 6 to 7 EUR per month for the VM, about 2 EUR for the disk, plus the static IP and a few cents of storage. Upgrade to e2-small by changing `MACHINE_TYPE` and recreating the instance (the data disk is kept).
- Deferred: digest email for client comments (needs a mail provider), HTTP transport for MCP.
