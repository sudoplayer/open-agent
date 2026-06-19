import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";

import { CONFIG } from "config";
import { SessionEntry, SessionStore, buildSessionId } from "core/session";
import { loadManifest } from "core/manifest_loader";
import { streamManager } from "infra/stream_manager";
import { runUntilInterrupt, hasPendingInterrupt, isWorkflowDone, makeConfig } from "agents/runner";
import { Command } from "@langchain/langgraph";

const _manifest = loadManifest();

const _sessions = new SessionStore();

async function runWorkflowTurn(entry: SessionEntry, cmdOrInputs: unknown): Promise<void> {
  const sessionId = entry.session.sessionId;
  const orchestrator = entry.getOrchestrator();
  try {
    await runUntilInterrupt(orchestrator, cmdOrInputs, sessionId);
    if (await isWorkflowDone(orchestrator, sessionId)) {
      streamManager.streamOutput("\n\n✅ Workflow completed!\n\n", sessionId);
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

app.get<{ Params: { sessionId: string; "*": string } }>(
  "/v1/sessions/:sessionId/live/*",
  async (request, reply) => {
    const { sessionId } = request.params;
    const filename = request.params["*"];

    const sessionDir = path.resolve(path.join(CONFIG.baseRunPath, sessionId));
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

    // MJPEG 实时流模式
    const boundary = "frame";
    const POLL_INTERVAL_MS = 200;
    const STALE_LIMIT = 50;        // 0.2 s × 50 = 10 s 无变化 → 结束流
    const MAX_WAIT_MS = 300_000;   // 等待文件出现的最长时间
    const MAX_DURATION_MS = 3_600_000;

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

    // 清理 .streaming 标记，让后续请求走静态模式
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

      // 文件尚未出现且未超时，静默等待
      if (!fs.existsSync(pngPath) && elapsed < MAX_WAIT_MS) return;

      sendFrame();

      if (staleCount >= STALE_LIMIT) {
        clearInterval(timer);
        cleanupStreamingMarker();
        try {
          // 发送最后一帧后直接关闭连接
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
);

app.get<{ Querystring: { path?: string; dirs_only?: string } }>("/v1/fs/list", async (request, reply) => {
  const q = request.query as { path?: string; dirs_only?: string };
  const reqPath = q.path ?? os.homedir();
  const dirsOnly = q.dirs_only === "true";
  const resolved = path.resolve(reqPath);
  if (!resolved.startsWith(os.homedir())) {
    return reply.code(403).send({ detail: "Path not allowed" });
  }
  try {
    const entries = fs
      .readdirSync(resolved, { withFileTypes: true })
      .filter((e) => !e.name.startsWith(".") && (!dirsOnly || e.isDirectory()))
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { current_path: resolved, entries };
  } catch {
    return reply.code(404).send({ detail: "Path not found or not accessible" });
  }
});

interface ChatCompletionRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  user_id?: string;
  chat_id?: string;
}

app.post<{ Body: ChatCompletionRequest }>("/v1/chat/completions", async (request, reply) => {
  const body = request.body;

  if (!body.user_id || !body.chat_id) {
    return reply.code(400).send({
      detail: "Missing session identity: both user_id and chat_id are required.",
    });
  }

  const sessionId = buildSessionId(body.user_id, body.chat_id);
  const entry = _sessions.getOrCreate(sessionId);
  const orchestrator = entry.getOrchestrator();

  const userMessages = body.messages.filter((m) => m.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

  streamManager.beginStream(reply, sessionId);
  streamManager.streamOutput(`\n\n🔑 session_id: ${sessionId}\n\n`, sessionId);

  const isResume = await hasPendingInterrupt(orchestrator, sessionId);
  if (isResume) streamManager.setResuming(sessionId, true);

  (async () => {
    try {
      if (isResume) {
        await runWorkflowTurn(entry, new Command({ resume: latestUserMessage }));
      } else {
        const snapshot = await orchestrator.getState(makeConfig(sessionId));
        if (snapshot.values && Object.keys(snapshot.values as object).length > 0) {
          streamManager.streamOutput("\n\n❌ Please start a new conversation.\n\n", sessionId);
        } else {
          const inputs = {
            messages: [
              {
                role: "user",
                content: `User request: ${latestUserMessage}\n\nsession_run_path: ${entry.session.sessionRunPath}\n\nPlease respond in Chinese`,
              },
            ],
          };
          await runWorkflowTurn(entry, inputs);
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

  app
    .listen({ host: "0.0.0.0", port: CONFIG.apiPort })
    .then(() => {
      console.log(
        `✅ ${_manifest.displayName} 已启动，监听 0.0.0.0:${CONFIG.apiPort}`
      );
    })
    .catch((err) => {
      console.error("Server start failed:", err);
      process.exit(1);
    });
}

export { app };
