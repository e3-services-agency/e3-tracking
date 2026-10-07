#!/usr/bin/env bash
# Usage: 03-deploy.sh <tag> [--dry-run] [--yes]. Copies compose + edge config + .env, pulls the tag, starts it.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
TAG="${ARGS[0]:-}"
[ -n "$TAG" ] || { echo "Usage: $0 <tag> [--dry-run] [--yes]" >&2; exit 2; }
plan_header "03 deploy $TAG"
IAP=(--tunnel-through-iap --zone "$ZONE" --project "$PROJECT_ID")
REMOTE=/opt/e3-tracking
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# .env template: used only on the first deploy (the OAuth placeholders must then be filled in by the
# user on the VM); later deploys only change the IMAGE line.
if [ "$DRY_RUN" = 1 ]; then SECRET="<openssl-rand-base64-32>"; else SECRET="$(openssl rand -base64 32 | tr '+/' '-_')"; fi
cat > "$STAGE/env.template" <<ENVEOF
IMAGE=$IMAGE_BASE:$TAG
HOSTNAME=$HOSTNAME
WORKSPACE_DOMAIN=$WORKSPACE_DOMAIN
TRUSTED_PROXY_CIDR=${TRUSTED_PROXY_CIDR:-172.16.0.0/12}
OAUTH_CLIENT_ID=REPLACE_ME
OAUTH_CLIENT_SECRET=REPLACE_ME
COOKIE_SECRET=$SECRET
BACKUP_BUCKET=$BUCKET
ENVEOF

say "Previous image on the VM (rollback target):"
PREV_CMD="grep '^IMAGE=' $REMOTE/.env 2>/dev/null || true"
show gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$PREV_CMD"
PREV=""
if [ "$DRY_RUN" != 1 ]; then
  PREV="$(gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$PREV_CMD" 2>/dev/null | tail -1 | sed 's/^IMAGE=//')"
fi

run gcloud compute scp --recurse "${IAP[@]}" "$REPO_ROOT/docker-compose.yml" "$REPO_ROOT/deploy/edge" "$STAGE/env.template" "$VM_NAME:$REMOTE/"
REMOTE_CMD="cd $REMOTE && { [ -f .env ] || cp env.template .env; } && sed -i 's#^IMAGE=.*#IMAGE=$IMAGE_BASE:$TAG#' .env && rm -f env.template && { ! grep -q REPLACE_ME .env || echo 'WARNING: fill OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in $REMOTE/.env, then rerun'; } && sudo docker compose --profile edge pull && sudo docker compose --profile edge up -d"
run gcloud compute ssh "$VM_NAME" "${IAP[@]}" --command "$REMOTE_CMD"

if [ "$DRY_RUN" = 1 ]; then
  show curl -fsS --retry 30 --retry-delay 5 --retry-all-errors "https://$HOSTNAME/api/health"
else
  curl -fsS --retry 30 --retry-delay 5 --retry-all-errors "https://$HOSTNAME/api/health" && echo
fi
if [ -n "$PREV" ]; then say "Rollback: $0 ${PREV##*:}"; else say "Rollback: $0 <previous tag>"; fi
