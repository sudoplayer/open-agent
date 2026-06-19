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
exports.makeRequestFilePathTool = makeRequestFilePathTool;
const crypto_1 = require("crypto");
const os = __importStar(require("os"));
const tools_1 = require("@langchain/core/tools");
const langgraph_1 = require("@langchain/langgraph");
const zod_1 = require("zod");
const stream_manager_1 = require("infra/stream_manager");
const config_1 = require("config");
function makeRequestFilePathTool(sessionId, _sessionRunPath) {
    return (0, tools_1.tool)(async ({ request, }) => {
        const requestId = (0, crypto_1.randomBytes)(8).toString("hex");
        const payload = JSON.stringify({ request, session_id: sessionId, request_id: requestId, api_base_url: config_1.CONFIG.publicApiBaseUrl, start_path: os.homedir() }, null, 0);
        if (!stream_manager_1.streamManager.isResuming(sessionId)) {
            stream_manager_1.streamManager.streamOutput(`\n\n\`\`\`request-file-path\n${payload}\n\`\`\`\n\n`, sessionId);
        }
        const reply = (0, langgraph_1.interrupt)({
            type: "request_file_path",
            request,
        });
        stream_manager_1.streamManager.clearResuming(sessionId);
        return typeof reply === "string" ? reply : String(reply);
    }, {
        name: "request_file_path",
        description: "向用户请求一个文件路径。用户可以输入任意文件路径返回。" +
            " 适用于需要用户提供文件路径的场景。",
        schema: zod_1.z.object({
            request: zod_1.z.string().describe("向用户发出的文件路径请求内容（必填）。"),
        }),
    });
}
