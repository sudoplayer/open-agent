"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAgentStreamEvent = handleAgentStreamEvent;
const stream_manager_1 = require("infra/stream_manager");
const TODO_STATUS_ICONS = {
    completed: "✅",
    cancelled: "❌",
};
const TODO_STATUS_ICON_DEFAULT = "⏳";
function truncateText(text, maxChars = 1_000) {
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n... (truncated, total ${text.length} chars)`;
}
function escapeCodeFence(text) {
    return text.replace(/```/g, "'''");
}
function formatPayload(payload) {
    try {
        const result = JSON.stringify(payload, (_k, v) => {
            if (v === undefined)
                return null;
            return v;
        }, 2);
        return result;
    }
    catch {
        return String(payload);
    }
}
function buildToolStartMarkdown(toolName, payload) {
    const payloadText = escapeCodeFence(truncateText(formatPayload(payload)));
    return (`\n\n` +
        `<details>\n\n` +
        `<summary>Tool: ${toolName}</summary>\n\n` +
        `**Arguments**\n\n` +
        `\`\`\`json\n` +
        `${payloadText}\n` +
        `\`\`\`\n\n` +
        `</details>\n\n`);
}
function buildToolEndMarkdown(toolName, resultPayload) {
    const resultText = escapeCodeFence(truncateText(formatPayload(resultPayload)));
    return (`\n\n` +
        `<details>\n\n` +
        `<summary>Tool Result: ${toolName}</summary>\n\n` +
        `**Output**\n\n` +
        `\`\`\`json\n` +
        `${resultText}\n` +
        `\`\`\`\n\n` +
        `</details>\n\n`);
}
function formatTodosMarkdown(payload) {
    try {
        const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
        const todos = parsed?.todos ?? [];
        const lines = todos.map((item) => {
            const icon = TODO_STATUS_ICONS[item.status ?? ""] ?? TODO_STATUS_ICON_DEFAULT;
            return `${icon} ${item.content ?? ""}`;
        });
        const taskList = lines.join("\n");
        return (`\n\n` +
            `<details>\n\n` +
            `<summary>Tool: write_todos</summary>\n\n` +
            `${taskList}\n\n` +
            `</details>\n\n`);
    }
    catch {
        return formatPayload(payload);
    }
}
const SILENT_INVOKE_TOOLS = new Set([
    "ask_user_question",
    "request_file_path",
    "stream_image",
]);
const SILENT_RESULT_TOOLS = new Set([
    "ls",
    "read_file",
    "write_todos",
    "ask_user_question",
    "request_file_path",
    "stream_image",
]);
function handleAgentStreamEvent(event, threadId, streamModelOutput = true) {
    const eventType = String(event["event"] ?? "");
    const eventName = String(event["name"] ?? "");
    const data = event["data"] ?? {};
    if (eventType === "on_chat_model_stream" && streamModelOutput) {
        const chunk = data["chunk"];
        const chunkText = String(chunk?.["content"] ?? "");
        if (chunkText) {
            stream_manager_1.streamManager.streamOutput(chunkText, threadId);
        }
    }
    else if (eventType === "on_tool_start") {
        if (eventName === "write_todos") {
            // LangChain v2 double-wraps write_todos tool input: data.input = { input: '{"todos":[...]}' },
            // so unwrap the inner JSON string to get the real { todos } object.
            const toolInput = JSON.parse(data["input"]["input"]);
            stream_manager_1.streamManager.streamOutput(formatTodosMarkdown(toolInput), threadId);
        }
        else if (!SILENT_INVOKE_TOOLS.has(eventName)) {
            const toolInput = data["input"] ?? data;
            stream_manager_1.streamManager.streamOutput(buildToolStartMarkdown(eventName, toolInput), threadId);
        }
    }
    else if (eventType === "on_tool_end") {
        if (!SILENT_RESULT_TOOLS.has(eventName)) {
            let toolOutput = data["output"] ?? data;
            if (typeof toolOutput === "object" && toolOutput !== null && "content" in toolOutput) {
                toolOutput = toolOutput["content"];
            }
            stream_manager_1.streamManager.streamOutput(buildToolEndMarkdown(eventName, toolOutput), threadId);
        }
    }
    else if (eventType === "on_chain_end") {
        const output = data["output"];
        if (typeof output === "object" && output !== null && "messages" in output) {
            return output;
        }
    }
    return undefined;
}
