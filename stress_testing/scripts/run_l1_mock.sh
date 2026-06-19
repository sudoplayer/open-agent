#!/usr/bin/env bash
# L1 platform capacity: Mock LLM + SSE chat completions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_k6

VU="${VU:-10}"
DURATION="${DURATION:-30s}"
SCENARIO="${SCENARIO:-concurrent}"
TARGET_SESSIONS="${TARGET_SESSIONS:-200}"
MAX_DURATION="${MAX_DURATION:-30m}"

MARKER="${REPO_ROOT}/stress_testing/results/.stress_run_start"
mkdir -p "$(dirname "${MARKER}")"
touch "${MARKER}"

echo "=== L1 Platform Stress (SCENARIO=${SCENARIO}, MAX_SESSIONS=${MAX_SESSIONS}) ==="

start_mock
start_server

start_metrics_collector
export SERVER_PID

prepare_run_artifacts "l1-${SCENARIO}"

K6_ARGS=(
  --summary-export="${STRESS_SUMMARY_FILE}"
  -e "BASE_URL=${BASE_URL}"
  -e "VU=${VU}"
  -e "DURATION=${DURATION}"
  -e "TARGET_SESSIONS=${TARGET_SESSIONS}"
  -e "MAX_DURATION=${MAX_DURATION}"
)

case "${SCENARIO}" in
  concurrent)
    k6 run "${K6_ARGS[@]}" "${REPO_ROOT}/stress_testing/k6/10_concurrent_sessions.js"
    ;;
  capacity)
    k6 run "${K6_ARGS[@]}" "${REPO_ROOT}/stress_testing/k6/11_session_capacity.js"
    ;;
  *)
    echo "Unknown SCENARIO=${SCENARIO}. Use 'concurrent' or 'capacity'." >&2
    exit 1
    ;;
esac

generate_report "l1" "${SCENARIO}"

echo "Metrics: ${STRESS_METRICS_FILE}"
echo "Summary: ${STRESS_SUMMARY_FILE}"
echo "Report: ${STRESS_REPORT_FILE}"
echo "L1 complete."
echo "Cleanup: bash stress_testing/scripts/cleanup_runs.sh"
