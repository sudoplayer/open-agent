import * as fs from "fs";
import * as path from "path";

import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { CONFIG } from "config";

let checkpointer: SqliteSaver | undefined;
let activeCheckpointDbPath: string | undefined;

interface EvictionRecord {
  evictedAt?: string;
  completedAt?: string;
}

type EvictionStore = Record<string, EvictionRecord>;

function resolveCheckpointDbPath(override?: string): string {
  const raw = override ?? activeCheckpointDbPath ?? CONFIG.checkpointDbPath;
  return path.isAbsolute(raw) ? raw : path.join(CONFIG.projectRoot, raw);
}

function evictionsFilePath(checkpointDbPath?: string): string {
  return path.join(path.dirname(resolveCheckpointDbPath(checkpointDbPath)), "evictions.json");
}

function loadEvictions(checkpointDbPath?: string): EvictionStore {
  const filePath = evictionsFilePath(checkpointDbPath);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as EvictionStore;
  } catch (e) {
    console.warn(`Failed to read evictions file (${filePath}):`, e);
    return {};
  }
}

function saveEvictions(store: EvictionStore, checkpointDbPath?: string): void {
  const filePath = evictionsFilePath(checkpointDbPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export async function initWorkflowCheckpointer(dbPathOverride?: string): Promise<void> {
  const dbPath = resolveCheckpointDbPath(dbPathOverride);
  activeCheckpointDbPath = dbPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  checkpointer = SqliteSaver.fromConnString(dbPath);
  // Trigger lazy schema setup (setup() is protected on SqliteSaver).
  await checkpointer.getTuple({ configurable: { thread_id: "__init__" } });
}

export function getWorkflowCheckpointer(): SqliteSaver {
  if (!checkpointer) {
    throw new Error(
      "Workflow checkpointer not initialized. Call initWorkflowCheckpointer() first."
    );
  }
  return checkpointer;
}

export function markSessionEvicted(sessionId: string): void {
  const store = loadEvictions();
  const existing = store[sessionId] ?? {};
  store[sessionId] = { ...existing, evictedAt: new Date(Date.now()).toISOString() };
  saveEvictions(store);
}

export function markSessionCompleted(sessionId: string): void {
  const store = loadEvictions();
  const existing = store[sessionId] ?? {};
  store[sessionId] = { ...existing, completedAt: new Date(Date.now()).toISOString() };
  saveEvictions(store);
}

export async function runCheckpointVacuum(
  options?: { now?: number; checkpointDbPath?: string }
): Promise<string[]> {
  const cp = getWorkflowCheckpointer();
  const now = options?.now ?? Date.now();
  const retentionMs = CONFIG.checkpointRetentionDays * 24 * 60 * 60 * 1000;
  const store = loadEvictions(options?.checkpointDbPath);
  const deleted: string[] = [];

  for (const [sessionId, record] of Object.entries(store)) {
    const evictedMs = record.evictedAt ? new Date(record.evictedAt).getTime() : NaN;
    const completedMs = record.completedAt ? new Date(record.completedAt).getTime() : NaN;

    const evictedExpired = !Number.isNaN(evictedMs) && now - evictedMs >= retentionMs;
    const completedExpired = !Number.isNaN(completedMs) && now - completedMs >= retentionMs;

    if (!evictedExpired && !completedExpired) continue;

    await cp.deleteThread(sessionId);
    delete store[sessionId];
    deleted.push(sessionId);
  }

  if (deleted.length > 0) {
    saveEvictions(store, options?.checkpointDbPath);
  }

  return deleted;
}

let vacuumTimer: ReturnType<typeof setInterval> | undefined;

export function startCheckpointVacuumScheduler(): void {
  if (vacuumTimer) return;

  void runCheckpointVacuum().catch((e) => {
    console.warn("Initial checkpoint vacuum failed:", e);
  });

  vacuumTimer = setInterval(() => {
    void runCheckpointVacuum().catch((e) => {
      console.warn("Scheduled checkpoint vacuum failed:", e);
    });
  }, CONFIG.checkpointVacuumIntervalMs);

  if (typeof vacuumTimer.unref === "function") {
    vacuumTimer.unref();
  }
}

export function stopCheckpointVacuumScheduler(): void {
  if (vacuumTimer) {
    clearInterval(vacuumTimer);
    vacuumTimer = undefined;
  }
}
