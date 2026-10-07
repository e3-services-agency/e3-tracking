#!/usr/bin/env bash
# Shared helpers for deploy/gcp scripts (D-72, T-5-07). Sourced, not executed.
# shellcheck disable=SC2034
GCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$GCP_DIR/../.." && pwd)"
DRY_RUN=0
ASSUME_YES=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) ARGS+=("$a") ;;
  esac
done

CONFIG_FILE="${CONFIG:-$GCP_DIR/config.env}"
if [ ! -f "$CONFIG_FILE" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "# config.env not found, using config.env.example for the dry run" >&2
    CONFIG_FILE="$GCP_DIR/config.env.example"
  else
    echo "Missing $CONFIG_FILE. Copy config.env.example to config.env and edit it." >&2
    exit 1
  fi
fi
# shellcheck disable=SC1090
. "$CONFIG_FILE"
: "${PROJECT_ID:?}" "${REGION:?}" "${ZONE:?}" "${HOSTNAME:?}" "${VM_NAME:?}" "${REPO:?}" "${BUCKET:?}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-micro}"
DATA_DISK_GB="${DATA_DISK_GB:-20}"
SA_NAME="e3-tracking-vm"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REGISTRY="${REGION}-docker.pkg.dev"
IMAGE_BASE="${REGISTRY}/${PROJECT_ID}/${REPO}/e3-tracking"
DISK_NAME="${VM_NAME}-data"
IAP_RANGE="35.235.240.0/20"

CONFIRMED=0
say() { printf '%s\n' "$*"; }

# Print a command in copy-pasteable form.
show() {
  local a q="'" out="+"
  for a in "$@"; do
    if [[ "$a" =~ ^[A-Za-z0-9_@%+=:,./~#-]+$ ]]; then
      out="$out $a"
    else
      out="$out $q${a//$q/$q\\$q$q}$q"
    fi
  done
  printf '%s\n' "$out"
}

# Ask y/N once before the first mutating command (skipped in dry run or with --yes).
confirm_once() {
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$CONFIRMED" = 1 ] && return 0
  if [ "$ASSUME_YES" != 1 ]; then
    printf 'Proceed with the mutating commands? [y/N] '
    read -r ans
    case "$ans" in y|Y|yes) ;; *) say "Aborted."; exit 1 ;; esac
  fi
  CONFIRMED=1
}

# run <cmd...>: mutating command. Printed always, executed unless --dry-run.
run() {
  show "$@"
  [ "$DRY_RUN" = 1 ] && return 0
  confirm_once
  "$@"
}

# ensure <description> <probe cmd string> -- <create cmd...>
# Runs the create command only when the probe fails (idempotent). Dry run prints both.
ensure() {
  local desc="$1" probecmd="$2"
  shift 3
  say "# $desc"
  if [ "$DRY_RUN" = 1 ]; then
    say "# (skipped when it exists) probe: $probecmd"
    run "$@"
    return 0
  fi
  if eval "$probecmd" >/dev/null 2>&1; then
    say "# exists, skipping"
  else
    run "$@"
  fi
}

plan_header() {
  say "== $1 =="
  say "project=$PROJECT_ID region=$REGION zone=$ZONE vm=$VM_NAME host=$HOSTNAME"
  if [ "$DRY_RUN" = 1 ]; then say "(dry run: nothing is executed)"; fi
  return 0
}
