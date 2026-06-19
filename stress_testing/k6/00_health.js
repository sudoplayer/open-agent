import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import {
  healthUrl,
  modelsUrl,
  parseActiveStreams,
} from "./lib/sse.js";

const healthLatency = new Trend("health_latency", true);
const modelsLatency = new Trend("models_latency", true);
const healthErrors = new Rate("health_errors");
const modelsErrors = new Rate("models_errors");

export const options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      vus: Number(__ENV.VU || 10),
      duration: __ENV.DURATION || "30s",
      exec: "healthScenario",
    },
    models: {
      executor: "constant-vus",
      vus: Number(__ENV.VU || 10),
      duration: __ENV.DURATION || "30s",
      exec: "modelsScenario",
      startTime: "0s",
    },
  },
  thresholds: {
    health_errors: ["rate<0.01"],
    models_errors: ["rate<0.01"],
    health_latency: ["p(99)<50"],
    models_latency: ["p(99)<50"],
  },
};

export function healthScenario() {
  const res = http.get(healthUrl());
  healthLatency.add(res.timings.duration);
  const ok = check(res, {
    "health status 200": (r) => r.status === 200,
    "health has active_streams": (r) => parseActiveStreams(r.body) !== null,
  });
  healthErrors.add(!ok);
  sleep(0.1);
}

export function modelsScenario() {
  const res = http.get(modelsUrl());
  modelsLatency.add(res.timings.duration);
  const ok = check(res, {
    "models status 200": (r) => r.status === 200,
    "models has data": (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).data);
      } catch {
        return false;
      }
    },
  });
  modelsErrors.add(!ok);
  sleep(0.1);
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    [`stress_testing/results/summary-l0-${ts}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const lines = ["\n=== L0 Health Baseline ==="];
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    if (metric.values) {
      const v = metric.values;
      lines.push(
        `${name}: count=${v.count ?? "-"} p95=${v["p(95)"] ?? "-"}ms rate=${v.rate ?? "-"}`
      );
    }
  }
  return lines.join("\n") + "\n";
}
