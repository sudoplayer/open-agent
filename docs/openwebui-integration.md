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
uv pip install open-webui==0.9.6
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

`nginx/nginx.conf` is generated from `nginx/nginx.conf.template` at runtime. **Do not edit paths by hand** — run:

```bash
./start_frontend.sh
```

The script substitutes `REPO_DIR`, `CONDA_BASE`, and `NGINX_RUNTIME_DIR`, validates the config, and starts or reloads nginx. If nginx is already listening on port 3066, it reloads so frontend JS paths stay in sync with this repo.

Default port configuration (modifiable in `start_frontend.sh` / `nginx/nginx.conf.template`):


| Component          | Port   |
| ------------------ | ------ |
| nginx listen       | `3066` |
| OpenWebUI upstream | `3088` |
| Platform backend   | `8888` |


### 4. Install OpenWebUI Filter Plugin

1. In Open WebUI, go to **Admin → Functions**.
2. Create a new **Filter** and paste the contents of `src/openwebui/forward_metadata_filter.py`.
3. Save and enable the filter globally if prompted.

The filter's `inlet` hook copies `user_id` and `chat_id` from request `metadata` into the top-level request body so the platform backend can maintain session context across turns.

### 5. Start Services

```bash
# 1. Start the platform backend
npm start

# 2. Start OpenWebUI + nginx
./start_frontend.sh
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
4. Attach the **Forward Metadata** filter to the model you use for this platform
Without the filter enabled on the model, the backend will reject requests missing `user_id` / `chat_id`.

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

# 4. In Network tab, inspect POST to .../v1/chat/completions — body should include user_id and chat_id.
```

---

## Daily Operations

```bash
# After changing frontend JS or nginx template, reload nginx via the helper script:
./start_frontend.sh
```
