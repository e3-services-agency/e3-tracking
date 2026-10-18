#!/usr/bin/env bash
# Execute only on the existing e3-tracking VM over authorized IAP.
set -euo pipefail
mode=${1:?prepare or on or off}
[[ "$mode" = prepare || "$mode" = on || "$mode" = off ]]
cd /opt/e3-tracking
before=$(sudo grep -vE '^(DECISION_INBOX_ENABLED|PROJECT_PROMOTION_ENABLED)=' .env | sha256sum | cut -d' ' -f1)
sudo python3 - "$mode" <<'PY'
from pathlib import Path
import sys, os, tempfile, hashlib
p=Path('/opt/e3-tracking/.env')
assert p.is_file() and not p.is_symlink()
raw=p.read_bytes()
assert raw.endswith(b'\n'), 'Refuse to alter a nonflag line terminator'
keys=(b'DECISION_INBOX_ENABLED=',b'PROJECT_PROMOTION_ENABLED=')
def stable(value): return b''.join(line for line in value.splitlines(keepends=True) if not line.startswith(keys))
retained=stable(raw)
candidate=retained+b'DECISION_INBOX_ENABLED=true\nPROJECT_PROMOTION_ENABLED='+(b'true' if sys.argv[1]=='on' else b'false')+b'\n'
assert hashlib.sha256(stable(candidate)).digest()==hashlib.sha256(retained).digest()
stat=p.stat()
fd, tmp=tempfile.mkstemp(prefix='.env.odo-flags-',dir=p.parent)
try:
    with os.fdopen(fd,'wb') as f:
        os.fchmod(f.fileno(),0o600)
        os.fchown(f.fileno(),stat.st_uid,stat.st_gid)
        f.write(candidate)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp,p)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
assert stable(p.read_bytes())==retained
PY
after=$(sudo grep -vE '^(DECISION_INBOX_ENABLED|PROJECT_PROMOTION_ENABLED)=' .env | sha256sum | cut -d' ' -f1)
[[ "$before" = "$after" ]]
printf 'Stable configuration SHA256 %s; decision inbox enabled; promotion %s\n' "$after" "$mode"
if [[ "$mode" != prepare ]]; then
 sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge up -d --no-deps app
fi
