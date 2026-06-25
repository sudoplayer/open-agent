/**
 * k6 helpers for SSE chat completion stress tests.
 */

export const DEFAULT_BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8888";
export const DEMO_MODEL = __ENV.DEMO_MODEL || "AI计算器";
export const CHAT_TIMEOUT = __ENV.CHAT_TIMEOUT || "180s";

export function chatUrl(baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl}/v1/chat/completions`;
}

export function healthUrl(baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl}/health`;
}

export function modelsUrl(baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl}/v1/models`;
}

/**
 * Build a unique-session chat request body.
 */
export function demoChatPayload(vu, iter, prefix = "load") {
  return JSON.stringify({
    model: DEMO_MODEL,
    messages: [{ role: "user", content: "1+1" }],
  });
}

/**
 * Capacity test: deterministic unique session per sequence index.
 */
export function capacityChatPayload(index, prefix = "load") {
  return JSON.stringify({
    model: DEMO_MODEL,
    messages: [{ role: "user", content: "1+1" }],
  });
}

export function sessionIdentityHeaders(userId, chatId) {
  return {
    "Content-Type": "application/json",
    "x-openwebui-user-id": userId,
    "x-openwebui-chat-id": chatId,
  };
}

export function demoChatHeaders(vu, iter, prefix = "load") {
  return sessionIdentityHeaders(
    `${prefix}-user-${vu}`,
    `${prefix}-chat-${vu}-${iter}-${Date.now()}`,
  );
}

export function capacityChatHeaders(index, prefix = "load") {
  return sessionIdentityHeaders(
    `${prefix}-cap-user`,
    `${prefix}-cap-chat-${String(index).padStart(6, "0")}`,
  );
}

export function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

/**
 * Checks that an HTTP response body contains SSE [DONE] marker.
 */
export function hasSseDone(body) {
  return typeof body === "string" && body.includes("[DONE]");
}

/**
 * Extract active_streams from /health JSON body.
 */
export function parseActiveStreams(body) {
  try {
    const data = JSON.parse(body);
    return data.active_streams;
  } catch {
    return null;
  }
}
