# Web Server Stress Testing

Direct platform capacity testing against the Fastify Web Server, bypassing nginx + OpenWebUI. The LLM is handled by a built-in Mock — **no `.env` changes required**.

Stress tests use port **18888** by default (isolated from the dev server on 8888). After each run, a `report-*.md` is automatically generated under `stress_testing/results/`; when all runs are complete, consolidate the findings into [`results/baseline.md`](results/baseline.md).

---

## Prerequisites

1. Node.js 22+, with `npm install` run at the project root
2. [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed on your system
3. Ports **18888** and **9999** must be free during stress testing
4. The dev server on 8888 **does not affect** stress testing

### Install k6 (Ubuntu / Debian)

```bash
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

```bash
# Verify k6 is available
k6 version

# Confirm ports are free (no output means OK)
lsof -i :18888 -i :9999
```

---

## Full Stress Test Procedure

Execute in order. After each step, note the `Report:` path printed in the terminal for filling in `baseline.md` later.

### Step 0: Preparation

```bash
cd /path/to/open-agent
bash stress_testing/scripts/cleanup_runs.sh
```

At the top of `baseline.md`, fill in: date, environment (local machine / server), CPU cores, memory in GB (these are also auto-generated in reports — you can copy from there).

---

### Step 1: L0 Baseline

Purpose: measure raw RPS/latency for `GET /health` and `GET /v1/models`, confirming the Web Server itself has no anomalies.

```bash
VU=10 DURATION=30s npm run stress:l0
```

**Pass criteria**: in `report-l0-*.md`, health/models error rate is 0%, p95 < 50ms.

**Fill in baseline.md → "L0 Baseline"**: copy RPS, p95, and error rate for `/health` and `/v1/models` from the report.

---

### Step 2: L1 Concurrency Inflection Point (VU Ladder)

Purpose: gradually increase concurrent SSE connections to find the inflection point where error rate or p95 time-to-DONE degrades noticeably.

Fixed parameters: `DURATION=30s`, `MAX_SESSIONS=1000` (default). **Run each VU round before starting the next**.

```bash
VU=5  DURATION=30s npm run stress:l1
VU=10 DURATION=30s npm run stress:l1
VU=20 DURATION=30s npm run stress:l1
VU=50 DURATION=30s npm run stress:l1
VU=100  DURATION=30s npm run stress:l1
VU=200 DURATION=30s npm run stress:l1
VU=500 DURATION=30s npm run stress:l1
VU=1000 DURATION=30s npm run stress:l1
```

If a round has error rate > 1% or p95 spikes sharply, stop increasing load — that VU is the inflection point reference.

**Fill in baseline.md → "L1 Concurrency Inflection Point"**: for each round, copy from `report-l1-concurrent-*.md`:

| Field | Location in report |
|-------|-------------------|
| Request count | Results summary → HTTP request count |
| Error rate | Results summary → Error rate |
| p95 http_req_waiting | Results summary → http_req_waiting p95 |
| p95 time-to-DONE | Results summary → time_to_done p95 |
| max active_streams | Runtime sampling → max active_streams |

Finally, fill in **Recommended max concurrent SSE connections** (highest VU with error rate still < 1% and acceptable p95 time-to-DONE, or the tier before the inflection point).

---

### Step 2b: L1 Long Mock Streams (optional, after Step 2)

Purpose: simulate **long SSE streams** (tens of seconds) like real LLM responses. Do **not** change VU and stream length in the same first pass — finish the VU ladder first, then fix VU and lengthen the mock.

Approximate mock stream duration:

```text
(MOCK_CHUNK_COUNT + 1) × MOCK_CHUNK_DELAY_MS
```

(`+1` is the role chunk; without `MOCK_CHUNK_COUNT`, content is split by words and stays very short.)

Example — ~30s mock stream, VU=100, 5 minutes sustained:

```bash
MOCK_CHUNK_COUNT=600 MOCK_CHUNK_DELAY_MS=50 VU=100 DURATION=5m npm run stress:l1
```

Example — ~30s with fewer chunks and longer delay:

```bash
MOCK_CHUNK_COUNT=60 MOCK_CHUNK_DELAY_MS=500 VU=100 DURATION=5m npm run stress:l1
```

**Fill in baseline.md → "L1 Long Mock Streams"**: for each round, copy from `report-l1-concurrent-*.md`:

| Field | Location in report |
|-------|-------------------|
| Request count / successful SSE | Results summary |
| Error rate | Results summary → Error rate |
| p95 http_req_waiting | Results summary → http_req_waiting p95 |
| p95 http_req_receiving | Results summary → http_req_receiving p95 |
| p95 time-to-DONE | Results summary → time_to_done p95 |
| max active_streams | Runtime sampling → max active_streams |
| Peak RSS (MB) | Runtime sampling → Peak RSS |

Finally, fill in **Long-stream conclusions** and **Recommended long-stream concurrent SSE ceiling**.

---

### Step 3: L1 Session Capacity (TARGET_SESSIONS Ladder)

Purpose: create many unique sessions, observe RSS growth and LRU eviction, and determine the recommended `MAX_SESSIONS`.

```bash
SCENARIO=capacity TARGET_SESSIONS=100  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=200  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=500  npm run stress:l1
SCENARIO=capacity TARGET_SESSIONS=1000 npm run stress:l1
```

If a round hits OOM, error rate > 1%, or RSS keeps climbing without settling, stop increasing load.

**Fill in baseline.md → "L1 Session Capacity"**: for each round, copy from `report-l1-capacity-*.md`:

| Field | Location in report |
|-------|-------------------|
| Success count | Results summary → Successful SSE ([DONE]) |
| Error rate | Results summary → Error rate |
| Peak RSS (MB) | Runtime sampling → Peak RSS |
| Notes | OOM, LRU eviction, abnormal duration, etc. |

Finally, fill in:

- **Recommended MAX_SESSIONS** = largest TARGET_SESSIONS with stable RSS and no OOM
- **Production MAX_SESSIONS** = recommended value × 0.8

---

### Step 4: Cleanup

```bash
bash stress_testing/scripts/cleanup_runs.sh
```

---

### Step 5: Consolidate into baseline.md

Open [`results/baseline.md`](results/baseline.md) and fill in the tables and conclusion sections based on each round's `report-*.md`.

**Capacity evaluation formulas (reference)**:

1. **Concurrency ceiling** = highest VU in the L1 concurrency ladder with error rate < 1%
2. **Session ceiling** = largest TARGET_SESSIONS in the L1 capacity ladder with stable RSS and no OOM
3. **Production MAX_SESSIONS** = session ceiling × 0.8

---

## Test Levels

| Level | Command | Purpose |
|-------|---------|---------|
| L0 | `npm run stress:l0` | `GET /health`, `GET /v1/models` RPS/latency baseline |
| L1 concurrent | `npm run stress:l1` | Multi-VU concurrent SSE, find concurrency inflection point |
| L1 capacity | `SCENARIO=capacity TARGET_SESSIONS=N npm run stress:l1` | Create N unique sessions, test LRU / memory |

---

## Parameters (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://127.0.0.1:18888` | Web server address |
| `API_PORT` | `18888` | Port to start the server on |
| `MOCK_PORT` | `9999` | Mock LLM port |
| `MAX_SESSIONS` | `1000` | LRU cap injected into the server |
| `VU` | `10` | L1 concurrency virtual user count |
| `DURATION` | `30s` | L1 concurrency duration |
| `SCENARIO` | `concurrent` | `concurrent` or `capacity` |
| `TARGET_SESSIONS` | `200` | Target session count in capacity mode |
| `MOCK_CHUNK_DELAY_MS` | `50` | Mock per-chunk delay (ms) |
| `MOCK_CHUNK_COUNT` | (unset, split by words) | Number of mock content chunks; see Step 2b for duration |
| `INTERVAL` | `2` | Metrics sampling interval (seconds) |
| `CHAT_TIMEOUT` | `180s` | k6 per-chat request timeout |

---

## Output Files

| File | Description |
|------|-------------|
| `report-l0-*.md` | L0 single-run auto report |
| `report-l1-concurrent-*.md` | L1 concurrency single-run auto report |
| `report-l1-capacity-*.md` | L1 capacity single-run auto report |
| `summary-*.json` | k6 raw summary |
| `metrics-*.csv` | active_streams / RSS sampling (local, not committed) |
| `baseline.md` | **Performance reference** (cross-run consolidation, committed) |
| `baseline.example.md` | Empty template (committed) |

See [`results/README.md`](results/README.md) for the `results/` directory layout.

---

## Directory Structure

```
stress_testing/
├── fixtures/          # Request samples
├── k6/                # k6 scripts
├── mocks/             # Mock LLM server
├── scripts/           # Run, report, and cleanup scripts
└── results/           # Stress test output (reports gitignored; baselines committed)
```

---

## Out of Scope

- nginx / OpenWebUI full pipeline
- Real LLM / HITL multi-turn
- Concurrent POST on the same session
