/**
 * Generate a markdown report from k6 summary JSON + metrics CSV.
 *
 * Supports both k6 export formats:
 * - handleSummary: metrics[name].values + thresholds[key].ok
 * - --summary-export: flat metrics[name] + thresholds[key] as boolean
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface K6MetricValues {
  count?: number;
  rate?: number;
  avg?: number;
  min?: number;
  max?: number;
  med?: number;
  "p(90)"?: number;
  "p(95)"?: number;
  "p(99)"?: number;
  value?: number;
}

interface K6MetricEntry {
  values?: K6MetricValues;
  thresholds?: Record<string, boolean | { ok: boolean }>;
  [key: string]: unknown;
}

interface K6Summary {
  state?: { testRunDurationMs?: number };
  metrics?: Record<string, K6MetricEntry>;
}

interface MetricsStats {
  maxActiveStreams: number;
  peakRssMb: number;
  sampleCount: number;
}

interface RunConfig {
  level: "l0" | "l1";
  scenario?: "concurrent" | "capacity";
  vu?: string;
  duration?: string;
  targetSessions?: string;
  maxSessions?: string;
  baseUrl?: string;
  apiPort?: string;
}

const VALUE_KEYS = [
  "count",
  "rate",
  "avg",
  "min",
  "max",
  "med",
  "p(90)",
  "p(95)",
  "p(99)",
  "value",
] as const;

function parseArgs(argv: string[]): {
  summaryPath: string;
  metricsPath: string;
  outputPath?: string;
  config: RunConfig;
} {
  const config: RunConfig = { level: "l0" };
  let summaryPath = "";
  let metricsPath = "";
  let outputPath: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--summary":
        summaryPath = next;
        i++;
        break;
      case "--metrics":
        metricsPath = next;
        i++;
        break;
      case "--output":
        outputPath = next;
        i++;
        break;
      case "--level":
        config.level = next as RunConfig["level"];
        i++;
        break;
      case "--scenario":
        config.scenario = next as RunConfig["scenario"];
        i++;
        break;
      case "--vu":
        config.vu = next;
        i++;
        break;
      case "--duration":
        config.duration = next;
        i++;
        break;
      case "--target-sessions":
        config.targetSessions = next;
        i++;
        break;
      case "--max-sessions":
        config.maxSessions = next;
        i++;
        break;
      case "--base-url":
        config.baseUrl = next;
        i++;
        break;
      case "--api-port":
        config.apiPort = next;
        i++;
        break;
      default:
        break;
    }
  }

  if (!summaryPath || !metricsPath) {
    console.error("Usage: generate_report.ts --summary <json> --metrics <csv> --level l0|l1");
    process.exit(1);
  }

  return { summaryPath, metricsPath, outputPath, config };
}

function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

function fmtPct(rate: number | undefined): string {
  if (rate === undefined || Number.isNaN(rate)) return "-";
  return `${(rate * 100).toFixed(2)}%`;
}

/** Normalize handleSummary (.values) and --summary-export (flat) formats. */
function metricValues(summary: K6Summary, name: string): K6MetricValues | undefined {
  const entry = summary.metrics?.[name];
  if (!entry) return undefined;

  if (entry.values && typeof entry.values === "object") {
    return entry.values;
  }

  const values: K6MetricValues = {};
  for (const key of VALUE_KEYS) {
    const v = entry[key];
    if (typeof v === "number") {
      values[key] = v;
    }
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

/** Rate metrics: .rate (handleSummary) or .value (--summary-export). */
function metricRate(summary: K6Summary, name: string): number | undefined {
  const v = metricValues(summary, name);
  if (!v) return undefined;
  if (v.rate !== undefined) return v.rate;
  if (v.value !== undefined) return v.value;
  return undefined;
}

function metricNum(summary: K6Summary, name: string, field: keyof K6MetricValues): number | undefined {
  const v = metricValues(summary, name);
  if (v?.[field] !== undefined) return v[field];
  const entry = summary.metrics?.[name];
  if (entry && typeof entry[field] === "number") return entry[field] as number;
  return undefined;
}

function thresholdOk(summary: K6Summary, name: string, key: string): string {
  const entry = summary.metrics?.[name]?.thresholds?.[key];
  if (entry === undefined) return "-";
  if (typeof entry === "boolean") {
    // --summary-export: true = threshold violated
    return entry ? "fail" : "pass";
  }
  if (typeof entry === "object" && entry !== null && "ok" in entry) {
    return entry.ok ? "pass" : "fail";
  }
  return "-";
}

function testRunDurationMs(summary: K6Summary): number | undefined {
  if (summary.state?.testRunDurationMs !== undefined) {
    return summary.state.testRunDurationMs;
  }
  const httpReqs = metricValues(summary, "http_reqs");
  if (httpReqs?.count && httpReqs.rate && httpReqs.rate > 0) {
    return (httpReqs.count / httpReqs.rate) * 1000;
  }
  return undefined;
}

function parseMetricsCsv(csvPath: string): MetricsStats {
  const text = fs.readFileSync(csvPath, "utf-8").trim();
  const lines = text.split("\n").slice(1);
  let maxActiveStreams = 0;
  let peakRssKb = 0;

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const streams = Number(parts[1]);
    const rss = Number(parts[2]);
    if (!Number.isNaN(streams)) maxActiveStreams = Math.max(maxActiveStreams, streams);
    if (!Number.isNaN(rss)) peakRssKb = Math.max(peakRssKb, rss);
  }

  return {
    maxActiveStreams,
    peakRssMb: peakRssKb / 1024,
    sampleCount: lines.length,
  };
}

function hostname(): string {
  try {
    return os.hostname();
  } catch {
    return "unknown";
  }
}

function cpuCount(): number {
  return os.cpus().length;
}

function totalMemGb(): string {
  return (os.totalmem() / 1024 ** 3).toFixed(1);
}

function buildHeader(config: RunConfig, durationMs: number | undefined): string {
  const now = new Date();
  const title =
    config.level === "l0"
      ? "L0 基线压测报告"
      : config.scenario === "capacity"
        ? "L1 会话容量压测报告"
        : "L1 并发压测报告";

  return `# ${title}

生成时间：${now.toISOString()}  
主机：${hostname()}（${cpuCount()} 核，${totalMemGb()} GB 内存）  
目标：${config.baseUrl ?? "-"}（API_PORT=${config.apiPort ?? "-"}，MAX_SESSIONS=${config.maxSessions ?? "-"}）  
k6 运行时长：${durationMs !== undefined ? `${(durationMs / 1000).toFixed(1)}s` : "-"}  
`;
}

function buildL0Report(summary: K6Summary, stats: MetricsStats, config: RunConfig): string {
  const health = metricValues(summary, "health_latency");
  const models = metricValues(summary, "models_latency");
  const healthErrRate = metricRate(summary, "health_errors");
  const modelsErrRate = metricRate(summary, "models_errors");
  const httpReqs = metricValues(summary, "http_reqs");
  const checksRate = metricRate(summary, "checks");

  const perEndpointRps = httpReqs?.rate !== undefined ? httpReqs.rate / 2 : undefined;
  const healthPass =
    thresholdOk(summary, "health_errors", "rate<0.01") === "pass" &&
    thresholdOk(summary, "health_latency", "p(99)<50") !== "fail";
  const modelsPass =
    thresholdOk(summary, "models_errors", "rate<0.01") === "pass" &&
    thresholdOk(summary, "models_latency", "p(99)<50") !== "fail";

  return `${buildHeader(config, testRunDurationMs(summary))}
## 配置

| 参数 | 值 |
|------|-----|
| VU | ${config.vu ?? "-"} |
| DURATION | ${config.duration ?? "-"} |

## 结果摘要

| 端点 | RPS | p95 (ms) | 错误率 | 阈值 |
|------|-----|----------|--------|------|
| GET /health | ${fmt(perEndpointRps)} | ${fmt(health?.["p(95)"])} | ${fmtPct(healthErrRate)} | health p99<50ms: ${thresholdOk(summary, "health_latency", "p(99)<50")} |
| GET /v1/models | ${fmt(perEndpointRps)} | ${fmt(models?.["p(95)"])} | ${fmtPct(modelsErrRate)} | models p99<50ms: ${thresholdOk(summary, "models_latency", "p(99)<50")} |

## 请求统计

| 指标 | 值 |
|------|-----|
| 总 HTTP 请求数 | ${httpReqs?.count ?? "-"} |
| 总 RPS | ${fmt(httpReqs?.rate)} |
| VU max | ${metricNum(summary, "vus_max", "max") ?? "-"} |
| checks 通过率 | ${fmtPct(checksRate)} |

## 运行时采样（metrics CSV）

| 指标 | 值 |
|------|-----|
| 采样次数 | ${stats.sampleCount} |
| max active_streams | ${stats.maxActiveStreams} |
| 峰值 RSS (MB) | ${fmt(stats.peakRssMb, 1)} |

## 结论

- L0 通过标准：p99 < 50ms，零错误
- health/models 阈值：${healthPass && modelsPass ? "通过" : "需关注"}
`;
}

function buildL1Report(summary: K6Summary, stats: MetricsStats, config: RunConfig): string {
  const ttd = metricValues(summary, "time_to_done");
  const chatErrRate = metricRate(summary, "chat_errors");
  const httpReqs = metricValues(summary, "http_reqs");
  const sessionsCreated = metricValues(summary, "sessions_created");
  const sseDone = metricValues(summary, "sse_done_count");

  const isCapacity = config.scenario === "capacity";

  return `${buildHeader(config, testRunDurationMs(summary))}
## 配置

| 参数 | 值 |
|------|-----|
| SCENARIO | ${config.scenario ?? "concurrent"} |
| VU | ${config.vu ?? "-"} |
| DURATION | ${config.duration ?? "-"} |
| TARGET_SESSIONS | ${config.targetSessions ?? "-"} |
| MAX_SESSIONS | ${config.maxSessions ?? "-"} |

## 结果摘要

| 指标 | 值 |
|------|-----|
| HTTP 请求数 | ${httpReqs?.count ?? "-"} |
| 成功 SSE（[DONE]） | ${sseDone?.count ?? sessionsCreated?.count ?? "-"} |
| 错误率 | ${fmtPct(chatErrRate)} |
| time_to_done p95 (ms) | ${fmt(ttd?.["p(95)"], 1)} |
| time_to_done max (ms) | ${fmt(ttd?.max, 1)} |
| time_to_done avg (ms) | ${fmt(ttd?.avg, 1)} |
| chat_errors 阈值 (rate<0.05) | ${thresholdOk(summary, "chat_errors", "rate<0.05")} |

## 运行时采样（metrics CSV）

| 指标 | 值 |
|------|-----|
| 采样次数 | ${stats.sampleCount} |
| max active_streams | ${stats.maxActiveStreams} |
| 峰值 RSS (MB) | ${fmt(stats.peakRssMb, 1)} |

## 结论

${
  isCapacity
    ? `- 目标创建 ${config.targetSessions ?? "-"} 个 session，成功 ${sessionsCreated?.count ?? sseDone?.count ?? "-"} 个
- 峰值 RSS ${fmt(stats.peakRssMb, 1)} MB；若 error rate < 1% 且无 OOM，可继续提高 TARGET_SESSIONS 探测上限
- 生产建议 MAX_SESSIONS ≈ 稳定上限 × 0.8`
    : `- 并发 VU=${config.vu ?? "-"} 下完成 ${httpReqs?.count ?? "-"} 次 SSE 请求，错误率 ${fmtPct(chatErrRate)}
- max active_streams=${stats.maxActiveStreams}，p95 time-to-DONE=${fmt(ttd?.["p(95)"], 1)} ms
- 逐步提高 VU 寻找 error rate > 1% 或 p95 恶化拐点`
}
`;
}

function main(): void {
  const { summaryPath, metricsPath, outputPath, config } = parseArgs(process.argv);

  const summary: K6Summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const stats = fs.existsSync(metricsPath)
    ? parseMetricsCsv(metricsPath)
    : { maxActiveStreams: 0, peakRssMb: 0, sampleCount: 0 };

  const body =
    config.level === "l0" ? buildL0Report(summary, stats, config) : buildL1Report(summary, stats, config);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const scenarioSuffix = config.level === "l1" && config.scenario ? `-${config.scenario}` : "";
  const defaultOut = path.join(
    path.dirname(summaryPath),
    `report-${config.level}${scenarioSuffix}-${ts}.md`
  );
  const out = outputPath ?? defaultOut;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body, "utf-8");
  console.log(out);
}

main();
