[中文](./README.cn.md) · [English](./README.md)

# 🤖 Open Agent Platform

> Describe your goal in natural language, and the AI agents take care of the rest.

![Open Agent Platform Demo](./assets/demo.gif)

---

## ✨ What Is This?

This is an **agent platform**. You simply describe your goal in natural language, and the system will automatically:

1. 🧠 **Understand Intent** — Identify your needs
2. 🔀 **Task Decomposition** — Break down steps by domain workflow
3. 👷 **Multi-Agent Collaboration** — The Orchestrator schedules specialized Subagents to execute tasks
4. 💬 **Human-in-the-Loop (HITL)** — Interactive cards pop up at orchestration plan and final result confirmation, waiting for your feedback before proceeding

The entire workflow simulates AI multi-agent collaboration with a human-in-the-loop (HITL) pattern.

### 📖 A Concrete Example

When you send `"(1+2)/3*4"`, the system internally goes through the following steps:

1. **Orchestrator Parses Intent** — Recognizes it as a mixed arithmetic expression with parentheses, addition, subtraction, multiplication, and division
2. **Orchestration Plan Confirmation (HITL)** — Shows the operation order using intermediate variables (e.g. `a`, `b`, `c`) without pre-computed results; you confirm before execution
3. **Reduction by Priority** — Delegates to subagents sequentially per the confirmed plan:
  - `add_agent`: `1+2` → `a`
  - `divide_agent`: `a/3` → `b`
  - `multiply_agent`: `b*4` → final result
4. **Final Result Confirmation (HITL)** — Shows the full step-by-step trace and final result; you confirm before saving
5. **Save Output** — Choose a working directory and save `result.md`

Throughout the process, SSE streaming output displays the Orchestrator's reasoning and the subagents' execution progress in real time.

---

## 🎯 What Can It Do?

The platform is **agent-agnostic** — it connects to different domains by replacing the **`agents/`** directory:


| Agent                | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| 📋 **Calculator (default)** | AI scientific calculator — orchestrator-level HITL (plan + result confirmation); subagents run tools only (arithmetic, power, exp, log, trig) |
| 🔧 **Your Agent**      | Write `manifest.yaml` + skills in `agents/` to plug in any domain                               |


---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+**
- **DeepSeek API Key**

### Installation & Launch

```bash
# 1. Install dependencies
npm install

# 2. Configure API Key
cp .env.example .env
# Edit .env, fill in your LLM_API_KEY

# 3. Start the service
npm start
```

The service starts at `http://localhost:8888`, providing an OpenAI-compatible API.

### Verify the Service

```bash
# Health check
curl http://localhost:8888/health

# List available models
curl http://localhost:8888/v1/models
```

### 🔧 Environment Variables


| Variable         | Default                    | Description                                               |
| ---------------- | -------------------------- | --------------------------------------------------------- |
| `LLM_API_KEY`    | —                          | DeepSeek API key                                          |
| `MODEL_NAME`     | `deepseek-v4-flash`        | Model name to use                                         |
| `MODEL_BASE_URL` | `https://api.deepseek.com` | API base URL                                              |
| `API_PORT`       | `8888`                     | Service listening port                                    |


---

## 🧩 Agent Definition

The platform core is fully decoupled from business logic. The deployed agent is defined declaratively in `agents/`:

```
agents/
├── manifest.yaml    # Agent manifest: orchestrator, subagents, tools, skills
├── skills/          # Skill instructions (SKILL.md) + scripts for each agent
└── tools/           # Agent-specific tool factories (index.ts)
```

To deploy a different agent, replace the contents of `agents/` and restart — no code or env changes required.

The default `agents/` directory ships with an AI Calculator demo. Use it as a reference, or just ask me 😄

---

## 🔌 API

### Endpoints Overview


| Endpoint                                 | Description                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /health`                            | Health check                                                                 |
| `GET /v1/models`                         | List available models                                                        |
| `POST /v1/chat/completions`              | Chat completion (SSE streaming), supports automatic recovery on interruption |
| `GET /v1/sessions/:sessionId/live/:path` | Get session image (MJPEG live stream + static PNG)                           |
| `GET /v1/fs/list?path=...&dirs_only=...` | File system browser (for frontend file picker)                               |


### Example Calls

#### Health Check

```bash
curl http://localhost:8888/health
```

Response:

```json
{
  "status": "healthy",
  "service": "<agent display_name>",
  "version": "v1.0",
  "active_streams": 0
}
```

#### List Models

```bash
curl http://localhost:8888/v1/models
```

Response:

```json
{
  "object": "list",
  "data": [
    {
      "id": "<agent model_id>",
      "object": "model",
      "created": 1700000000,
      "owned_by": "Open Agent Platform"
    }
  ]
}
```

> The model ID is determined by the `model_id` field in `agents/manifest.yaml`. For example, the default AI Calculator agent returns `calculator`.

---

## 📦 Project Structure

```
├── src/             # Platform core code
│   ├── web_server.ts   # Fastify entry point, SSE streaming
│   ├── config.ts       # Configuration management
│   ├── agents/         # Agent runtime (runner, SSE formatting)
│   ├── core/           # Core framework (Agent factory, manifest loading, session management, HITL tools)
│   ├── infra/          # Infrastructure (SSE stream management, LangGraph checkpoints)
│   └── openwebui/      # OpenWebUI integration (metadata forwarding filter)
│
├── agents/          # Agent definition (manifest + skills + tools)
│
├── frontend/        # Frontend components (nginx-injected into OpenWebUI)
├── nginx/           # Reverse proxy configuration
├── .env.example     # Environment variable template
└── package.json
```

---

## 🛠 Tech Stack

- **Agent Framework**: deepagents (based on LangGraph)
- **LLM**: DeepSeek V4, accessed via `langchain_openai.ChatOpenAI`, default model `deepseek-v4-flash`
- **Web Server**: Fastify (TypeScript)
- **Streaming**: SSE (Server-Sent Events) + MJPEG (real-time image stream)
- **Runtime**: Node.js 22+
- **HITL**: `interrupt()` / `Command(resume=...)` pattern

---

## 💻 OpenWebUI Integration

This platform deeply integrates with OpenWebUI, providing **HITL interactive cards**, **file path picker**, **dynamic image rendering**, **session management**, and more. Through nginx, it proxies both the OpenWebUI frontend and the platform backend under a unified endpoint, injecting frontend JS to render HITL code blocks as interactive components.

> 📖 For complete deployment steps (conda environment, nginx configuration, filter plugin installation), see **[docs/openwebui-integration.md](docs/openwebui-integration.md)**

---

## 📄 License

MIT