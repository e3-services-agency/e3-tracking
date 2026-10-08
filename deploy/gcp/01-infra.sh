#!/usr/bin/env bash
# Static IP, firewall, service account, bucket, data disk, VM. Idempotent. Flags: --dry-run, --yes.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
plan_header "01 infrastructure"
G=(gcloud --project "$PROJECT_ID")

ensure "static external IP" "${G[*]} compute addresses describe $VM_NAME-ip --region $REGION" -- \
  "${G[@]}" compute addresses create "$VM_NAME-ip" --region "$REGION"

ensure "firewall: 80/443 from anywhere" "${G[*]} compute firewall-rules describe $VM_NAME-web" -- \
  "${G[@]}" compute firewall-rules create "$VM_NAME-web" --network default --direction INGRESS \
  --allow tcp:80,tcp:443 --source-ranges 0.0.0.0/0 --target-tags "$VM_NAME"
ensure "firewall: SSH from the IAP range only" "${G[*]} compute firewall-rules describe $VM_NAME-iap-ssh" -- \
  "${G[@]}" compute firewall-rules create "$VM_NAME-iap-ssh" --network default --direction INGRESS \
  --allow tcp:22 --source-ranges "$IAP_RANGE" --target-tags "$VM_NAME"

# Override default-allow-ssh (priority 65534) without changing firewall rules for other VMs.
# The IAP allow rule has priority 1000 and wins over this scoped deny.
ensure "firewall: block direct SSH" "${G[*]} compute firewall-rules describe $VM_NAME-deny-direct-ssh" -- \
  "${G[@]}" compute firewall-rules create "$VM_NAME-deny-direct-ssh" --network default --direction INGRESS \
  --action DENY --rules tcp:22 --priority 1001 --source-ranges 0.0.0.0/0 --target-tags "$VM_NAME"

ensure "service account" "${G[*]} iam service-accounts describe $SA_EMAIL" -- \
  "${G[@]}" iam service-accounts create "$SA_NAME" --display-name "e3-tracking VM"

ensure "backup bucket (uniform access)" "${G[*]} storage buckets describe gs://$BUCKET" -- \
  "${G[@]}" storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access
run "${G[@]}" storage buckets update "gs://$BUCKET" --versioning --lifecycle-file "$GCP_DIR/bucket-lifecycle.json"
run "${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member "serviceAccount:$SA_EMAIL" --role roles/storage.objectCreator
run "${G[@]}" projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$SA_EMAIL" --role roles/artifactregistry.reader --condition=None

ensure "data disk ${DATA_DISK_GB} GB pd-balanced" "${G[*]} compute disks describe $DISK_NAME --zone $ZONE" -- \
  "${G[@]}" compute disks create "$DISK_NAME" --zone "$ZONE" --size "${DATA_DISK_GB}GB" --type pd-balanced

ensure "VM $MACHINE_TYPE Debian 12" "${G[*]} compute instances describe $VM_NAME --zone $ZONE" -- \
  "${G[@]}" compute instances create "$VM_NAME" --zone "$ZONE" --machine-type "$MACHINE_TYPE" \
  --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB --boot-disk-type pd-balanced \
  --address "$VM_NAME-ip" --tags "$VM_NAME" \
  --service-account "$SA_EMAIL" --scopes cloud-platform \
  --disk "name=$DISK_NAME,device-name=e3-data,mode=rw,boot=no,auto-delete=no" \
  --metadata-from-file "startup-script=$GCP_DIR/startup.sh"

if [ "$DRY_RUN" = 1 ]; then
  ip="<static-ip>"
  show "${G[@]}" compute addresses describe "$VM_NAME-ip" --region "$REGION" --format 'value(address)'
else
  ip="$(gcloud --project "$PROJECT_ID" compute addresses describe "$VM_NAME-ip" --region "$REGION" --format 'value(address)')"
fi
say
say "Static IP: $ip"
say "Create this DNS record at your DNS provider:  $HOSTNAME.  A  $ip"
