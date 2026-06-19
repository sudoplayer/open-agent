# Web Server 压力测试

直接对 Fastify Web Server 做平台容量压测，跳过 nginx + OpenWebUI。LLM 由内置 Mock 接管，**无需修改 `.env`**。

压测默认使用 **18888** 端口（与开发用 8888 隔离）。每轮跑完会在 `stress_testing/results/` 自动生成 `report-*.md`；全部完成后，将结论汇总填入 `[results/baseline.md](results/baseline.md)`。

---

## 前置条件

1. Node.js 22+，项目根目录已执行 `npm install`
2. 系统已安装 [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)
3. 压测期间 **18888、9999 端口未被占用**
4. 开发 server 占 8888 **不影响**压测

### 安装 k6（Ubuntu / Debian）

```bash
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

```bash
# 检查 k6
k6 version

# 确认端口空闲（无输出即 OK）
lsof -i :18888 -i :9999
```

---

## 完整压测步骤

按顺序执行。每步结束后记录终端输出的 `Report:` 路径，供后续填写 `baseline.md` 使用。

### 步骤 0：准备

```bash
cd /path/to/open-agent
bash stress_testing/scripts/cleanup_runs.sh
```

在 `baseline.md` 顶部填写：日期、环境（本机/服务器）、CPU 核数、内存 GB（报告里也会自动生成，可从中复制）。

---

### 步骤 1：L0 基线

目的：测 `GET /health`、`GET /v1/models` 裸 RPS/latency，确认 Web Server 本身无异常。

```bash
VU=10 DURATION=30s npm run stress:l0
```

**通过标准**：`report-l0-*.md` 中 health/models 错误率为 0%，p95 < 50ms。

**填入 baseline.md →「L0 基线」**：从报告中复制 `/health` 与 `/v1/models` 的 RPS、p95、错误率。

---

### 步骤 2：L1 并发拐点（VU 阶梯）

目的：逐步提高并发 SSE 连接数，找到 error rate 或 p95 time-to-DONE 明显恶化的拐点。

固定参数：`DURATION=30s`，`MAX_SESSIONS=1000`（默认）。**每轮 VU 跑完再跑下一轮**。

```bash
VU=5    DURATION=30s npm run stress:l1
VU=10   DURATION=30s npm run stress:l1
VU=20   DURATION=30s npm run stress:l1
VU=50   DURATION=30s npm run stress:l1
VU=100  DURATION=30s npm run stress:l1
VU=200  DURATION=30s npm run stress:l1
VU=500  DURATION=30s npm run stress:l1
VU=1000 DURATION=30s npm run stress:l1
```

若某轮 error rate > 1% 或 p95 急剧升高，可停止继续加压，该 VU 即为拐点参考。

**填入 baseline.md →「L1 并发拐点」**：每轮从 `report-l1-concurrent-*.md` 复制：


| 字段                 | 报告中的位置                     |
| ------------------ | -------------------------- |
| 请求数                | 结果摘要 → HTTP 请求数            |
| 错误率                | 结果摘要 → 错误率                 |
| p95 http_req_waiting | 结果摘要 → http_req_waiting p95 |
| p95 time-to-DONE   | 结果摘要 → time_to_done p95    |
| max active_streams | 运行时采样 → max active_streams |


最后填写 **推荐最大并发 SSE 数**（error rate 仍 < 1% 且 p95 time-to-DONE 可接受的最高 VU，或拐点前一档）。

---

### 步骤 2b：L1 长 Mock 流（可选，建议在步骤 2 之后做）

目的：模拟真实 LLM **长 SSE 流**（几十秒级），观察 `active_streams` 在持续负载下的表现。  
**不要与步骤 2 同时改 VU 和流长**——先完成 VU 阶梯，再在本节固定 VU 拉长 Mock。

Mock 流时长近似：

```text
(MOCK_CHUNK_COUNT + 1) × MOCK_CHUNK_DELAY_MS
```

（`+1` 为 role chunk；未设 `MOCK_CHUNK_COUNT` 时按响应词数自动拆分，流很短。）

示例：约 30s Mock 流，VU=100，持续 5 分钟：

```bash
MOCK_CHUNK_COUNT=600 MOCK_CHUNK_DELAY_MS=50 VU=100 DURATION=5m npm run stress:l1
```

示例：约 30s Mock 流（更少 chunk、更大间隔）：

```bash
MOCK_CHUNK_COUNT=60 MOCK_CHUNK_DELAY_MS=500 VU=100 DURATION=5m npm run stress:l1
```

**填入 baseline.md →「L1 长 Mock 流」**：每轮从 `report-l1-concurrent-*.md` 复制：


| 字段                      | 报告中的位置                     |
| ----------------------- | -------------------------- |
| 请求数 / 成功 SSE           | 结果摘要                       |
| 错误率                     | 结果摘要 → 错误率                 |
| p95 http_req_waiting    | 结果摘要 → http_req_waiting p95 |
| p95 http_req_receiving  | 结果摘要 → http_req_receiving p95 |
| p95 time-to-DONE        | 结果摘要 → time_to_done p95    |
| max active_streams      | 运行时采样 → max active_streams |
| 峰值 RSS (MB)             | 运行时采样 → 峰值 RSS            |


最后填写 **长流结论** 与 **长流推荐并发 SSE 上限**。

---

### 步骤 3：L1 会话容量（TARGET_SESSIONS 阶梯）

目的：创建大量唯一 session，观察 RSS 增长与 LRU 驱逐，确定推荐 `MAX_SESSIONS`。

```bash
SCENARIO=capacity TARGET_SESSIONS=100  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=200  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=500  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=1000 npm run stress:l1
```

若某轮出现 OOM、error rate > 1%、或 RSS 持续飙升不回落，停止继续加压。

**填入 baseline.md →「L1 会话容量」**：每轮从 `report-l1-capacity-*.md` 复制：


| 字段          | 报告中的位置                |
| ----------- | --------------------- |
| 成功数         | 结果摘要 → 成功 SSE（[DONE]） |
| 错误率         | 结果摘要 → 错误率            |
| 峰值 RSS (MB) | 运行时采样 → 峰值 RSS        |
| 备注          | 是否 OOM、LRU 驱逐、耗时异常等   |


最后填写：

- **推荐 MAX_SESSIONS** = RSS 稳定且无 OOM 的最大 TARGET_SESSIONS
- **生产建议 MAX_SESSIONS** = 推荐值 × 0.8

---

### 步骤 4：清理

```bash
bash stress_testing/scripts/cleanup_runs.sh
```

---

### 步骤 5：汇总到 baseline.md

打开 `[results/baseline.md](results/baseline.md)`，根据各轮 `report-*.md` 填写表格与结论段。

**容量评估公式（参考）**：

1. **并发上限** = L1 并发阶梯中 error rate < 1% 的最高 VU
2. **会话上限** = L1 容量阶梯中 RSS 稳定、无 OOM 的最大 TARGET_SESSIONS
3. **生产 MAX_SESSIONS** = 会话上限 × 0.8

---

## 测试层级


| 层级            | 命令                                                      | 目的                                            |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| L0            | `npm run stress:l0`                                     | `GET /health`、`GET /v1/models` RPS/latency 基线 |
| L1 concurrent | `npm run stress:l1`                                     | 多 VU 并发 SSE，找并发拐点                             |
| L1 capacity   | `SCENARIO=capacity TARGET_SESSIONS=N npm run stress:l1` | 创建 N 个唯一 session，测 LRU / 内存                   |


---

## 参数（环境变量）


| 变量                    | 默认                       | 说明                        |
| --------------------- | ------------------------ | ------------------------- |
| `BASE_URL`            | `http://127.0.0.1:18888` | Web server 地址             |
| `API_PORT`            | `18888`                  | 启动 server 的端口             |
| `MOCK_PORT`           | `9999`                   | Mock LLM 端口               |
| `MAX_SESSIONS`        | `1000`                   | 注入到 server 的 LRU 上限       |
| `VU`                  | `10`                     | L1 并发虚拟用户数                |
| `DURATION`            | `30s`                    | L1 并发持续时间                 |
| `SCENARIO`            | `concurrent`             | `concurrent` 或 `capacity` |
| `TARGET_SESSIONS`     | `200`                    | capacity 模式目标 session 数   |
| `MOCK_CHUNK_DELAY_MS` | `50`                     | Mock 每个 chunk 延迟（ms）      |
| `MOCK_CHUNK_COUNT`    | （未设，按词拆分）               | Mock 内容 chunk 数；设后近似时长见步骤 2b |
| `INTERVAL`            | `2`                      | metrics 采样间隔（秒）            |
| `CHAT_TIMEOUT`        | `180s`                   | k6 单次 chat 请求超时             |


---

## 产出文件


| 文件                          | 说明                      |
| --------------------------- | ----------------------- |
| `report-l0-*.md`            | L0 单次自动报告               |
| `report-l1-concurrent-*.md` | L1 并发单次自动报告             |
| `report-l1-capacity-*.md`   | L1 容量单次自动报告             |
| `summary-*.json`            | k6 原始汇总                 |
| `metrics-*.csv`             | active_streams / RSS 采样（本地，不入库） |
| `baseline.md`               | **性能参考汇总**（跨多轮结论，入库）      |
| `baseline.example.md`       | 空白模板（入库）                  |


`results/` 目录说明见 [`results/README.md`](results/README.md)。

---

## 目录结构

```
stress_testing/
├── fixtures/          # 请求样例
├── k6/                # k6 脚本
├── mocks/             # Mock LLM server
├── scripts/           # 运行、报告、清理脚本
└── results/           # 压测输出（report/summary 等 gitignored；baseline 入库）
```

---

## 不在范围内

- nginx / OpenWebUI 全链路
- 真实 LLM / HITL 多轮
- 同 session 并发 POST

