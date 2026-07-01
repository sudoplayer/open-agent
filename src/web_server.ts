import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";

import { CONFIG } from "config";
import {
  SessionEntry,
  SessionStore,
  buildSessionRunPath,
  parseUserId,
} from "core/session";
import { loadManifest } from "core/manifest_loader";
import { streamManager } from "infra/stream_manager";
import { runUntilInterrupt, hasPendingInterrupt, isWorkflowDone } from "agents/runner";
import {
  initWorkflowCheckpointer,
  markSessionCompleted,
  startCheckpointVacuumScheduler,
} from "infra/workflow_checkpointer";
import { Command } from "@langchain/langgraph";

const _manifest = loadManifest();

const _sessions = new SessionStore();

async function runWorkflowTurn(entry: SessionEntry, cmdOrInputs: unknown): Promise<void> {
  const sessionId = entry.session.sessionId;
  await entry.ensureRunDir();
  const orchestrator = entry.getOrchestrator();
  try {
    await runUntilInterrupt(orchestrator, cmdOrInputs, sessionId);
    if (await isWorkflowDone(orchestrator, sessionId)) {
      markSessionCompleted(sessionId);
    }
  } catch (e) {
    console.error(`Workflow turn failed for session ${sessionId}:`, e);
    streamManager.streamOutput(`\n\n❌ Workflow failed: ${String(e)}\n\n`, sessionId);
  }
}

const app = Fastify({ logger: false });

app.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: "*",
  exposedHeaders: "*",
  credentials: true,
});

app.get("/health", async () => ({
  status: "healthy",
  service: _manifest.displayName,
  version: "v1.0",
  active_streams: streamManager.activeCount(),
}));

app.get("/v1/models", async () => {
  const created = Math.floor(Date.now() / 1000);
  return {
    object: "list",
    data: [
      {
        id: _manifest.modelId,
        object: "model",
        created,
        owned_by: "Open Agent Platform",
      },
    ],
  };
});

function isValidPNG(buf: Buffer): boolean {
  return buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
}

function isPNGComplete(buf: Buffer): boolean {
  return buf.length >= 20 &&
    buf[buf.length - 8] === 0x49 && buf[buf.length - 7] === 0x45 &&
    buf[buf.length - 6] === 0x4E && buf[buf.length - 5] === 0x44;
}

function serveMpegStream(reply: any, pngPath: string, streamingMarker: string): void {
  const boundary = "frame";
  const POLL_INTERVAL_MS = 200;
  const STALE_LIMIT = 50;
  const MAX_WAIT_MS = 300_000;
  const MAX_DURATION_MS = 3_600_000;

  reply.raw.writeHead(200, {
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  reply.hijack();

  let lastMtime = 0;
  let staleCount = 0;
  const startTime = Date.now();

  function cleanupStreamingMarker(): void {
    try { fs.unlinkSync(streamingMarker); } catch { /* ignore */ }
  }

  function sendFrame(): void {
    if (!fs.existsSync(pngPath)) return;
    try {
      const stat = fs.statSync(pngPath);
      if (stat.mtimeMs === lastMtime) {
        staleCount++;
        return;
      }

      const data = fs.readFileSync(pngPath);
      if (!isValidPNG(data) || !isPNGComplete(data)) return;

      staleCount = 0;
      lastMtime = stat.mtimeMs;
      reply.raw.write(
        `--${boundary}\r\nContent-Type: image/png\r\nContent-Length: ${data.length}\r\n\r\n`
      );
      reply.raw.write(data);
      reply.raw.write("\r\n");
    } catch {
      // 文件可能正在写入；跳过本次轮询
    }
  }

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;

    if (elapsed > MAX_DURATION_MS) {
      clearInterval(timer);
      cleanupStreamingMarker();
      try { reply.raw.end(); } catch { /* ignore */ }
      return;
    }

    if (!fs.existsSync(pngPath) && elapsed < MAX_WAIT_MS) return;

    sendFrame();

    if (staleCount >= STALE_LIMIT) {
      clearInterval(timer);
      cleanupStreamingMarker();
      try {
        const data = fs.readFileSync(pngPath);
        if (isValidPNG(data) && isPNGComplete(data)) {
          reply.raw.write(
            `--${boundary}\r\nContent-Type: image/png\r\nContent-Length: ${data.length}\r\n\r\n`
          );
          reply.raw.write(data);
          reply.raw.write("\r\n");
        }
        reply.raw.end();
      } catch { /* ignore */ }
    }
  }, POLL_INTERVAL_MS);

  reply.raw.on("close", () => {
    clearInterval(timer);
    cleanupStreamingMarker();
  });
}

app.get<{ Params: { userId: string; chatId: string; "*": string } }>(
  "/v1/sessions/:userId/:chatId/live/*",
  async (request, reply) => {
    const { userId: userIdParam, chatId } = request.params;
    const filename = request.params["*"];

    let sessionDir: string;
    try {
      sessionDir = path.resolve(
        buildSessionRunPath(decodeURIComponent(userIdParam), chatId),
      );
    } catch {
      return reply.code(400).send({ detail: "Invalid userId" });
    }
    if (!fs.existsSync(sessionDir)) {
      return reply.code(404).send({ detail: "Session not found" });
    }
    const pngPath = path.resolve(path.join(sessionDir, ...filename.split("/")));
    if (!pngPath.startsWith(sessionDir + path.sep) && pngPath !== sessionDir) {
      return reply.code(403).send({ detail: "Path traversal not allowed" });
    }

    // .streaming 标记决定 MJPEG实时流 vs 静态模式
    const streamingMarker = pngPath + ".streaming";
    if (!fs.existsSync(streamingMarker)) {
      try {
        return reply.type("image/png").send(fs.readFileSync(pngPath));
      } catch {
        return reply.code(404).send({ detail: "Artifact not found" });
      }
    }

    serveMpegStream(reply, pngPath, streamingMarker);
  }
);

interface ChatCompletionRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
}

function pickHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function resolveSessionIdentity(
  headers: Record<string, string | string[] | undefined>,
): { userId?: string; chatId?: string } {
  return {
    userId: parseUserId(headers["x-openwebui-user-name"]),
    chatId: pickHeader(headers["x-openwebui-chat-id"]),
  };
}

function buildTurnUserContent(
  latestUserMessage: string,
  sessionRunPath: string,
  kind: "initial" | "follow-up",
): string {
  const context = `session_run_path: ${sessionRunPath}\n\nPlease respond in Chinese`;
  if (kind === "follow-up") {
    return `Follow-up request (build on existing artifacts in session_run_path): ${latestUserMessage}\n\n${context}`;
  }
  return `User request: ${latestUserMessage}\n\n${context}`;
}

function buildTurnInputs(
  latestUserMessage: string,
  sessionRunPath: string,
  kind: "initial" | "follow-up",
): { messages: Array<{ role: string; content: string }> } {
  return {
    messages: [
      {
        role: "user",
        content: buildTurnUserContent(latestUserMessage, sessionRunPath, kind),
      },
    ],
  };
}

app.post<{ Body: ChatCompletionRequest }>("/v1/chat/completions", async (request, reply) => {
  const body = request.body;
  const { userId, chatId } = resolveSessionIdentity(request.headers);

  if (!userId || !chatId) {
    return reply.code(400).send({
      detail:
        "Missing session identity: x-openwebui-user-name and x-openwebui-chat-id headers are required " +
        "(set ENABLE_FORWARD_USER_INFO_HEADERS=true on OpenWebUI).",
    });
  }

  let entry: SessionEntry;
  try {
    entry = _sessions.getOrCreate(userId, chatId);
  } catch {
    return reply.code(400).send({ detail: "Invalid userId" });
  }
  const sessionId = entry.session.sessionId;
  const orchestrator = entry.getOrchestrator();

  const userMessages = body.messages.filter((m) => m.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

  streamManager.beginStream(reply, sessionId);
  const isResume = await hasPendingInterrupt(orchestrator, sessionId);
  if (isResume) streamManager.setResuming(sessionId, true);

  (async () => {
    try {
      if (isResume) {
        await runWorkflowTurn(entry, new Command({ resume: latestUserMessage }));
      } else {
        const snapshot = await orchestrator.getState({ configurable: { thread_id: sessionId } });
        const hasPriorState =
          snapshot.values && Object.keys(snapshot.values as object).length > 0;
        const sessionRunPath = entry.session.sessionRunPath;

        if (hasPriorState && (await isWorkflowDone(orchestrator, sessionId))) {
          await runWorkflowTurn(
            entry,
            buildTurnInputs(latestUserMessage, sessionRunPath, "follow-up"),
          );
        } else if (hasPriorState) {
          streamManager.streamOutput(
            "\n\n⏳ 当前工作流仍在进行中，请等待本轮结束后再发送消息。\n\n",
            sessionId,
          );
        } else {
          await runWorkflowTurn(
            entry,
            buildTurnInputs(latestUserMessage, sessionRunPath, "initial"),
          );
        }
      }
    } catch (e) {
      console.error(`Chat turn failed for session ${sessionId}:`, e);
      streamManager.streamOutput(`❌ Chat turn failed: ${e}\n`, sessionId);
    } finally {
      streamManager.endStream(sessionId);
    }
  })();
});
if (require.main === module) {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });

  console.log(`🚀 ${_manifest.displayName} 将在 ${CONFIG.publicApiBaseUrl} 启动`);

  void (async () => {
    try {
      await initWorkflowCheckpointer();
      startCheckpointVacuumScheduler();
      await fs.promises.mkdir(CONFIG.baseRunPath, { recursive: true });
      await fs.promises.mkdir(CONFIG.memoryRoot, { recursive: true });
      await app.listen({ host: "0.0.0.0", port: CONFIG.apiPort });
      console.log(
        `✅ ${_manifest.displayName} 已启动，监听 0.0.0.0:${CONFIG.apiPort}`
      );
    } catch (err) {
      console.error("Server start failed:", err);
      process.exit(1);
    }
  })();
}

export { app };
