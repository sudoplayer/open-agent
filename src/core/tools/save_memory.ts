import * as fs from "fs";

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CONFIG } from "config";
import { ensureAgentMemoryDir, resolveUserMemoryPath } from "infra/agent_memory";

export const MEMORY_PROTOCOL_PROMPT = `
## 长期记忆写入协议

当你判断某条经验教训值得长期保存时，**必须**按以下流程操作，禁止跳步：

1. **先**调用 \`ask_user_question\`：在 question 中完整展示拟写入的经验教训正文，询问用户是否保存。
   - options 建议：["确认保存", "拒绝保存"]
   - 用户选择「确认保存」→ 用展示的原文调用 \`save_memory\`
   - 用户以自由文本提出修改意见 → 按意见修订正文后，**须再次**调用 \`ask_user_question\` 展示修订内容并请用户确认；未获确认前不得调用 \`save_memory\`
   - 用户明确拒绝 → **不得**调用 \`save_memory\`

2. **再**调用 \`save_memory({ memory })\`：纯落盘工具，不含确认逻辑；仅在第 1 步获用户确认后调用，且仅写入本 agent 的 \`userMemoryPath\`。

禁止用 \`write_file\` / \`edit_file\` 写入 \`memory/\` 目录；禁止跳过 \`ask_user_question\` 直接调用 \`save_memory\`。
`.trim();

export function validateMemoryContent(memory: string): string | null {
  const trimmed = memory.trim();
  if (!trimmed) {
    return "经验教训不能为空";
  }
  if (trimmed.length > CONFIG.memoryMaxChars) {
    return `经验教训过长（最多 ${CONFIG.memoryMaxChars} 字）`;
  }
  return null;
}

export function appendMemory(
  userId: string,
  agentId: string,
  memory: string
): string {
  const error = validateMemoryContent(memory);
  if (error) {
    throw new Error(error);
  }

  ensureAgentMemoryDir(userId, agentId);
  const filePath = resolveUserMemoryPath(userId, agentId);
  const date = new Date().toISOString().slice(0, 10);
  const line = `- [${date}] ${memory.trim()}\n`;
  fs.appendFileSync(filePath, line, "utf-8");
  return filePath;
}

export function makeSaveMemoryTool(
  _sessionId: string,
  _sessionRunPath: string,
  userId: string,
  agentId: string
) {
  return tool(
    async ({ memory }: { memory: string }): Promise<string> => {
      const filePath = appendMemory(userId, agentId, memory);
      return `记忆已保存: ${filePath}`;
    },
    {
      name: "save_memory",
      description:
        "将经验教训写入本 agent 的长期记忆文件（userMemoryPath）。" +
        " 仅写结论性经验教训（每条建议 < 200 字）。" +
        " **必须先经 ask_user_question 展示正文并获用户确认**；若用户提出修改，修订后须再次确认。" +
        " 禁止跳过用户确认直接写入；用户拒绝则不得调用本工具。",
      schema: z.object({
        memory: z
          .string()
          .describe(
            "拟写入的经验教训正文（来自 ask_user_question 确认后的最终文本）"
          ),
      }),
    }
  );
}
