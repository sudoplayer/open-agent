import * as fs from "fs";
import * as path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { streamManager } from "infra/stream_manager";


function isBinaryFile(buffer: Buffer): boolean {
  // Null bytes are a strong binary indicator
  if (buffer.includes(0)) return true;

  // Check ratio of control characters (excluding tab, 换行, 回车) in the first 1024 bytes
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    }
  }
  return nonPrintable / sample.length > 0.05;
}

function maxConsecutiveBackticks(content: string): number {
  const runs = content.match(/`+/g);
  return runs ? Math.max(...runs.map(run => run.length)) : 0;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function makeShowFileTool(sessionId: string, sessionRunPath: string) {
  const sessionDir = path.resolve(sessionRunPath);

  return tool(
    async ({ file_path }: { file_path: string }): Promise<string> => {

      const resolved = path.resolve(
        path.isAbsolute(file_path) ? file_path : path.join(sessionDir, file_path)
      );
      const relative = path.relative(sessionDir, resolved);
      if (relative.startsWith("..")) {
        const msg = `show_file: 路径超出范围: ${file_path}`;
        streamManager.streamOutput(`\n\n> ⚠️ ${msg}\n\n`, sessionId);
        return msg;
      }

      if (!fs.existsSync(resolved)) {
        const msg = `show_file: 路径不存在: ${relative}`;
        streamManager.streamOutput(`\n\n> ⚠️ ${msg}\n\n`, sessionId);
        return msg;
      }

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        const msg = `show_file: 路径不是文件: ${relative}`;
        streamManager.streamOutput(`\n\n> ⚠️ ${msg}\n\n`, sessionId);
        return msg;
      }

      const headBuffer = fs.readFileSync(resolved, { flag: "r" });
      if (isBinaryFile(headBuffer)) {
        const msg = `show_file: 路径是二进制文件: ${relative}`;
        streamManager.streamOutput(`\n\n> ⚠️ ${msg}\n\n`, sessionId);
        return msg;
      }

      const content = headBuffer.toString("utf-8");
      const lines = content.length === 0 ? 0 : content.split("\n").length;

      const maxBackticks = maxConsecutiveBackticks(content);
      const fenceLen = Math.max(3, maxBackticks + 1);
      const fence = "`".repeat(fenceLen);

      const displayPath = relative;
      const displayContent = content.length === 0 ? "(empty file)" : content;

      streamManager.streamOutput(
        `\n\n**📄 ${displayPath}**\n\n${fence}text\n${displayContent}\n${fence}\n\n`,
        sessionId
      );

      return `Displayed file: ${displayPath} (${lines} lines, ${formatFileSize(stat.size)})`;
    },
    {
      name: "show_file",
      description:
        "将指定文件的内容以代码块格式展示给用户查看。" +
        "用于让用户审阅文件内容，例如配置文件、结果文件、日志等。" +
        "支持文本文件；二进制文件会被自动拒绝。",
      schema: z.object({
        file_path: z.string().describe("要展示给用户的文件路径（绝对路径或相对于会话目录(sessionRunPath)的相对路径）"),
      }),
    }
  );
}
