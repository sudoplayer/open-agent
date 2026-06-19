import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import {
  chatUrl,
  demoChatPayload,
  jsonHeaders,
  hasSseDone,
  CHAT_TIMEOUT,
} from "./lib/sse.js";

const timeToDone = new Trend("time_to_done", true);
const chatErrors = new Rate("chat_errors");
const sseDoneCount = new Counter("sse_done_count");

export const options = {
  scenarios: {
    concurrent_sessions: {
      executor: "constant-vus",
      vus: Number(__ENV.VU || 10),
      duration: __ENV.DURATION || "30s",
    },
  },
  thresholds: {
    chat_errors: ["rate<0.05"],
  },
};

export default function () {
  const payload = demoChatPayload(__VU, __ITER);
  const start = Date.now();

  const res = http.post(chatUrl(), payload, {
    headers: jsonHeaders(),
    timeout: CHAT_TIMEOUT,
    tags: { name: "chat_completions" },
  });

  const elapsed = Date.now() - start;
  timeToDone.add(elapsed);

  const ok = check(res, {
    "chat status 200": (r) => r.status === 200,
    "chat has DONE": (r) => hasSseDone(r.body),
  });

  if (ok) {
    sseDoneCount.add(1);
  }
  chatErrors.add(!ok);

  sleep(0.5);
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    [`stress_testing/results/summary-l1-concurrent-${ts}.json`]: JSON.stringify(
      data,
      null,
      2
    ),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const lines = ["\n=== L1 Concurrent Sessions ==="];
  const ttd = data.metrics?.time_to_done?.values;
  if (ttd) {
    lines.push(
      `time_to_done: count=${ttd.count} p95=${ttd["p(95)"]}ms max=${ttd.max}ms`
    );
  }
  const err = data.metrics?.chat_errors?.values;
  if (err) {
    lines.push(`chat_errors: rate=${err.rate}`);
  }
  return lines.join("\n") + "\n";
}
