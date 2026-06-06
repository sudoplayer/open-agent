# 🤖 Open Agent Platform

> 用自然语言描述你的目标，AI 智能体集群自动完成剩下的工作。

---

## ✨ 这是什么？

这是一个 **LLM 驱动的智能体编排平台**。你只需用自然语言描述你的目标，系统会自动：

1. 🧠 **理解意图** — 识别你的需求
2. 🔀 **任务分解** — 按领域流程拆解步骤
3. 👷 **多智能体协作** — 主编排智能体（Orchestrator）调度专业子智能体（Subagents）分别执行
4. 💬 **人机协作** — 关键节点弹出交互卡片，等你确认后继续

整个流程模拟了 AI 多智能体协作与人机交互（HITL）工作模式。

### 📖 一个具体示例

当你发送 `"(1+2)/3*4"`，系统内部会发生以下步骤：

1. **Orchestrator 解析意图** — 识别为混合运算表达式，含括号和加减乘除
2. **按优先级归约** — 依次委派子智能体，逐步归约直至单一结果：
  - `add_agent` 计算 `1+2=3`，表达式归约为 `3/3*4`
  - `divide_agent` 计算 `3/3=1`，表达式归约为 `1*4`
  - `multiply_agent` 计算 `1*4=4`
3. **人机确认（HITL）** — 每个子步骤弹出选项卡片，等你确认中间结果
4. **返回最终结果** — `4`

整个过程中 SSE 流式输出实时展示 Orchestrator 的思考过程和子智能体的执行进度。

---

## 🎯 它能做什么？

平台本身是**场景无关的** — 通过 **Scenario System** 接入不同领域：


| 场景          | 描述                                   |
| ----------- | ------------------------------------ |
| 📋 **Demo** | AI 计算器 — 演示多智能体编排与人机协作的最小验证场景        |
| 📊 **数据分析** | 委派子智能体读取文件、执行分析、生成图表                 |
| 🔍 **代码审查** | Orchestrator 拆解 PR，子智能体分别审查不同维度      |
| 🔧 **你的场景** | 编写 `manifest.yaml` + skills，即可接入任意领域 |


---

## 🚀 快速开始

### 前置条件

- **Node.js 22+**
- **DeepSeek API Key**（或其他 OpenAI 兼容 API）

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 LLM_API_KEY 和 SCENARIO

# 3. 启动服务
npm start
```

服务启动在 `http://localhost:8888`，提供 OpenAI 兼容 API。

### 验证服务

```bash
# 健康检查
curl http://localhost:8888/health

# 查看模型列表
curl http://localhost:8888/v1/models
```

### 🔧 环境变量说明


| 变量               | 默认值                        | 说明                             |
| ---------------- | -------------------------- | ------------------------------ |
| `LLM_API_KEY`    | —                          | DeepSeek / OpenAI 兼容 API 密钥    |
| `MODEL_NAME`     | `deepseek-v4-flash`        | 使用的模型名称                        |
| `MODEL_BASE_URL` | `https://api.deepseek.com` | API 地址（可切换其他兼容服务）              |
| `SCENARIO`       | `demo`                     | 加载的场景名称，对应 `scenarios/<name>/` |
| `API_PORT`       | `8888`                     | 服务监听端口                         |


---

## 🧩 场景系统（Scenario System）

平台核心与业务逻辑完全分离。每个场景是一个独立目录，声明式定义一切：

```
scenarios/<你的场景>/
├── manifest.yaml    # 场景清单：智能体、工具、技能
├── config.yaml      # 场景特定配置
├── skills/          # 各智能体的技能指令（SKILL.md）+ 脚本
├── tools/           # 场景专属工具工厂（index.ts）
```

切换场景只需设置环境变量 `SCENARIO=<name>`，零代码修改。

想开发新场景？参考 `scenarios/demo/` 起步，或直接问我 😄

---

## 🔌 API

### 端点一览


| 端点                                       | 说明                         |
| ---------------------------------------- | -------------------------- |
| `GET /health`                            | 健康检查                       |
| `GET /v1/models`                         | 获取可用模型列表                   |
| `POST /v1/chat/completions`              | 对话（SSE 流式），支持中断自动恢复        |
| `GET /v1/sessions/:sessionId/live/:path` | 获取会话图片（MJPEG 实时流 + 静态 PNG） |
| `GET /v1/fs/list?path=...&dirs_only=...` | 文件系统浏览（供前端文件选择器使用）         |


### 调用示例

#### 健康检查

```bash
curl http://localhost:8888/health
```

响应：

```json
{
  "status": "healthy",
  "service": "<场景 display_name>",
  "version": "v1.0",
  "active_streams": 0
}
```

#### 查看模型列表

```bash
curl http://localhost:8888/v1/models
```

响应：

```json
{
  "object": "list",
  "data": [
    {
      "id": "<场景 model_id>",
      "object": "model",
      "created": 1700000000,
      "owned_by": "Open Agent Platform"
    }
  ]
}
```

> 模型 ID 由当前加载的场景的 `manifest.yaml` 中的 `model_id` 决定。例如 Demo 场景返回 `calculator-demo`。

---

## 📦 项目结构

```
├── src/             # 平台核心代码
│   ├── web_server.ts   # Fastify 入口，SSE 流式输出
│   ├── config.ts       # 配置管理
│   ├── agents/         # 智能体运行（runner、SSE 格式化）
│   ├── core/           # 核心框架（Agent 工厂、清单加载、会话管理、HITL 工具）
│   ├── infra/          # 基础设施（SSE 流管理、LangGraph 检查点）
│   └── openwebui/      # OpenWebUI 集成（元数据转发 filter）
│
├── scenarios/       # 业务场景（按领域隔离）
│   └── demo/           # AI 计算器 — manifest + skills + tools
│
├── frontend/        # 前端组件（nginx 注入到 OpenWebUI）
├── nginx/           # 反向代理配置
├── .env.example     # 环境变量模板
└── package.json
```

---

## 🛠 技术栈

- **Agent 框架**：deepagents（基于 LangGraph）
- **LLM**：DeepSeek V4（OpenAI 兼容 API），通过 `langchain_openai.ChatOpenAI` 接入，默认模型 `deepseek-v4-flash`
- **Web 服务**：Fastify（TypeScript）
- **流式输出**：SSE（Server-Sent Events）+ MJPEG（实时图片流）
- **运行时**：Node.js 22+
- **HITL**：`interrupt()` / `Command(resume=...)` 模式

---

## 💻 接入 OpenWebUI

本平台与 OpenWebUI 深度集成，提供 **HITL 交互卡片**、**文件路径选择器**、**动态图片渲染**、**会话管理**等能力。通过 nginx 将 OpenWebUI 页面和本平台后端统一代理，并注入前端 JS 将 HITL 代码块渲染为可交互组件。

> 📖 完整部署步骤（conda 环境、nginx 配置、filter 插件安装）见 **[docs/openwebui-integration.md](docs/openwebui-integration.md)**

---

## 📄 许可

MIT