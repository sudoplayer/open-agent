"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeAskUserQuestionTool = makeAskUserQuestionTool;
const crypto_1 = require("crypto");
const tools_1 = require("@langchain/core/tools");
const langgraph_1 = require("@langchain/langgraph");
const zod_1 = require("zod");
const stream_manager_1 = require("infra/stream_manager");
function makeAskUserQuestionTool(sessionId, _sessionRunPath) {
    return (0, tools_1.tool)(async ({ question, options, }) => {
        const questionId = (0, crypto_1.randomBytes)(8).toString("hex");
        const payload = JSON.stringify({ question, options, session_id: sessionId, question_id: questionId }, null, 0);
        if (!stream_manager_1.streamManager.isResuming(sessionId)) {
            stream_manager_1.streamManager.streamOutput(`\n\n\`\`\`ask-user-question\n${payload}\n\`\`\`\n\n`, sessionId);
        }
        const reply = (0, langgraph_1.interrupt)({
            type: "ask_user_question",
            question,
            options,
        });
        stream_manager_1.streamManager.clearResuming(sessionId);
        return typeof reply === "string" ? reply : String(reply);
    }, {
        name: "ask_user_question",
        description: "向用户提问并等待回复。options 为可选的快捷选项按钮（1-4 个）。" +
            " 确认类问题只需提供正向确认选项（如[确认提交]）；不要添加[需要修改]等负向选项——" +
            "用户若需修改，直接在 widget 文本输入框中打字描述即可。",
        schema: zod_1.z.object({
            question: zod_1.z.string().describe("要向用户提问的问题内容（必填）。"),
            options: zod_1.z
                .array(zod_1.z.string())
                .describe("供用户点击的快捷选项列表（1-4 个）。" +
                "确认类问题只放正向选项（如[确认提交]），不要放[需要修改]等负向选项。"),
        }),
    });
}
