[中文](./openwebui-integration.cn.md) · [English](./openwebui-integration.md)

# 💻 OpenWebUI Integration (Complete Deployment Guide)

This platform deeply integrates with OpenWebUI, providing the following capabilities:

- **HITL Interactive Cards** — Renders `ask-user-question` code blocks as clickable option buttons
- **File Path Picker** — Renders `request-file-path` code blocks as a file system browser component
- **Dynamic Image Rendering** — Supports MJPEG live streams and embedded static PNG display
- **Session Management** — OpenWebUI forwards the user's display name and `chat_id` via HTTP headers (`x-openwebui-user-name`, `x-openwebui-chat-id`) when `ENABLE_FORWARD_USER_INFO_HEADERS=true`, enabling cross-turn context preservation. Runs and memory are stored per user under `~/agent_artifacts/runs/{userId}/{chatId}/` and `~/agent_artifacts/memory/{userId}/` (outside the platform install directory). After a workflow completes, users can send follow-up messages in the same chat to continue on existing artifacts; if a workflow is still running, the backend prompts the user to wait.

---

## Deployment Architecture

```
Browser → nginx (:3066) → OpenWebUI (:3088)
              │              ↑
              │ Inject JS    │ /api/*, /*
              │ Proxy API    │
              └──────────────┤
                     ↓
               Platform Backend (:8888)
              /v1/fs/* (file browser)
```

nginx serves as the unified entry point, responsible for:

1. **Reverse Proxy** — OpenWebUI pages (`/`) and APIs (`/api/`) are forwarded to OpenWebUI; file system APIs (`/v1/fs/`) are forwarded to the platform backend
2. **Frontend JS Injection** — Uses `sub_filter` to inject `ask_question.js` and `request_file_path.js` into `<head>`, rendering HITL code blocks as interactive components

---

## Deployment Steps

### 1. Install OpenWebUI (conda)

Install OpenWebUI via conda on both Linux and Windows. The conda environment name is `open-webui` on all platforms:

```bash
conda create -n open-webui python=3.11 -y
conda activate open-webui
pip install uv
uv pip install open-webui==0.9.6
```

| Platform | Startup script |
| -------- | -------------- |
| Linux | `start_frontend.sh` |
| Windows | `start_frontend.bat` / `start_frontend.ps1` |

### 2. Install nginx

#### Linux (conda)

```bash
conda create -n nginx python=3.11 -y
conda activate nginx
conda install -c conda-forge nginx -y
```

Create the required nginx runtime directories:

```bash
mkdir -p ~/.nginx/{logs,tmp/{client,proxy,fastcgi,uwsgi,scgi}}
```

#### Windows (standalone)

The Windows startup script uses a **standalone nginx install**. Download the Windows build from [nginx.org](https://nginx.org/en/download.html) and extract it, e.g. to `D:\Software\nginx`.

Before first run, edit the path variables at the top of `start_frontend.ps1`:

| Variable | Description |
| -------- | ----------- |
| `$CONDA_BASE` | Miniconda / Anaconda install dir (e.g. `D:\miniconda3`) |
| `$NGINX_HOME` | nginx extract dir (must contain `nginx.exe` and `conf\mime.types`) |

The script creates runtime dirs under `%USERPROFILE%\.nginx` automatically.

### 3. Configure nginx

`nginx/nginx.conf` is generated from `nginx/nginx.conf.template` at runtime. **Do not edit paths in nginx.conf by hand** — run the platform startup script. It substitutes `REPO_DIR`, `NGINX_RUNTIME_DIR`, and `NGINX_MIME_TYPES`, validates the config, and starts or reloads nginx. If port 3066 is already in use, it reloads so frontend JS paths stay in sync with this repo.

**Linux:**

```bash
./start_frontend.sh
```

**Windows:**

```powershell
.\start_frontend.bat
# or
.\start_frontend.ps1
```

Default port configuration (modifiable in `start_frontend.sh` / `start_frontend.ps1` / `nginx/nginx.conf.template`):


| Component          | Port   |
| ------------------ | ------ |
| nginx listen       | `3066` |
| OpenWebUI upstream | `3088` |
| Platform backend   | `8888` |


### 4. Enable Session Identity Headers

OpenWebUI can forward session identity to the backend via HTTP headers. The startup scripts (`start_frontend.sh` / `start_frontend.ps1`) set `ENABLE_FORWARD_USER_INFO_HEADERS=true` automatically when starting OpenWebUI.

If OpenWebUI is already running without this variable, restart it with the env var set, or re-run the startup script after stopping the existing process.

The backend reads `x-openwebui-user-name` (registration display name) and `x-openwebui-chat-id` from incoming request headers to maintain session context across turns. Session artifacts are stored at `~/agent_artifacts/runs/{userId}/{chatId}/`; user memory at `~/agent_artifacts/memory/{userId}/`. Multi-turn behavior: HITL interrupts resume via the same chat; after a workflow finishes, follow-up messages start a new turn on existing artifacts; concurrent messages while a turn is in progress receive a wait prompt.

### 5. Start Services

**Linux:**

```bash
# 1. Start the platform backend
npm start

# 2. Start OpenWebUI + nginx
./start_frontend.sh
```

**Windows:**

```powershell
# 1. Start the platform backend
npm start

# 2. Start OpenWebUI + nginx
.\start_frontend.bat
```

---

## Configure OpenWebUI

1. Open your browser at `http://YOUR_SERVER_IP:3066`
2. Go to **Admin Panel → Settings → Connections**
3. In the **OpenAI API** connection, set the API URL to:
   ```
   http://YOUR_SERVER_IP:8888/v1
   ```
   The API Key can be anything (the platform does not validate upstream keys).

Without `ENABLE_FORWARD_USER_INFO_HEADERS=true` on OpenWebUI, the backend will reject requests missing the `x-openwebui-user-name` / `x-openwebui-chat-id` headers.

---

## Verify Integration

```bash
# 1. Confirm nginx injected the JS
curl -s http://YOUR_SERVER_IP:3066 | grep ask_question.js
curl -s http://YOUR_SERVER_IP:3066 | grep request_file_path.js

# 2. In browser F12 → Console, type:
window.__ASK_QUESTION_JS_VERSION
# Should output "1.0.0"
window.__REQUEST_FILE_PATH_JS_VERSION
# Should output "1.0.0"

# 3. Start a conversation, trigger the HITL flow — option cards and the file picker should render;
#    clicking a choice should submit a user message automatically.

# 4. In Network tab, inspect POST to .../v1/chat/completions — request headers should include x-openwebui-user-name and x-openwebui-chat-id.
```

---

## Daily Operations

After changing JS under `frontend/` or `nginx/nginx.conf.template`, re-run the startup script to reload nginx (auto-reloads if port 3066 is already listening):

```bash
# Linux
./start_frontend.sh
```

```powershell
# Windows
.\start_frontend.bat
```
