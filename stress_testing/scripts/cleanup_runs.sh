#!/usr/bin/env bash
# Remove run artifacts created during stress tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUNS_DIR="${REPO_ROOT}/runs"
MARKER="${REPO_ROOT}/stress_testing/results/.stress_run_start"

if [ ! -d "${RUNS_DIR}" ]; then
  echo "No runs/ directory — nothing to clean."
  exit 0
fi

if [ -f "${MARKER}" ]; then
  echo "Removing session dirs in runs/ modified after stress test start (${MARKER})..."
  MARKER_EPOCH="$(stat -c %Y "${MARKER}" 2>/dev/null || stat -f %m "${MARKER}")"
  removed=0
  for dir in "${RUNS_DIR}"/*; do
    [ -d "${dir}" ] || continue
    dir_epoch="$(stat -c %Y "${dir}" 2>/dev/null || stat -f %m "${dir}")"
    if [ "${dir_epoch}" -ge "${MARKER_EPOCH}" ]; then
      rm -rf "${dir}"
      removed=$((removed + 1))
    fi
  done
  rm -f "${MARKER}"
  echo "Removed ${removed} session director(ies)."
  exit 0
fi

# Deterministic capacity sessions: load-cap-user + load-cap-chat-XXXXXX + demo
if [ "${1:-}" = "--capacity" ]; then
  TARGET="${2:-200}"
  echo "Removing capacity test sessions (target=${TARGET})..."
  npx tsx -e "
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    const runs = '${RUNS_DIR}';
    const target = ${TARGET};
    let removed = 0;
    for (let i = 1; i <= target; i++) {
      const chatId = 'load-cap-chat-' + String(i).padStart(6, '0');
      const raw = 'load-cap-user:' + chatId + ':demo';
      const id = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex').slice(0, 32);
      const dir = path.join(runs, id);
      if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); removed++; }
    }
    console.log('Removed ' + removed + ' capacity session director(ies).');
  "
  exit 0
fi

echo "Usage:"
echo "  $0                    # clean dirs modified after last stress run (uses .stress_run_start marker)"
echo "  $0 --capacity N       # clean deterministic capacity test sessions (1..N)"
echo ""
echo "No marker file found. Run a stress test first, or use --capacity N."
