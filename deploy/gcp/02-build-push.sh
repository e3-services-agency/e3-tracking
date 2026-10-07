#!/usr/bin/env bash
# Builds the repo Dockerfile and pushes it to Artifact Registry. Flags: --dry-run, --yes.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "02 build and push"
if [ "$DRY_RUN" = 1 ]; then TAG="<git-describe>"; else TAG="$(git -C "$REPO_ROOT" describe --always --dirty)"; fi
run gcloud auth configure-docker "$REGISTRY" --quiet
ensure "Artifact Registry repo" "gcloud --project $PROJECT_ID artifacts repositories describe $REPO --location $REGION" -- \
  gcloud --project "$PROJECT_ID" artifacts repositories create "$REPO" --repository-format docker --location "$REGION"
run docker build -t "$IMAGE_BASE:$TAG" -t "$IMAGE_BASE:latest" "$REPO_ROOT"
run docker push "$IMAGE_BASE:$TAG"
run docker push "$IMAGE_BASE:latest"
say "Image tag: $TAG"
say "Next: deploy/gcp/03-deploy.sh $TAG"
