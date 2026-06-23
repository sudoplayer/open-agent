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
uv pip install open-webui==0.9.6
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

`nginx/nginx.conf` 由 `nginx/nginx.conf.template` 在运行时生成。**无需手改路径**，执行：

```bash
./start_frontend.sh
```

脚本会替换 `REPO_DIR`、`CONDA_BASE`、`NGINX_RUNTIME_DIR`，校验配置并启动或重载 nginx。若 3066 端口已在监听，会自动 reload，使前端 JS 路径与本仓库保持同步。

端口默认配置（可在 `start_frontend.sh` / `nginx/nginx.conf.template` 中修改）：

| 组件 | 端口 |
|------|------|
| nginx 监听 | `3066` |
| OpenWebUI 上游 | `3088` |
| 本平台后端 | `8888` |

### 4. 安装 OpenWebUI Filter 插件

1. 在 Open WebUI 中进入 **Admin → Functions**。
2. 新建 **Filter**，粘贴 `src/openwebui/forward_metadata_filter.py` 的内容。
3. 保存并按提示全局启用。

Filter 的 `inlet` 会将请求 `metadata` 中的 `user_id`、`chat_id` 写入请求体顶层，供本平台后端跨轮次保持会话。

### 5. 启动服务

```bash
# 1. 启动本平台后端
npm start

# 2. 启动 OpenWebUI + nginx
./start_frontend.sh
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
4. 将 **Forward Metadata** filter 挂到实际使用的模型上
若模型未启用该 filter，后端会因缺少 `user_id` / `chat_id` 而拒绝请求。

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

# 4. 在 Network 中查看 POST .../v1/chat/completions，请求体应含 user_id、chat_id。
```

---

## 日常运维

```bash
# 修改前端 JS 或 nginx 模板后，通过脚本重载：
./start_frontend.sh
```
