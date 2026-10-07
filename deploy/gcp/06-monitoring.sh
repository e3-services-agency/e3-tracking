#!/usr/bin/env bash
# Email notification channel + uptime check on /api/health + alert policy. Flags: --dry-run, --yes.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
: "${ALERT_EMAIL:?set ALERT_EMAIL in config.env}"
plan_header "06 monitoring"
G=(gcloud --project "$PROJECT_ID")
NAME="$VM_NAME-health"
CH_FILTER="type=email AND labels.email_address=$ALERT_EMAIL"
say "# notification channel (reused when one for $ALERT_EMAIL exists)"
if [ "$DRY_RUN" = 1 ]; then
  show "${G[@]}" beta monitoring channels list --filter "$CH_FILTER" --format 'value(name)'
  CH="<channel-id>"
  run "${G[@]}" beta monitoring channels create --display-name "$NAME email" --type email --channel-labels "email_address=$ALERT_EMAIL"
else
  CH="$(gcloud --project "$PROJECT_ID" beta monitoring channels list --filter "$CH_FILTER" --format 'value(name)' | head -1)"
  if [ -z "$CH" ]; then
    run "${G[@]}" beta monitoring channels create --display-name "$NAME email" --type email --channel-labels "email_address=$ALERT_EMAIL"
    CH="$(gcloud --project "$PROJECT_ID" beta monitoring channels list --filter "$CH_FILTER" --format 'value(name)' | head -1)"
  fi
fi
ensure "uptime check" "${G[*]} monitoring uptime list-configs --filter 'displayName=$NAME' --format 'value(name)' | grep -q ." -- \
  "${G[@]}" monitoring uptime create "$NAME" --resource-type uptime-url \
  --resource-labels "host=$HOSTNAME,project_id=$PROJECT_ID" --protocol https --path /api/health --port 443 \
  --period 5 --timeout 10 --validate-ssl true
POLICY="$GCP_DIR/alert-policy.json"
if [ "$DRY_RUN" != 1 ]; then
  CHECK_ID="$(gcloud --project "$PROJECT_ID" monitoring uptime list-configs --filter "displayName=$NAME" --format 'value(name)' | head -1)"
  CHECK_ID="${CHECK_ID##*/}"
  cat > "$POLICY" <<POLEOF
{"displayName":"$NAME failing","combiner":"OR","notificationChannels":["$CH"],
 "conditions":[{"displayName":"uptime check failing","conditionThreshold":{
  "filter":"metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"$CHECK_ID\" AND resource.type=\"uptime_url\"",
  "comparison":"COMPARISON_GT","thresholdValue":1,"duration":"300s",
  "aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_NEXT_OLDER","crossSeriesReducer":"REDUCE_COUNT_FALSE","groupByFields":["resource.label.*"]}]}}]}
POLEOF
fi
ensure "alert policy ($CH)" "${G[*]} alpha monitoring policies list --filter 'displayName=\"$NAME failing\"' --format 'value(name)' | grep -q ." -- \
  "${G[@]}" alpha monitoring policies create --policy-from-file "$POLICY"
