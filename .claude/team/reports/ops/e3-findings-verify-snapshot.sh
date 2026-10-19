#!/usr/bin/env bash
set -euo pipefail
SNAP=${1:?verified schema0050 snapshot path required}
[[ "$SNAP" =~ ^/var/backups/e3-tracking/post-portal-0050-[0-9TZ]+$ ]]
[ "$(sudo readlink -e "$SNAP")" = "$SNAP" ]
sudo install -d -m 700 "$SNAP/config-check"
sudo tar --numeric-owner --acls --xattrs -xzpf "$SNAP/config.tgz" -C "$SNAP/config-check"
sudo diff -qr --no-dereference /opt/e3-tracking "$SNAP/config-check"
sudo bash -c 'cd "$1" && sha256sum -c SHA256SUMS' verify "$SNAP"
printf 'Extracted configuration identical: %s\n' "$SNAP"
