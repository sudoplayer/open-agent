#!/usr/bin/env bash
set -euo pipefail

# ── Config ───────────────────────────────────────────────
NGINX_PORT=3066
OPENWEBUI_PORT=3088
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONDA_BASE="$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")"
NGINX_RUNTIME_DIR="$HOME/.nginx"
NGINX_TEMPLATE="$REPO_DIR/nginx/nginx.conf.template"
NGINX_CONF="$REPO_DIR/nginx/nginx.conf"
NGINX_BIN="$CONDA_BASE/envs/nginx/sbin/nginx"
NGINX_PREFIX="$CONDA_BASE/envs/nginx"

render_nginx_conf() {
    export REPO_DIR CONDA_BASE NGINX_RUNTIME_DIR
    envsubst '${REPO_DIR} ${CONDA_BASE} ${NGINX_RUNTIME_DIR}' \
        < "$NGINX_TEMPLATE" > "$NGINX_CONF"
}

nginx_cmd() {
    "$NGINX_BIN" -p "$NGINX_PREFIX" "$@"
}

# ── Ensure nginx runtime directories ────────────────────
mkdir -p "$NGINX_RUNTIME_DIR"/{logs,tmp/{client,proxy,fastcgi,uwsgi,scgi}}

# ── Start OpenWebUI ─────────────────────────────────────
echo "==> Checking OpenWebUI on port $OPENWEBUI_PORT ..."
if ss -tlnp 2>/dev/null | grep -q ":$OPENWEBUI_PORT " || netstat -tlnp 2>/dev/null | grep -q ":$OPENWEBUI_PORT "; then
    echo "    OpenWebUI already running."
else
    echo "    Starting OpenWebUI ..."
    # Source conda and activate the openwebui env
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    conda activate openwebui
    DATA_DIR=~/.open-webui-latest HF_HUB_OFFLINE=1 open-webui serve --host 0.0.0.0 --port "$OPENWEBUI_PORT" &
    echo "    OpenWebUI started (PID $!)."
fi

# ── Start / reload nginx ────────────────────────────────
echo "==> Configuring nginx on port $NGINX_PORT ..."
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate nginx
render_nginx_conf
nginx_cmd -t -c "$NGINX_CONF"

if ss -tlnp 2>/dev/null | grep -q ":$NGINX_PORT " || netstat -tlnp 2>/dev/null | grep -q ":$NGINX_PORT "; then
    echo "    Reloading nginx (paths refreshed from this repo) ..."
    nginx_cmd -s reload -c "$NGINX_CONF"
else
    echo "    Starting nginx ..."
    nginx_cmd -c "$NGINX_CONF"
    echo "    nginx started."
fi

# ── Summary ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OpenWebUI  → http://0.0.0.0:$NGINX_PORT"
echo "  Backend    → http://0.0.0.0:8888   (start with: npm start)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
