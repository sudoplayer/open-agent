import { randomBytes } from "crypto";
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { streamManager } from "infra/stream_manager";

export function makeAskUserQuestionTool(sessionId: string, _sessionRunPath: string) {
  return tool(
    async ({
      question,
      options,
    }: {
      question: string;
      options: string[];
    }): Promise<string> => {
      const questionId = randomBytes(8).toString("hex");
      const payload = JSON.stringify(
        { question, options, session_id: sessionId, question_id: questionId },
        null,
        0
      );

      if (!streamManager.isResuming(sessionId)) {
        streamManager.streamOutput(
          `\n\n\`\`\`ask-user-question\n${payload}\n\`\`\`\n\n`,
          sessionId
        );
      }

      const reply = interrupt({
        type: "ask_user_question",
        question,
        options,
      });

      streamManager.clearResuming(sessionId);
      return typeof reply === "string" ? reply : String(reply);
    },
    {
      name: "ask_user_question",
      description:
        "向用户提问并等待回复。options 为可选的快捷选项按钮（1-4 个）。" +
        " 确认类问题只需提供正向确认选项（如[确认提交]）；不要添加[需要修改]等负向选项——" +
        "用户若需修改，直接在 widget 文本输入框中打字描述即可。",
      schema: z.object({
        question: z.string().describe("要向用户提问的问题内容（必填）。"),
        options: z
          .array(z.string())
          .describe(
            "供用户点击的快捷选项列表（1-4 个）。" +
            "确认类问题只放正向选项（如[确认提交]），不要放[需要修改]等负向选项。"
          ),
      }),
    }
  );
}
