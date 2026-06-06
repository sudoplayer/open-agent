import { randomBytes } from "crypto";
import * as os from "os";
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { streamManager } from "infra/stream_manager";
import { CONFIG } from "config";

export function makeRequestFilePathTool(sessionId: string, _sessionRunPath: string) {
  return tool(
    async ({
      request,
    }: {
      request: string;
    }): Promise<string> => {
      const requestId = randomBytes(8).toString("hex");
      const payload = JSON.stringify(
        { request, session_id: sessionId, request_id: requestId, api_base_url: CONFIG.publicApiBaseUrl, start_path: os.homedir() },
        null,
        0
      );

      if (!streamManager.isResuming(sessionId)) {
        streamManager.streamOutput(
          `\n\n\`\`\`request-file-path\n${payload}\n\`\`\`\n\n`,
          sessionId
        );
      }

      const reply = interrupt({
        type: "request_file_path",
        request,
      });

      streamManager.clearResuming(sessionId);
      return typeof reply === "string" ? reply : String(reply);
    },
    {
      name: "request_file_path",
      description:
        "向用户请求一个文件路径。用户可以输入任意文件路径返回。" +
        " 适用于需要用户提供文件路径的场景。",
      schema: z.object({
        request: z.string().describe("向用户发出的文件路径请求内容（必填）。"),
      }),
    }
  );
}
