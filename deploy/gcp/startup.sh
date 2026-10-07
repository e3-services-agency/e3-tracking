#!/usr/bin/env bash
# VM startup script (runs as root on every boot; idempotent). Installs Docker + compose plugin,
# formats/mounts the data disk at /data by label, creates /opt/e3-tracking.
set -euo pipefail
DEV=/dev/disk/by-id/google-e3-data
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $codename stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker
if [ -e "$DEV" ]; then
  if ! blkid -L e3data >/dev/null 2>&1; then
    mkfs.ext4 -m 0 -L e3data "$DEV"
  fi
  mkdir -p /data
  grep -q 'LABEL=e3data' /etc/fstab || echo 'LABEL=e3data /data ext4 discard,defaults,nofail 0 2' >> /etc/fstab
  mountpoint -q /data || mount /data
fi
chown 1000:1000 /data 2>/dev/null || true
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon --show=NAME | grep -q /swapfile || swapon /swapfile
grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
mkdir -p /opt/e3-tracking
chmod 755 /opt/e3-tracking
