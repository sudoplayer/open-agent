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
exports.makeStreamImageTool = makeStreamImageTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const config_1 = require("config");
const stream_manager_1 = require("infra/stream_manager");
function makeStreamImageTool(sessionId, sessionRunPath) {
    return (0, tools_1.tool)(async ({ filename, streaming = true, }) => {
        if (streaming) {
            // 创建 .streaming 标记，通知 /live/ 端点进入 MJPEG 模式
            const markerPath = path.join(sessionRunPath, filename + ".streaming");
            fs.writeFileSync(markerPath, "");
        }
        const encoded = filename.split("/").map(encodeURIComponent).join("/");
        const liveUrl = `${config_1.CONFIG.publicApiBaseUrl}/v1/sessions/${sessionId}/live/${encoded}`;
        stream_manager_1.streamManager.streamOutput(`\n\n![](${liveUrl})\n\n`, sessionId);
        return streaming
            ? `实时图像展示已嵌入对话: ${filename}`
            : `静态图像已嵌入对话: ${filename}`;
    }, {
        name: "stream_image",
        description: "在对话中嵌入图片。streaming=true（默认）用于实时更新的图像（MJPEG 模式），" +
            "streaming=false 用于已渲染完成的静态图像。filename 为相对于 sessionRunPath 的路径。",
        schema: zod_1.z.object({
            filename: zod_1.z.string().describe("要展示的图片文件名（相对于 sessionRunPath）"),
            streaming: zod_1.z
                .boolean()
                .optional()
                .default(true)
                .describe("是否启用 MJPEG 实时流模式；已完成的静态图片应设为 false"),
        }),
    });
}
