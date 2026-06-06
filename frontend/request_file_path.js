(function () {
  "use strict";

  // Open WebUI DOM selectors — update if Open WebUI changes markup
  const CHAT_ROOT_SELECTOR = "#messages-container";
  const ASSISTANT_SELECTOR = ".chat-assistant";
  const USER_SELECTOR = ".chat-user";
  const BLOCK_SELECTOR = ".language-request-file-path";
  const CODE_CONTAINER_SELECTOR = ".relative.my-2";

  window.__REQUEST_FILE_PATH_JS_VERSION = "1.0.0";
  window.__scanRequestFilePath = function () {
    console.warn("[request-file-path] scan called before init finished");
  };

  const PROCESSED_ATTR = "data-rfp-processed";
  const WIDGET_CLASS = "request-file-path-widget";
  const READONLY_CLASS = "request-file-path-readonly";
  const WIDGET_SESSION_ATTR = "data-rfp-session";
  const WIDGET_REQUEST_ATTR = "data-rfp-id";
  const RESOLVED_REQUEST_ATTR = "data-rfp-request-id";
  const RESOLVED_ATTR = "data-rfp-resolved";
  const SCAN_DEBOUNCE_MS = 150;
  const FALLBACK_SCAN_MS = 800;

  function escapeSelectorValue(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function isConnected(el) {
    return !!(el && el.isConnected);
  }

  function getChatRoot() {
    return document.querySelector(CHAT_ROOT_SELECTOR);
  }

  function queryInScope(selector, scope) {
    return scope ? [...scope.querySelectorAll(selector)] : [];
  }

  function findInScope(selector, scope) {
    const root = scope || getChatRoot();
    if (!root) return null;
    const el = root.querySelector(selector);
    return el && el.isConnected ? el : null;
  }

  function extractJsonText(raw) {
    const trimmed = raw.trim();
    const fromBrace = trimmed.indexOf("{");
    return fromBrace >= 0 ? trimmed.slice(fromBrace) : trimmed;
  }

  function parsePayload(block) {
    const raw = block.textContent || "";
    if (!raw.includes('"request"') || !raw.includes('"session_id"')) return null;
    try {
      const data = JSON.parse(extractJsonText(raw));
      if (
        !data ||
        typeof data.request !== "string" ||
        typeof data.session_id !== "string" ||
        typeof data.request_id !== "string"
      ) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function findCodeBlockContainer(block) {
    return block.closest(CODE_CONTAINER_SELECTOR);
  }

  function hideCodeBlock(block) {
    const container = findCodeBlockContainer(block);
    if (!container) return null;
    container.style.display = "none";
    return container;
  }

  function findExistingWidget(requestId, chatRoot) {
    const safeId = escapeSelectorValue(requestId);
    return findInScope(`.${WIDGET_CLASS}[${WIDGET_REQUEST_ATTR}="${safeId}"]`, chatRoot);
  }

  function findExistingReadonlyCard(requestId, chatRoot) {
    const safeId = escapeSelectorValue(requestId);
    return findInScope(`.${READONLY_CLASS}[${RESOLVED_REQUEST_ATTR}="${safeId}"]`, chatRoot);
  }

  function isRequestResolvedLive(requestId, chatRoot) {
    const safeId = escapeSelectorValue(requestId);
    return !!findInScope(
      `[${RESOLVED_ATTR}="true"][${RESOLVED_REQUEST_ATTR}="${safeId}"]`,
      chatRoot
    );
  }

  function markRequestResolved(block, requestId) {
    hideCodeBlock(block);
    const container = findCodeBlockContainer(block);
    if (container) {
      container.setAttribute(RESOLVED_ATTR, "true");
      container.setAttribute(RESOLVED_REQUEST_ATTR, requestId);
    }
    block.setAttribute(PROCESSED_ATTR, "true");
  }

  function findRequestFilePathBlocks(chatRoot) {
    return queryInScope(BLOCK_SELECTOR, chatRoot || getChatRoot());
  }

  function isUserMessage(messageEl) {
    return messageEl.matches(USER_SELECTOR);
  }

  function isAssistantMessage(messageEl) {
    return messageEl.matches(ASSISTANT_SELECTOR);
  }

  function getMessageText(messageEl) {
    const clone = messageEl.cloneNode(true);
    clone
      .querySelectorAll(`.${WIDGET_CLASS}, .${READONLY_CLASS}`)
      .forEach((el) => el.remove());
    return (clone.textContent || "").trim();
  }

  function collectOrderedMessages(chatRoot) {
    const messageSet = new Set();
    queryInScope(ASSISTANT_SELECTOR, chatRoot).forEach((el) => messageSet.add(el));
    queryInScope(USER_SELECTOR, chatRoot).forEach((el) => messageSet.add(el));
    return [...messageSet].sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function buildMessageContext(chatRoot) {
    const messages = collectOrderedMessages(chatRoot);
    const contextByRequestId = new Map();
    let lastAssistantWithRequestIndex = -1;
    let lastAssistantWithRequestId = null;

    messages.forEach((messageEl, index) => {
      if (!isAssistantMessage(messageEl)) return;
      const blocks = findRequestFilePathBlocks(chatRoot).filter((block) =>
        messageEl.contains(block)
      );
      blocks.forEach((block) => {
        const payload = parsePayload(block);
        if (!payload) return;
        const requestId = payload.request_id;
        lastAssistantWithRequestIndex = index;
        lastAssistantWithRequestId = requestId;
        contextByRequestId.set(requestId, {
          block,
          payload,
          requestId,
          messageIndex: index,
          status: "pending",
          answer: null,
        });
      });
    });

    contextByRequestId.forEach((entry, requestId) => {
      const messageIndex = entry.messageIndex;
      for (let i = messageIndex + 1; i < messages.length; i++) {
        const nextMessage = messages[i];
        if (isUserMessage(nextMessage)) {
          entry.status = "resolved";
          entry.answer = getMessageText(nextMessage);
          return;
        }
        if (isAssistantMessage(nextMessage)) break;
      }
      if (
        messageIndex === lastAssistantWithRequestIndex &&
        requestId === lastAssistantWithRequestId
      ) {
        entry.status = "pending";
      } else {
        entry.status = "resolved";
      }
    });

    return { contextByRequestId };
  }

  function getOrderedBlockEntries(chatRoot) {
    const scope = chatRoot || getChatRoot();
    if (!scope) return [];
    const { contextByRequestId } = buildMessageContext(scope);
    return findRequestFilePathBlocks(scope)
      .map((block) => {
        const payload = parsePayload(block);
        if (!payload) return null;
        const requestId = payload.request_id;
        const contextEntry = contextByRequestId.get(requestId);
        return {
          block,
          payload,
          requestId,
          status: contextEntry?.status || "pending",
          answer: contextEntry?.answer || null,
        };
      })
      .filter(Boolean);
  }

  function isWidgetAnchored(widget, block) {
    if (!isConnected(widget) || !isConnected(block)) return false;
    const container = findCodeBlockContainer(block);
    return isConnected(container) && widget.previousElementSibling === container;
  }

  function retireStaleWidgets(keepRequestId, chatRoot) {
    if (!keepRequestId) return;
    queryInScope(`.${WIDGET_CLASS}`, chatRoot).forEach((widget) => {
      if (widget.getAttribute(RESOLVED_ATTR) === "true") return;
      const requestId = widget.getAttribute(WIDGET_REQUEST_ATTR);
      if (requestId && requestId !== keepRequestId && isConnected(widget)) {
        widget.remove();
      }
    });
  }

  function submitViaOpenWebUI(value) {
    window.postMessage({ type: "input:prompt:submit", text: value }, window.origin);
  }

  function applyReadonlyCardStyles(card) {
    card.className = READONLY_CLASS;
    card.style.cssText = [
      "display: block",
      "width: 100%",
      "box-sizing: border-box",
      "margin: 8px 0",
      "padding: 10px 14px",
      "border: 1px solid #d0d7de",
      "border-radius: 8px",
      "background: #f6f8fa",
      "max-width: 640px",
      "font-family: system-ui, -apple-system, Segoe UI, sans-serif",
      "pointer-events: none",
    ].join(";");
  }

  function renderReadonlyCard(block, payload, requestId, options) {
    const { answer = null } = options || {};
    hideCodeBlock(block);

    const chatRoot = getChatRoot();
    const existing = findExistingReadonlyCard(requestId, chatRoot);
    if (existing && isWidgetAnchored(existing, block)) {
      block.setAttribute(PROCESSED_ATTR, "true");
      return true;
    }
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.setAttribute(RESOLVED_ATTR, "true");
    card.setAttribute(RESOLVED_REQUEST_ATTR, requestId);
    applyReadonlyCardStyles(card);

    const title = document.createElement("div");
    title.textContent = payload.request;
    title.style.cssText =
      "font-weight: 400; font-size: 0.9em; color: #57606a; line-height: 1.5; margin: 0;";
    card.appendChild(title);

    if (answer) {
      const answerEl = document.createElement("div");
      answerEl.textContent = `已选路径：${answer}`;
      answerEl.style.cssText =
        "font-size: 0.85em; color: #0969da; margin-top: 6px; line-height: 1.4; word-break: break-all;";
      card.appendChild(answerEl);
    }

    const container = findCodeBlockContainer(block);
    if (!isConnected(container)) return false;
    container.insertAdjacentElement("afterend", card);
    block.setAttribute(PROCESSED_ATTR, "true");
    return true;
  }

  function collapseWidgetToPath(widget, requestId, answer) {
    const titleEl = widget.firstChild;
    while (widget.lastChild !== titleEl) {
      widget.removeChild(widget.lastChild);
    }

    widget.className = READONLY_CLASS;
    widget.setAttribute(RESOLVED_ATTR, "true");
    widget.setAttribute(RESOLVED_REQUEST_ATTR, requestId);
    widget.removeAttribute(WIDGET_REQUEST_ATTR);
    applyReadonlyCardStyles(widget);

    if (titleEl) {
      titleEl.style.cssText =
        "font-weight: 400; font-size: 0.9em; color: #57606a; line-height: 1.5; margin: 0;";
    }

    if (answer) {
      const answerEl = document.createElement("div");
      answerEl.textContent = `已选路径：${answer}`;
      answerEl.style.cssText =
        "font-size: 0.85em; color: #0969da; margin-top: 6px; line-height: 1.4; word-break: break-all;";
      widget.appendChild(answerEl);
    }
  }

  function mountWidget(widget, block) {
    const container = findCodeBlockContainer(block);
    if (!isConnected(container)) return false;
    container.insertAdjacentElement("afterend", widget);
    return true;
  }

  async function fetchEntries(dirPath, apiBaseUrl) {
    try {
      const base = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, "") : "";
      const res = await fetch(`${base}/v1/fs/list?dirs_only=true&path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function parentOf(p) {
    const parts = p.replace(/\/+$/, "").split("/");
    if (parts.length <= 1) return p;
    parts.pop();
    return parts.join("/") || "/";
  }

  function buildBreadcrumb(currentPath, onNavigate) {
    const nav = document.createElement("div");
    nav.style.cssText =
      "display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-bottom: 8px; font-size: 0.8em; color: #57606a;";

    const parts = currentPath.replace(/\/+$/, "").split("/").filter(Boolean);
    const segments = [{ label: "/", path: "/" }];
    parts.forEach((part, i) => {
      segments.push({ label: part, path: "/" + parts.slice(0, i + 1).join("/") });
    });

    segments.forEach((seg, i) => {
      const span = document.createElement("span");
      span.textContent = seg.label;
      if (i < segments.length - 1) {
        span.style.cssText = "cursor: pointer; color: #0969da; text-decoration: underline;";
        span.addEventListener("click", () => onNavigate(seg.path));
      } else {
        span.style.cssText = "font-weight: 600; color: #24292f;";
      }
      nav.appendChild(span);

      if (i < segments.length - 1) {
        const sep = document.createElement("span");
        sep.textContent = "/";
        sep.style.color = "#d0d7de";
        nav.appendChild(sep);
      }
    });

    return nav;
  }

  function buildEntryList(entries, currentPath, state, onNavigate) {
    const list = document.createElement("div");
    list.style.cssText = [
      "border: 1px solid #d0d7de",
      "border-radius: 6px",
      "overflow-y: auto",
      "max-height: 240px",
      "background: #ffffff",
      "margin-bottom: 10px",
    ].join(";");

    if (!entries || entries.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "（无子目录）";
      empty.style.cssText = "padding: 12px; color: #57606a; font-size: 0.85em; text-align: center;";
      list.appendChild(empty);
      return list;
    }

    entries.forEach((entry) => {
      const row = document.createElement("div");
      const fullPath = currentPath.replace(/\/+$/, "") + "/" + entry.name;

      row.style.cssText = [
        "display: flex",
        "align-items: center",
        "gap: 8px",
        "padding: 7px 12px",
        "cursor: pointer",
        "font-size: 0.875em",
        "border-bottom: 1px solid #f0f0f0",
        "user-select: none",
      ].join(";");

      const icon = document.createElement("span");
      icon.textContent = "📁";
      icon.style.fontSize = "1em";

      const label = document.createElement("span");
      label.textContent = entry.name;
      label.style.cssText = "flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";

      const arrow = document.createElement("span");
      arrow.textContent = "›";
      arrow.style.cssText = "color: #adb5bd; font-size: 1.1em;";

      row.appendChild(icon);
      row.appendChild(label);
      row.appendChild(arrow);

      row.addEventListener("mouseenter", () => {
        row.style.background = state.selectedPath === fullPath ? "#cce5ff" : "#f0f6ff";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = state.selectedPath === fullPath ? "#ddf4ff" : "";
      });

      row.addEventListener("click", () => {
        list.querySelectorAll("div").forEach((r) => (r.style.background = ""));
        row.style.background = "#ddf4ff";
        state.selectedPath = fullPath;
        onNavigate(fullPath, false);  // false = select only, don't navigate
      });

      row.addEventListener("dblclick", () => {
        onNavigate(fullPath, true);   // true = navigate into
      });

      if (state.selectedPath === fullPath) {
        row.style.background = "#ddf4ff";
      }

      list.appendChild(row);
    });

    return list;
  }

  async function refreshBrowser(widget, dirPath, state, pathInput, apiBaseUrl) {
    state.currentPath = dirPath;
    pathInput.value = dirPath;
    state.selectedPath = dirPath;

    const breadcrumbEl = widget.querySelector("[data-rfp-breadcrumb]");
    const listEl = widget.querySelector("[data-rfp-list]");
    const statusEl = widget.querySelector("[data-rfp-status]");

    if (statusEl) statusEl.textContent = "加载中…";
    if (listEl) listEl.style.opacity = "0.5";

    const data = await fetchEntries(dirPath, apiBaseUrl);

    if (statusEl) statusEl.textContent = "";

    const newBreadcrumb = buildBreadcrumb(dirPath, (p) => refreshBrowser(widget, p, state, pathInput, apiBaseUrl));
    newBreadcrumb.setAttribute("data-rfp-breadcrumb", "true");
    if (breadcrumbEl) breadcrumbEl.replaceWith(newBreadcrumb);

    // onNavigate(path, shouldEnter): shouldEnter=true → navigate into dir; false → just select
    function onNavigate(p, shouldEnter) {
      state.selectedPath = p;
      pathInput.value = p;
      if (shouldEnter) {
        refreshBrowser(widget, p, state, pathInput, apiBaseUrl);
      }
    }

    const newList = buildEntryList(
      data ? data.entries : null,
      dirPath,
      state,
      onNavigate
    );
    newList.setAttribute("data-rfp-list", "true");
    if (listEl) listEl.replaceWith(newList);
  }

  function createWidget(payload, requestId, block, chatRoot) {
    retireStaleWidgets(requestId, chatRoot);

    const widget = document.createElement("div");
    widget.className = WIDGET_CLASS;
    widget.setAttribute(WIDGET_SESSION_ATTR, payload.session_id);
    widget.setAttribute(WIDGET_REQUEST_ATTR, requestId);
    widget.style.cssText = [
      "display: block",
      "width: 100%",
      "box-sizing: border-box",
      "margin: 12px 0",
      "padding: 16px",
      "border: 1px solid #d0d7de",
      "border-radius: 12px",
      "background: #f6f8fa",
      "max-width: 640px",
      "font-family: system-ui, -apple-system, Segoe UI, sans-serif",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = payload.request;
    title.style.cssText = "font-weight: 600; margin-bottom: 12px; line-height: 1.5;";
    widget.appendChild(title);

    const breadcrumbPlaceholder = document.createElement("div");
    breadcrumbPlaceholder.setAttribute("data-rfp-breadcrumb", "true");
    breadcrumbPlaceholder.style.height = "18px";
    widget.appendChild(breadcrumbPlaceholder);

    const upRow = document.createElement("div");
    upRow.style.cssText = "display: flex; align-items: center; gap: 6px; margin-bottom: 6px;";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑ 上一级";
    upBtn.style.cssText = [
      "padding: 4px 10px",
      "border: 1px solid #d0d7de",
      "border-radius: 6px",
      "background: #ffffff",
      "color: #24292f",
      "cursor: pointer",
      "font-size: 0.8em",
    ].join(";");

    const statusEl = document.createElement("span");
    statusEl.setAttribute("data-rfp-status", "true");
    statusEl.style.cssText = "font-size: 0.75em; color: #57606a;";

    upRow.appendChild(upBtn);
    upRow.appendChild(statusEl);
    widget.appendChild(upRow);

    const listPlaceholder = document.createElement("div");
    listPlaceholder.setAttribute("data-rfp-list", "true");
    listPlaceholder.style.cssText = "border: 1px solid #d0d7de; border-radius: 6px; height: 40px; background: #fff;";
    widget.appendChild(listPlaceholder);

    const inputRow = document.createElement("div");
    inputRow.style.cssText = "display: flex; gap: 6px; margin-top: 8px; margin-bottom: 10px;";

    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.placeholder = "输入或粘贴路径，按 Enter 跳转…";
    pathInput.value = payload.start_path || "";
    pathInput.style.cssText = [
      "flex: 1",
      "min-width: 0",
      "padding: 8px 10px",
      "border: 1px solid #d0d7de",
      "border-radius: 8px",
      "font-size: 0.875em",
      "font-family: monospace",
    ].join(";");

    const goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.textContent = "跳转";
    goBtn.title = "跳转到输入的路径";
    goBtn.style.cssText = [
      "padding: 8px 12px",
      "border: 1px solid #d0d7de",
      "border-radius: 8px",
      "background: #ffffff",
      "color: #24292f",
      "cursor: pointer",
      "font-size: 0.875em",
      "white-space: nowrap",
    ].join(";");

    inputRow.appendChild(pathInput);
    inputRow.appendChild(goBtn);
    widget.appendChild(inputRow);

    const hint = document.createElement("div");
    hint.textContent = '点击上方历史目录可返回，单击选中目录，双击进入，按【确认路径】提交';
    hint.style.cssText = "font-size: 0.75em; color: #8b949e; margin-bottom: 10px;";
    widget.appendChild(hint);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; gap: 8px;";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "✓ 确认路径";
    confirmBtn.style.cssText = [
      "padding: 8px 20px",
      "border: 1px solid #0969da",
      "border-radius: 8px",
      "background: #0969da",
      "color: #ffffff",
      "cursor: pointer",
      "font-size: 0.875em",
      "font-weight: 600",
    ].join(";");

    btnRow.appendChild(confirmBtn);
    widget.appendChild(btnRow);

    const apiBaseUrl = payload.api_base_url || "";
    const state = { currentPath: payload.start_path || "", selectedPath: payload.start_path || "" };

    let submitted = false;

    function handleSubmit(value) {
      if (submitted || !value.trim()) return;
      submitted = true;
      markRequestResolved(block, requestId);
      collapseWidgetToPath(widget, requestId, value.trim());
      submitViaOpenWebUI(value.trim());
    }

    function navigateTo(p) {
      if (!p || !p.trim()) return;
      refreshBrowser(widget, p.trim(), state, pathInput, apiBaseUrl);
    }

    upBtn.addEventListener("click", () => {
      const cur = state.currentPath || pathInput.value;
      if (!cur) return;
      navigateTo(parentOf(cur));
    });

    goBtn.addEventListener("click", () => {
      navigateTo(pathInput.value);
    });

    confirmBtn.addEventListener("click", () => {
      handleSubmit(pathInput.value || state.selectedPath);
    });

    pathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateTo(pathInput.value);
      }
    });

    const mounted = mountWidget(widget, block);
    if (mounted) {
      refreshBrowser(widget, payload.start_path || "", state, pathInput, apiBaseUrl);
    }

    return mounted;
  }

  function processBlock(entry, chatRoot) {
    const { block, payload, requestId, status, answer } = entry;
    if (!(block instanceof HTMLElement)) return false;

    if (status === "resolved") {
      if (isRequestResolvedLive(requestId, chatRoot)) {
        block.setAttribute(PROCESSED_ATTR, "true");
        hideCodeBlock(block);
        return true;
      }
      return renderReadonlyCard(block, payload, requestId, { answer });
    }

    hideCodeBlock(block);

    const existingWidget = findExistingWidget(requestId, chatRoot);
    if (existingWidget) {
      if (!isWidgetAnchored(existingWidget, block)) {
        existingWidget.remove();
        createWidget(payload, requestId, block, chatRoot);
      }
      block.setAttribute(PROCESSED_ATTR, "true");
      return true;
    }

    block.setAttribute(PROCESSED_ATTR, "true");
    return createWidget(payload, requestId, block, chatRoot);
  }

  function scan() {
    const chatRoot = getChatRoot();
    if (!chatRoot) return 0;

    ensureObserving();

    const entries = getOrderedBlockEntries(chatRoot);
    let processed = 0;
    entries.forEach((entry) => {
      if (processBlock(entry, chatRoot)) processed++;
    });
    return processed;
  }

  let scanTimer = null;
  let bootstrapObserver = null;
  const observedRoots = new WeakSet();

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, SCAN_DEBOUNCE_MS);
  }

  function observeChatRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    new MutationObserver(() => { scheduleScan(); }).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function ensureObserving() {
    observeChatRoot(getChatRoot());
  }

  function ensureBootstrapObserver() {
    if (bootstrapObserver) return;
    bootstrapObserver = new MutationObserver(scheduleScan);
    bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function hasPendingBlocks() {
    const chatRoot = getChatRoot();
    if (!chatRoot) return false;
    const entries = getOrderedBlockEntries(chatRoot);
    const pendingEntry = entries.find((entry) => entry.status === "pending");
    if (!pendingEntry) return false;
    return (
      !isRequestResolvedLive(pendingEntry.requestId, chatRoot) &&
      !findExistingWidget(pendingEntry.requestId, chatRoot)
    );
  }

  function bindChatSwitchListeners() {
    window.addEventListener("popstate", scheduleScan);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleScan();
    });
  }

  try {
    ensureBootstrapObserver();
    bindChatSwitchListeners();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
    } else {
      scheduleScan();
    }

    setInterval(() => {
      if (hasPendingBlocks()) scan();
    }, FALLBACK_SCAN_MS);

    window.__scanRequestFilePath = scan;
    console.info("[request-file-path] initialized", window.__REQUEST_FILE_PATH_JS_VERSION);
  } catch (err) {
    console.error("[request-file-path] init failed", err);
  }
})();
