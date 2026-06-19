#!/usr/bin/env bash
# Shared helpers for stress_testing scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

API_PORT="${API_PORT:-18888}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${API_PORT}}"
MOCK_PORT="${MOCK_PORT:-9999}"
MAX_SESSIONS="${MAX_SESSIONS:-1000}"
MOCK_PID=""
SERVER_PID=""
METRICS_PID=""
STRESS_METRICS_FILE=""

export REPO_ROOT BASE_URL MOCK_PORT API_PORT MAX_SESSIONS

cd "${REPO_ROOT}"

require_k6() {
  if ! command -v k6 >/dev/null 2>&1; then
    echo "Error: k6 is not installed. See stress_testing/README.md for install instructions." >&2
    echo "  https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2
    exit 1
  fi
}

wait_for_url() {
  local url="$1"
  local retries="${2:-30}"
  local i=0
  while [ "$i" -lt "$retries" ]; do
    if curl -sf "${url}" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "Error: timed out waiting for ${url}" >&2
  return 1
}

start_mock() {
  echo "Starting mock LLM on port ${MOCK_PORT}..." >&2
  MOCK_CHUNK_DELAY_MS="${MOCK_CHUNK_DELAY_MS:-50}" \
  MOCK_CHUNK_COUNT="${MOCK_CHUNK_COUNT:-}" \
    npx tsx "${REPO_ROOT}/stress_testing/mocks/openai_compat_server.ts" &
  MOCK_PID=$!
  wait_for_url "http://127.0.0.1:${MOCK_PORT}/health" 20
}

start_server() {
  echo "Starting web server on port ${API_PORT} (MAX_SESSIONS=${MAX_SESSIONS})..." >&2
  if curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
    echo "Error: ${BASE_URL} already responding — stop the existing server or set API_PORT." >&2
    exit 1
  fi
  MODEL_BASE_URL="http://127.0.0.1:${MOCK_PORT}/v1" \
  LLM_API_KEY="mock-key" \
  MAX_SESSIONS="${MAX_SESSIONS}" \
  API_PORT="${API_PORT}" \
  SCENARIO="${AGENT_SCENARIO:-demo}" \
    npx tsx "${REPO_ROOT}/src/web_server.ts" &
  SERVER_PID=$!
  wait_for_url "${BASE_URL}/health" 30
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "Error: web server process exited during startup (port ${API_PORT} in use?)" >&2
    exit 1
  fi
}

stop_process() {
  local pid="$1"
  local name="$2"
  if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
    kill -- -"${pid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
    echo "Stopped ${name} (pid ${pid})" >&2
  fi
}

stop_server_on_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti :"${port}" 2>/dev/null || true)"
  if [ -n "${pids}" ]; then
    echo "Stopping process(es) on port ${port}: ${pids}" >&2
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
}

cleanup() {
  if [ -n "${METRICS_PID}" ] && kill -0 "${METRICS_PID}" 2>/dev/null; then
    kill "${METRICS_PID}" 2>/dev/null || true
    wait "${METRICS_PID}" 2>/dev/null || true
  fi
  stop_process "${SERVER_PID}" "web server"
  stop_process "${MOCK_PID}" "mock LLM"
  stop_server_on_port "${API_PORT}"
  stop_server_on_port "${MOCK_PORT}"
}

trap cleanup EXIT INT TERM

start_metrics_collector() {
  STRESS_METRICS_FILE="${1:-${REPO_ROOT}/stress_testing/results/metrics-$(date +%Y%m%d-%H%M%S).csv}"
  mkdir -p "$(dirname "${STRESS_METRICS_FILE}")"
  echo "Collecting metrics to ${STRESS_METRICS_FILE}" >&2
  bash "${SCRIPT_DIR}/collect_metrics.sh" "${BASE_URL}" "${STRESS_METRICS_FILE}" &
  METRICS_PID=$!
}

prepare_run_artifacts() {
  local prefix="$1"
  RUN_TS="$(date +%Y%m%d-%H%M%S)"
  STRESS_SUMMARY_FILE="${REPO_ROOT}/stress_testing/results/summary-${prefix}-${RUN_TS}.json"
  export STRESS_SUMMARY_FILE RUN_TS
}

generate_report() {
  local level="$1"
  local scenario="${2:-}"
  local args=(
    --summary "${STRESS_SUMMARY_FILE}"
    --metrics "${STRESS_METRICS_FILE}"
    --level "${level}"
    --vu "${VU:-}"
    --max-sessions "${MAX_SESSIONS}"
    --base-url "${BASE_URL}"
    --api-port "${API_PORT}"
  )
  if [ -n "${scenario}" ]; then
    args+=(--scenario "${scenario}")
  fi
  if [ -n "${DURATION:-}" ]; then
    args+=(--duration "${DURATION}")
  fi
  if [ -n "${TARGET_SESSIONS:-}" ]; then
    args+=(--target-sessions "${TARGET_SESSIONS}")
  fi
  STRESS_REPORT_FILE="$(npx tsx "${SCRIPT_DIR}/generate_report.ts" "${args[@]}")"
  echo "Report: ${STRESS_REPORT_FILE}" >&2
}
