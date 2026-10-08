#!/usr/bin/env bash
# Usage: 03-deploy.sh <tag> [--dry-run] [--yes]. Copies compose + edge config + .env, pulls the tag, starts it.
# Files go to ~/e3-deploy on the VM (ssh user), then a sudo step installs them under /opt/e3-tracking.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
TAG="${ARGS[0]:-}"
[ -n "$TAG" ] || { echo "Usage: $0 <tag> [--dry-run] [--yes]" >&2; exit 2; }
plan_header "03 deploy $TAG"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
REMOTE=/opt/e3-tracking
UPLOAD=e3-deploy
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
DC="sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge"

# .env template: used only on the first deploy (the OAuth placeholders must then be filled in by the
# user on the VM); later deploys only change the IMAGE line.
if [ "$DRY_RUN" = 1 ]; then SECRET="<openssl-rand-base64-32>"; else SECRET="$(openssl rand -base64 32 | tr '+/' '-_')"; fi
cat > "$STAGE/env.template" <<ENVEOF
E3_AUTH_MODE=proxy
IMAGE=$IMAGE_BASE:$TAG
HOSTNAME=$HOSTNAME
WORKSPACE_DOMAIN=$WORKSPACE_DOMAIN
TRUSTED_PROXY_CIDR=${TRUSTED_PROXY_CIDR:-172.28.0.8/29,127.0.0.1/32}
OAUTH2_CLIENT_ID=REPLACE_ME
OAUTH2_CLIENT_SECRET=REPLACE_ME
OAUTH2_COOKIE_SECRET=$SECRET
BACKUP_BUCKET=$BUCKET
ENVEOF

if [ "$DRY_RUN" = 1 ]; then
  say "# .env template (used on the first deploy only):"
  while IFS= read -r l; do say "#   $l"; done < "$STAGE/env.template"
fi
confirm_once
say "Previous image on the VM (record with the pre-upgrade data/config snapshot):"
PREV_CMD="sudo grep '^IMAGE=' $REMOTE/.env 2>/dev/null || true"
show gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$PREV_CMD"
PREV=""
if [ "$DRY_RUN" != 1 ]; then
  PREV="$(gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$PREV_CMD" 2>/dev/null | tail -1 | sed 's/^IMAGE=//')"
fi

run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "mkdir -p ~/$UPLOAD/deploy"
# PuTTY pscp on Windows does not expand '~'; relative destinations start in the SSH user's home.
run gcloud compute scp "${IAP[@]}" "$REPO_ROOT/docker-compose.yml" "$GCP_DIR/docker-compose.gcp.yml" "$STAGE/env.template" "$VM_NAME:$UPLOAD/"
run gcloud compute scp --recurse "${IAP[@]}" "$REPO_ROOT/deploy/edge" "$VM_NAME:$UPLOAD/deploy/"

INSTALL_CMD="set -e; sudo install -d -m 755 $REMOTE/deploy && sudo cp ~/$UPLOAD/docker-compose.yml ~/$UPLOAD/docker-compose.gcp.yml $REMOTE/ && sudo cp -r ~/$UPLOAD/deploy/edge $REMOTE/deploy/ && cd $REMOTE && { sudo test -f .env || sudo install -m 600 ~/$UPLOAD/env.template .env; } && sudo sed -i 's#^IMAGE=.*#IMAGE=$IMAGE_BASE:$TAG#' .env && rm -f ~/$UPLOAD/env.template && if sudo grep -q REPLACE_ME .env; then echo 'FIRST DEPLOY: edit OAUTH2_CLIENT_ID and OAUTH2_CLIENT_SECRET in $REMOTE/.env (sudoedit), then rerun this script.'; exit 3; fi && sudo gcloud auth configure-docker $REGION-docker.pkg.dev --quiet && $DC pull app backup && $DC up -d"
set +e
run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$INSTALL_CMD"
rc=$?
set -e

if [ -n "$PREV" ]; then say "Recorded previous image: $PREV"; fi
say "Rollback across schema 0037/0038 requires stopping all writers, preserving failed-upgrade data, and restoring the verified pre-upgrade data AND config before starting the previous image. See docs/DEPLOY.md; do not run an old image on the migrated database."
if [ "$rc" = 3 ]; then
  say "Stopped before 'up -d': the OAuth client values are still placeholders. Edit the VM .env, then rerun: $0 $TAG"
  exit 1
fi
[ "$rc" = 0 ] || exit "$rc"

if [ "$DRY_RUN" = 1 ]; then
  show curl -fsS --retry 30 --retry-delay 5 --retry-all-errors "https://$HOSTNAME/api/health"
else
  if curl -fsS --retry 30 --retry-delay 5 --retry-all-errors "https://$HOSTNAME/api/health"; then
    echo
  else
    say "Health check failed (DNS not pointing at the IP yet, certificate pending, or the app is down). Check: docker compose logs on the VM. Deployment verification failed."
    exit 1
  fi
fi
