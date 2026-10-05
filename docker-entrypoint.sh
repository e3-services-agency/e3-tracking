#!/bin/sh
# T-5-00 (D-66): pick the process by argument or ENTRYPOINT_MODE (app | mcp | backup | backup-once).
set -e
MODE="${1:-${ENTRYPOINT_MODE:-app}}"
case "$MODE" in
  app) exec node api/_backend/server.js ;;
  mcp) exec node api/_backend/mcp.js ;;
  backup) exec node api/_backend/backup-job.js ;;
  backup-once) exec node api/_backend/backup-job.js --once ;;
  *) exec "$@" ;;
esac
