/**
 * Minimal OpenAI-compatible streaming LLM stub for platform stress tests.
 * Listens on MOCK_PORT (default 9999). No .env required — started by run_l1_mock.sh.
 */
import * as http from "http";

const PORT = Number(process.env.MOCK_PORT ?? 9999);
const CHUNK_DELAY_MS = Number(process.env.MOCK_CHUNK_DELAY_MS ?? 50);
const CHUNK_COUNT = Number(process.env.MOCK_CHUNK_COUNT ?? 0);
const MODEL = process.env.MOCK_MODEL_NAME ?? "deepseek-v4-flash";

let requestCount = 0;

interface ChatRequest {
  model?: string;
  messages?: Array<{ role: string; content?: string | null }>;
  stream?: boolean;
  tools?: unknown[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeChunk(
  id: string,
  delta: Record<string, unknown>,
  finishReason: string | null = null
): string {
  return (
    "data: " +
    JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: MODEL,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    }) +
    "\n\n"
  );
}

function makeJsonCompletion(id: string, content: string) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

async function writeStreamingResponse(
  res: http.ServerResponse,
  id: string,
  content: string
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(makeChunk(id, { role: "assistant" }));
  await sleep(CHUNK_DELAY_MS);

  const chunks =
    CHUNK_COUNT > 0
      ? Array.from({ length: CHUNK_COUNT }, (_, i) => `chunk${i} `)
      : content.split(/\s+/).filter(Boolean);
  const payload = chunks.length > 0 ? chunks : [content];

  for (const piece of payload) {
    res.write(makeChunk(id, { content: piece.endsWith(" ") ? piece : piece + " " }));
    await sleep(CHUNK_DELAY_MS);
  }

  res.write(makeChunk(id, {}, "stop"));
  res.write("data: [DONE]\n\n");
  res.end();
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", requests: requestCount }));
    return;
  }

  if (req.method === "POST" && url === "/v1/chat/completions") {
    requestCount += 1;
    let body: ChatRequest = {};
    try {
      const raw = await readBody(req);
      body = raw ? (JSON.parse(raw) as ChatRequest) : {};
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid JSON" } }));
      return;
    }

    const id = `chatcmpl-mock-${requestCount}`;
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const content = hasTools
      ? "压测 mock：任务已完成，无需进一步操作。"
      : "压测 mock 响应。";

    if (body.stream) {
      await writeStreamingResponse(res, id, content);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(makeJsonCompletion(id, content)));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "Not found" } }));
});

server.listen(PORT, "127.0.0.1", () => {
  const approxMs =
    CHUNK_COUNT > 0 ? (CHUNK_COUNT + 1) * CHUNK_DELAY_MS : "word-count × delay";
  console.log(
    `Mock LLM listening on http://127.0.0.1:${PORT} (delay=${CHUNK_DELAY_MS}ms, chunks=${CHUNK_COUNT || "auto"}, ~${approxMs}ms/stream)`
  );
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
