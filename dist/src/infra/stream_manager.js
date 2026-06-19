"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamManager = exports.StreamManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stream_1 = require("stream");
const config_js_1 = require("../config.js");
class StreamManager {
    activeCallbacks = new Map();
    resumingSet = new Set();
    sseStreams = new Map();
    appendDebugMarkdown(content) {
        const debugPath = path.join(config_js_1.CONFIG.projectRoot, "debug.md");
        fs.appendFileSync(debugPath, content, "utf-8");
    }
    registerStreamCallback(threadId, callback) {
        this.activeCallbacks.set(threadId, callback);
    }
    beginStream(reply, threadId) {
        const sseStream = new stream_1.PassThrough();
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        });
        reply.hijack();
        sseStream.pipe(reply.raw);
        this.sseStreams.set(threadId, sseStream);
        this.registerStreamCallback(threadId, (chunk) => {
            sseStream.write(chunk);
        });
    }
    createStreamChunk(threadId, content, finishReason) {
        const chunk = {
            id: threadId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: config_js_1.CONFIG.modelName,
            choices: [
                {
                    index: 0,
                    delta: content ? { content } : {},
                    finish_reason: finishReason ?? null,
                },
            ],
        };
        return `data: ${JSON.stringify(chunk)}\n\n`;
    }
    streamOutput(content, threadId) {
        try {
            const callback = this.activeCallbacks.get(threadId);
            if (callback !== undefined) {
                const chunk = this.createStreamChunk(threadId, content);
                callback(chunk);
            }
            else {
                this.appendDebugMarkdown(content);
            }
        }
        catch (e) {
            console.error("Stream output error:", e);
        }
    }
    isActive(threadId) {
        return this.activeCallbacks.has(threadId);
    }
    activeCount() {
        return this.activeCallbacks.size;
    }
    discardCallback(threadId) {
        this.activeCallbacks.delete(threadId);
    }
    setResuming(threadId, value) {
        if (value) {
            this.resumingSet.add(threadId);
        }
        else {
            this.resumingSet.delete(threadId);
        }
    }
    isResuming(threadId) {
        return this.resumingSet.has(threadId);
    }
    clearResuming(threadId) {
        this.resumingSet.delete(threadId);
    }
    endStream(threadId) {
        try {
            const callback = this.activeCallbacks.get(threadId);
            if (callback !== undefined) {
                callback(this.createStreamChunk(threadId, "", "stop"));
                callback("data: [DONE]\n\n");
            }
        }
        catch (e) {
            console.error("Stream end error:", e);
        }
        finally {
            this.discardCallback(threadId);
            this.clearResuming(threadId);
            const sseStream = this.sseStreams.get(threadId);
            if (sseStream) {
                sseStream.end();
                this.sseStreams.delete(threadId);
            }
        }
    }
}
exports.StreamManager = StreamManager;
exports.streamManager = new StreamManager();
