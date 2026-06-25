import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import {
  chatUrl,
  capacityChatPayload,
  capacityChatHeaders,
  hasSseDone,
  CHAT_TIMEOUT,
} from "./lib/sse.js";

const timeToDone = new Trend("time_to_done", true);
const chatErrors = new Rate("chat_errors");
const sessionsCreated = new Counter("sessions_created");

const targetSessions = Number(__ENV.TARGET_SESSIONS || 200);

export const options = {
  scenarios: {
    session_capacity: {
      executor: "per-vu-iterations",
      vus: targetSessions,
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION || "30m",
    },
  },
  thresholds: {
    chat_errors: ["rate<0.05"],
  },
};

export default function () {
  const payload = capacityChatPayload(__VU);
  const start = Date.now();

  const res = http.post(chatUrl(), payload, {
    headers: capacityChatHeaders(__VU),
    timeout: CHAT_TIMEOUT,
    tags: { name: "chat_completions_capacity" },
  });

  timeToDone.add(Date.now() - start);

  const ok = check(res, {
    "chat status 200": (r) => r.status === 200,
    "chat has DONE": (r) => hasSseDone(r.body),
  });

  if (ok) {
    sessionsCreated.add(1);
  }
  chatErrors.add(!ok);

  sleep(0.1);
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    [`stress_testing/results/summary-l1-capacity-${ts}.json`]: JSON.stringify(
      data,
      null,
      2
    ),
    stdout: textSummary(data, targetSessions),
  };
}

function textSummary(data, target) {
  const lines = [`\n=== L1 Session Capacity (target=${target}) ===`];
  const ttd = data.metrics?.time_to_done?.values;
  if (ttd) {
    lines.push(
      `time_to_done: count=${ttd.count} p95=${ttd["p(95)"]}ms max=${ttd.max}ms`
    );
  }
  const created = data.metrics?.sessions_created?.values;
  if (created) {
    lines.push(`sessions_created: ${created.count}`);
  }
  const err = data.metrics?.chat_errors?.values;
  if (err) {
    lines.push(`chat_errors: rate=${err.rate}`);
  }
  return lines.join("\n") + "\n";
}
