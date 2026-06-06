import * as fs from "fs";
import * as path from "path";
import { PassThrough } from "stream";
import { CONFIG } from "../config.js";

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string };
    finish_reason: string | null;
  }>;
}

export class StreamManager {
  private activeCallbacks: Map<string, (chunk: string) => void> = new Map();
  private resumingSet: Set<string> = new Set();
  private sseStreams: Map<string, PassThrough> = new Map();

  private appendDebugMarkdown(content: string): void {
    const debugPath = path.join(CONFIG.projectRoot, "debug.md");
    fs.appendFileSync(debugPath, content, "utf-8");
  }

  registerStreamCallback(threadId: string, callback: (chunk: string) => void): void {
    this.activeCallbacks.set(threadId, callback);
  }

  beginStream(reply: any, threadId: string): void {
    const sseStream = new PassThrough();
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
    this.registerStreamCallback(threadId, (chunk: string) => {
      sseStream.write(chunk);
    });
  }

  createStreamChunk(threadId: string, content: string, finishReason?: string): string {
    const chunk: ChatCompletionChunk = {
      id: threadId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: CONFIG.modelName,
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

  streamOutput(content: string, threadId: string): void {
    try {
      const callback = this.activeCallbacks.get(threadId);
      if (callback !== undefined) {
        const chunk = this.createStreamChunk(threadId, content);
        callback(chunk);
      } else {
        this.appendDebugMarkdown(content);
      }
    } catch (e) {
      console.error("Stream output error:", e);
    }
  }

  isActive(threadId: string): boolean {
    return this.activeCallbacks.has(threadId);
  }

  activeCount(): number {
    return this.activeCallbacks.size;
  }

  discardCallback(threadId: string): void {
    this.activeCallbacks.delete(threadId);
  }

  setResuming(threadId: string, value: boolean): void {
    if (value) {
      this.resumingSet.add(threadId);
    } else {
      this.resumingSet.delete(threadId);
    }
  }

  isResuming(threadId: string): boolean {
    return this.resumingSet.has(threadId);
  }

  clearResuming(threadId: string): void {
    this.resumingSet.delete(threadId);
  }

  endStream(threadId: string): void {
    try {
      const callback = this.activeCallbacks.get(threadId);
      if (callback !== undefined) {
        callback(this.createStreamChunk(threadId, "", "stop"));
        callback("data: [DONE]\n\n");
      }
    } catch (e) {
      console.error("Stream end error:", e);
    } finally {
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

export const streamManager = new StreamManager();
