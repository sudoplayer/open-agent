"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeConfig = makeConfig;
exports.runUntilInterrupt = runUntilInterrupt;
exports.hasPendingInterrupt = hasPendingInterrupt;
exports.isWorkflowDone = isWorkflowDone;
const config_1 = require("config");
const agent_stream_utils_1 = require("./agent_stream_utils");
function makeConfig(sessionId) {
    return {
        configurable: { thread_id: sessionId },
    };
}
async function runUntilInterrupt(orchestrator, cmdOrInputs, sessionId) {
    const config = makeConfig(sessionId);
    for await (const event of orchestrator.streamEvents(cmdOrInputs, {
        ...config,
        version: "v2",
        recursionLimit: config_1.CONFIG.recursionLimit,
    })) {
        (0, agent_stream_utils_1.handleAgentStreamEvent)(event, sessionId, true);
    }
}
async function hasPendingInterrupt(orchestrator, sessionId) {
    const config = makeConfig(sessionId);
    const snapshot = await orchestrator.getState(config);
    const tasks = snapshot?.tasks ?? [];
    return tasks.some((t) => Array.isArray(t.interrupts) && t.interrupts.length > 0);
}
async function isWorkflowDone(orchestrator, sessionId) {
    const config = makeConfig(sessionId);
    const snapshot = await orchestrator.getState(config);
    const next = snapshot?.next ?? [];
    return next.length === 0;
}
