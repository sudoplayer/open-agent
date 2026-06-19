#!/usr/bin/env bash
# L0 baseline: GET /health and GET /v1/models (no Mock LLM).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

require_k6

VU="${VU:-10}"
DURATION="${DURATION:-30s}"

echo "=== L0 Health Baseline (VU=${VU}, DURATION=${DURATION}) ==="

start_server

start_metrics_collector
METRICS_FILE="${STRESS_METRICS_FILE}"
export SERVER_PID

prepare_run_artifacts "l0"

k6 run \
  --summary-export="${STRESS_SUMMARY_FILE}" \
  -e "BASE_URL=${BASE_URL}" \
  -e "VU=${VU}" \
  -e "DURATION=${DURATION}" \
  "${REPO_ROOT}/stress_testing/k6/00_health.js"

generate_report "l0"

echo "Metrics: ${METRICS_FILE}"
echo "Summary: ${STRESS_SUMMARY_FILE}"
echo "Report: ${STRESS_REPORT_FILE}"
echo "L0 complete."
