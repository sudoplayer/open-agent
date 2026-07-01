<p align="right">
  <a href="./openwebui-integration.cn.md">中文</a>
  ·
  <a href="./openwebui-integration.md">English</a>
</p>

# 💻 接入 OpenWebUI（完整部署指南）

本平台与 OpenWebUI 深度集成，提供以下能力：

- **HITL 交互卡片** — 将 `ask-user-question` 代码块渲染为可点击的选项按钮
- **文件路径选择器** — 将 `request-file-path` 代码块渲染为文件系统浏览组件
- **动态图片渲染** — 支持 MJPEG 实时流和静态 PNG 内嵌展示
- **会话管理** — OpenWebUI 在 `ENABLE_FORWARD_USER_INFO_HEADERS=true` 时通过 HTTP 头（`x-openwebui-user-name`、`x-openwebui-chat-id`）将注册显示名与 `chat_id` 转发到后端，实现跨轮次上下文保持。runs 与 memory 按用户分目录，存放在用户主目录下：`~/agent_artifacts/runs/{userId}/{chatId}/`、`~/agent_artifacts/memory/{userId}/`（与平台安装目录隔离）。工作流完成后，用户可在同一 chat 中发送 follow-up 消息，在已有 artifacts 基础上继续；若工作流仍在执行中，后端会提示等待。

---

## 部署架构

```
浏览器 → nginx (:3066) → OpenWebUI (:3088)
              │              ↑
              │ 注入 JS      │ /api/*, /*
              │ 代理 API     │
              └──────────────┤
                     ↓
              本平台后端 (:8888)
              /v1/fs/* (文件浏览)
```

nginx 作为统一入口，负责：

1. **反向代理** — OpenWebUI 页面 (`/`) 和 API (`/api/`) 转发到 OpenWebUI；文件系统 API (`/v1/fs/`) 转发到本平台后端
2. **注入前端 JS** — 通过 `sub_filter` 在 `<head>` 中注入 `ask_question.js` 和 `request_file_path.js`，将 HITL 代码块渲染为交互组件

---

## 部署步骤

### 1. 安装 OpenWebUI（conda）

Linux 与 Windows 均通过 conda 安装 OpenWebUI，conda 环境名统一为 `open-webui`：

```bash
conda create -n open-webui python=3.11 -y
conda activate open-webui
pip install uv
uv pip install open-webui==0.9.6
```

| 平台 | 启动脚本 |
|------|----------|
| Linux | `start_frontend.sh` |
| Windows | `start_frontend.bat` / `start_frontend.ps1` |

### 2. 安装 nginx

#### Linux（conda）

```bash
conda create -n nginx python=3.11 -y
conda activate nginx
conda install -c conda-forge nginx -y
```

创建 nginx 所需的运行时目录：

```bash
mkdir -p ~/.nginx/{logs,tmp/{client,proxy,fastcgi,uwsgi,scgi}}
```

#### Windows（独立安装）

Windows 启动脚本使用**独立安装的 nginx**。从 [nginx.org](https://nginx.org/en/download.html) 下载 Windows 版并解压，例如 `D:\Software\nginx`。

启动前编辑 `start_frontend.ps1` 顶部的路径配置：

| 变量 | 说明 |
|------|------|
| `$CONDA_BASE` | Miniconda / Anaconda 安装目录（如 `D:\miniconda3`） |
| `$NGINX_HOME` | nginx 解压目录（需含 `nginx.exe` 与 `conf\mime.types`） |

运行时目录（`%USERPROFILE%\.nginx`）由脚本自动创建，无需手动 mkdir。

### 3. 配置 nginx

`nginx/nginx.conf` 由 `nginx/nginx.conf.template` 在运行时生成。**无需手改 nginx.conf 中的路径**，运行对应平台的启动脚本即可。脚本会替换 `REPO_DIR`、`NGINX_RUNTIME_DIR`、`NGINX_MIME_TYPES`，校验配置并启动或重载 nginx。若 3066 端口已在监听，会自动 reload，使前端 JS 路径与本仓库保持同步。

**Linux：**

```bash
./start_frontend.sh
```

**Windows：**

```powershell
.\start_frontend.bat
# 或
.\start_frontend.ps1
```

端口默认配置（可在 `start_frontend.sh` / `start_frontend.ps1` / `nginx/nginx.conf.template` 中修改）：

| 组件 | 端口 |
|------|------|
| nginx 监听 | `3066` |
| OpenWebUI 上游 | `3088` |
| 本平台后端 | `8888` |

### 4. 启用会话身份 HTTP 头

OpenWebUI 可通过 HTTP 头将会话身份转发到后端。启动脚本（`start_frontend.sh` / `start_frontend.ps1`）在启动 OpenWebUI 时会自动设置 `ENABLE_FORWARD_USER_INFO_HEADERS=true`。

若 OpenWebUI 已在未设置该变量的情况下运行，需先停止现有进程，再带上该环境变量重启，或重新运行启动脚本。

后端从请求头 `x-openwebui-user-name`（注册显示名）、`x-openwebui-chat-id` 读取会话身份，用于跨轮次保持上下文。会话工件存放在 `~/agent_artifacts/runs/{userId}/{chatId}/`，用户记忆在 `~/agent_artifacts/memory/{userId}/`。多轮行为：HITL 中断在同一 chat 内 resume；工作流完成后可发送 follow-up 在已有 artifacts 上续作；若本轮仍在执行中，并发消息会收到等待提示。

### 5. 启动服务

**Linux：**

```bash
# 1. 启动本平台后端
npm start

# 2. 启动 OpenWebUI + nginx
./start_frontend.sh
```

**Windows：**

```powershell
# 1. 启动本平台后端
npm start

# 2. 启动 OpenWebUI + nginx
.\start_frontend.bat
```

---

## 配置 OpenWebUI

1. 浏览器打开 `http://YOUR_SERVER_IP:3066`
2. 进入 **Admin Panel → Settings → Connections**
3. 在 **OpenAI API** 连接中，将 API 地址设为：
   ```
   http://YOUR_SERVER_IP:8888/v1
   ```
   API Key 可任意填写（本平台不校验上游 Key）。

若 OpenWebUI 未设置 `ENABLE_FORWARD_USER_INFO_HEADERS=true`，后端会因缺少 `x-openwebui-user-name` / `x-openwebui-chat-id` 请求头而拒绝请求。

---

## 验证集成

```bash
# 1. 确认 nginx 已注入 JS
curl -s http://YOUR_SERVER_IP:3066 | grep ask_question.js
curl -s http://YOUR_SERVER_IP:3066 | grep request_file_path.js

# 2. 在浏览器中 F12 → Console，输入：
window.__ASK_QUESTION_JS_VERSION
# 应输出 "1.0.0"
window.__REQUEST_FILE_PATH_JS_VERSION
# 应输出 "1.0.0"

# 3. 发起对话，触发 HITL 流程 — 选项卡片与文件选择器应正常渲染；
#    点击选项后应自动提交用户消息。

# 4. 在 Network 中查看 POST .../v1/chat/completions，请求头应含 x-openwebui-user-name、x-openwebui-chat-id。
```

---

## 日常运维

修改 `frontend/` 下的 JS 或 `nginx/nginx.conf.template` 后，重新运行启动脚本即可重载 nginx（3066 已在监听时会自动 reload）：

```bash
# Linux
./start_frontend.sh
```

```powershell
# Windows
.\start_frontend.bat
```
