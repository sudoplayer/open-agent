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
- **会话管理** — 通过 `forward_metadata_filter.py` 将 OpenWebUI 的 `user_id` / `chat_id` 转发到后端，实现跨轮次上下文保持

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

```bash
conda create -n openwebui python=3.11 -y
conda activate openwebui
pip install uv
uv pip install open-webui==0.6.18
```

### 2. 安装 nginx（conda）

```bash
conda create -n nginx python=3.11 -y
conda activate nginx
conda install -c conda-forge nginx -y
```

创建 nginx 所需的运行时目录：

```bash
mkdir -p ~/.nginx/{logs,tmp/{client,proxy,fastcgi,uwsgi,scgi}}
```

### 3. 配置 nginx

编辑 `nginx/nginx.conf`，将其中硬编码的路径替换为实际路径：

- `error_log` / `pid` / `client_body_temp_path` 等 → 指向 `~/.nginx/`
- `include .../mime.types` → 指向 conda 环境中 nginx 的 mime.types 路径
- `alias .../frontend/ask_question.js` 等 → 指向本 repo 的 `frontend/` 目录

端口默认配置（可按需修改）：

| 组件 | 端口 |
|------|------|
| nginx 监听 | `3066` |
| OpenWebUI 上游 | `3088` |
| 本平台后端 | `8888` |

### 4. 安装 OpenWebUI Filter 插件

将 `src/openwebui/forward_metadata_filter.py` 复制到 OpenWebUI 的 filter 函数库，使其在请求中将 metadata 中的 `user_id` / `chat_id` 注入请求体。

### 5. 启动服务

```bash
# 1. 启动本平台后端
npm start

# 2. 启动 OpenWebUI
conda activate openwebui
DATA_DIR=~/.open-webui HF_HUB_OFFLINE=1 open-webui serve --host 0.0.0.0 --port 3088

# 3. 启动 nginx
conda activate nginx
nginx -c /path/to/open-agent/nginx/nginx.conf
```

---

## 配置 OpenWebUI

1. 浏览器打开 `http://YOUR_SERVER_IP:3066`
2. 进入 OpenWebUI 管理后台 → Settings → Connections
3. 在 **OpenAI API** 连接中，将 API 地址设为：
   ```
   http://YOUR_SERVER_IP:8888/v1
   ```
   API Key 可任意填写（本平台不校验上游 Key）。
4. 在 Functions 中启用 "Forward Metadata" filter，确保会话上下文正确传递。

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

# 3. 发起对话，触发 HITL 流程，选项卡片应正常渲染
```

---

## 日常运维

```bash
# 修改 nginx 配置后重载
conda activate nginx
nginx -s reload -c /path/to/open-agent/nginx/nginx.conf
```
