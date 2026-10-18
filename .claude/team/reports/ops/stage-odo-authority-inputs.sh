#!/usr/bin/env bash
# Only stages exact authorized private inputs outside public data; no application mutation.
set -euo pipefail
OP_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
source "$OP_ROOT/.claude/team/reports/ops/gcloud-wrapper.sh"
mode=${1:---dry-run}
[[ "$mode" = --dry-run || "$mode" = --yes ]]
inputs='C:/dev/ai-client-setup/data/pilots/odo/execution-plans/ODO-NATIVE-VALIDATION-01-r1'
history='C:/dev/ai-client-setup/data/pilots/odo/monday-briefing-2026-10-19/result-first-r2/history-files'
reviewed='C:/Users/Ján Pan/.codex/worktrees/codex-mcp-oauth/e3-tracking/data/odo-independent-qa/historical-manifest-reviewed-v1.private.json'
operator="$OP_ROOT/.claude/team/reports/ops/e3-odo-native-operator.cjs"
remote='e3-upgrade/odo-authority-20261018'
IAP=(--project e3-tracking --zone europe-west1-b --tunnel-through-iap)
if [[ "$mode" = --dry-run ]]; then
  echo 'Stage only approved source backup, two historical CSVs, exact reviewed manifest and closed API operator into private ~/e3-upgrade/odo-authority-20261018 (0700) on existing VM e3-tracking.'
  echo 'No upload to application, database mutation, approval, source activation or runtime QA.'
  exit
fi
for file in "$inputs/local-backup.json" "$history/events_1792067023.csv" "$history/purchase_items_1792067024.csv" "$reviewed" "$operator"; do test -f "$file"; done
gcloud compute ssh e3-tracking "${IAP[@]}" --command "install -d -m 700 ~/$remote" -- -T
gcloud compute scp "${IAP[@]}" "$inputs/local-backup.json" "$history/events_1792067023.csv" "$history/purchase_items_1792067024.csv" "$reviewed" "$operator" "e3-tracking:$remote/"
gcloud compute ssh e3-tracking "${IAP[@]}" --command "set -e; cd ~/$remote; chmod 600 local-backup.json events_1792067023.csv purchase_items_1792067024.csv historical-manifest-reviewed-v1.private.json e3-odo-native-operator.cjs; sha256sum local-backup.json events_1792067023.csv purchase_items_1792067024.csv historical-manifest-reviewed-v1.private.json e3-odo-native-operator.cjs" -- -T
