"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKFLOW_CHECKPOINTER = void 0;
exports.releaseSessionCheckpoint = releaseSessionCheckpoint;
const langgraph_1 = require("@langchain/langgraph");
exports.WORKFLOW_CHECKPOINTER = new langgraph_1.MemorySaver();
function releaseSessionCheckpoint(sessionId) {
    exports.WORKFLOW_CHECKPOINTER.deleteThread(sessionId).catch((e) => {
        console.warn(`releaseSessionCheckpoint(${sessionId}) error:`, e);
    });
}
