#!/usr/bin/env bash
# Sample /health and process RSS during a stress test run.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8888}"
OUTFILE="${2:-stress_testing/results/metrics.csv}"
INTERVAL="${INTERVAL:-2}"
SERVER_PID="${SERVER_PID:-}"

mkdir -p "$(dirname "${OUTFILE}")"
echo "timestamp,active_streams,rss_kb" > "${OUTFILE}"

find_server_pid() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "${SERVER_PID}"
    return
  fi
  pgrep -f "tsx.*src/web_server.ts" 2>/dev/null | head -1 || true
}

while true; do
  ts="$(date -Iseconds)"
  streams=""
  if curl -sf "${BASE_URL}/health" -o /tmp/stress-health.json 2>/dev/null; then
    streams="$(python3 -c "import json; print(json.load(open('/tmp/stress-health.json')).get('active_streams',''))" 2>/dev/null || echo "")"
  fi

  pid="$(find_server_pid)"
  rss=""
  if [ -n "${pid}" ]; then
    rss="$(ps -o rss= -p "${pid}" 2>/dev/null | tr -d ' ' || echo "")"
  fi

  echo "${ts},${streams},${rss}" >> "${OUTFILE}"
  sleep "${INTERVAL}"
done
