import * as fs from "fs";
import * as path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CONFIG } from "config";
import { streamManager } from "infra/stream_manager";

export function makeStreamImageTool(
  sessionId: string,
  sessionRunPath: string,
  userId: string,
) {
  return tool(
    async ({
      filename,
      streaming = true,
    }: {
      filename: string;
      streaming?: boolean;
    }): Promise<string> => {
      if (streaming) {
        // 创建 .streaming 标记，通知 /live/ 端点进入 MJPEG 模式
        const markerPath = path.join(sessionRunPath, filename + ".streaming");
        fs.writeFileSync(markerPath, "");
      }

      const encoded = filename.split("/").map(encodeURIComponent).join("/");
      const liveUrl =
        `${CONFIG.publicApiBaseUrl}/v1/sessions/${encodeURIComponent(userId)}/${sessionId}/live/${encoded}`;
      streamManager.streamOutput(`\n\n![](${liveUrl})\n\n`, sessionId);
      return streaming
        ? `实时图像展示已嵌入对话: ${filename}`
        : `静态图像已嵌入对话: ${filename}`;
    },
    {
      name: "stream_image",
      description:
        "在对话中嵌入图片。streaming=true（默认）用于实时更新的图像（MJPEG 模式），" +
        "streaming=false 用于已渲染完成的静态图像。filename 为相对于 sessionRunPath 的路径。",
      schema: z.object({
        filename: z.string().describe("要展示的图片文件名（相对于 sessionRunPath）"),
        streaming: z
          .boolean()
          .optional()
          .default(true)
          .describe("是否启用 MJPEG 实时流模式；已完成的静态图片应设为 false"),
      }),
    }
  );
}
