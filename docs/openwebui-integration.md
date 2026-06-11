[中文](./openwebui-integration.cn.md) · [English](./openwebui-integration.md)

# 💻 OpenWebUI Integration (Complete Deployment Guide)

This platform deeply integrates with OpenWebUI, providing the following capabilities:

- **HITL Interactive Cards** — Renders `ask-user-question` code blocks as clickable option buttons
- **File Path Picker** — Renders `request-file-path` code blocks as a file system browser component
- **Dynamic Image Rendering** — Supports MJPEG live streams and embedded static PNG display
- **Session Management** — Forwards OpenWebUI's `user_id` / `chat_id` to the backend via `forward_metadata_filter.py`, enabling cross-turn context preservation

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

```bash
conda create -n openwebui python=3.11 -y
conda activate openwebui
pip install uv
uv pip install open-webui==0.6.18
```

### 2. Install nginx (conda)

```bash
conda create -n nginx python=3.11 -y
conda activate nginx
conda install -c conda-forge nginx -y
```

Create the required nginx runtime directories:

```bash
mkdir -p ~/.nginx/{logs,tmp/{client,proxy,fastcgi,uwsgi,scgi}}
```

### 3. Configure nginx

Edit `nginx/nginx.conf`, replacing hardcoded paths with your actual paths:

- `error_log` / `pid` / `client_body_temp_path`, etc. → point to `~/.nginx/`
- `include .../mime.types` → point to the mime.types path in your conda nginx environment
- `alias .../frontend/ask_question.js`, etc. → point to this repo's `frontend/` directory

Default port configuration (modifiable as needed):


| Component          | Port   |
| ------------------ | ------ |
| nginx listen       | `3066` |
| OpenWebUI upstream | `3088` |
| Platform backend   | `8888` |


### 4. Install OpenWebUI Filter Plugin

Copy `src/openwebui/forward_metadata_filter.py` to OpenWebUI's filter function library, so it injects `user_id` / `chat_id` from metadata into the request body.

### 5. Start Services

```bash
# 1. Start the platform backend
npm start

# 2. Start OpenWebUI
conda activate openwebui
DATA_DIR=~/.open-webui HF_HUB_OFFLINE=1 open-webui serve --host 0.0.0.0 --port 3088

# 3. Start nginx
conda activate nginx
nginx -c /path/to/open-agent/nginx/nginx.conf
```

---

## Configure OpenWebUI

1. Open your browser at `http://YOUR_SERVER_IP:3066`
2. Go to OpenWebUI Admin Panel → Settings → Connections
3. In the **OpenAI API** connection, set the API URL to:
  ```
   http://YOUR_SERVER_IP:8888/v1
  ```
   The API Key can be anything (the platform does not validate upstream keys).
4. Enable the "Forward Metadata" filter in Functions to ensure correct session context passing.

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

# 3. Start a conversation, trigger the HITL flow, and the option cards should render correctly
```

---

## Daily Operations

```bash
# Reload nginx after configuration changes
conda activate nginx
nginx -s reload -c /path/to/open-agent/nginx/nginx.conf
```

