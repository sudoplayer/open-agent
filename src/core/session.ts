import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "config";
import { buildOrchestratorFromManifest } from "core/agent_factory";
import { loadManifest } from "core/manifest_loader";
import { markSessionEvicted } from "infra/workflow_checkpointer";
import { streamManager } from "infra/stream_manager";

function pickHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseUserId(
  header: string | string[] | undefined,
): string | undefined {
  const raw = pickHeader(header);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function sanitizeUserId(userId: string): string {
  const sanitized = userId
    .trim()
    .replace(/\0/g, "")
    .replace(/[\\/]/g, "_");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("Invalid userId for filesystem path");
  }
  return sanitized;
}

export function buildSessionRunPath(userId: string, chatId: string): string {
  return path.join(
    CONFIG.baseRunPath,
    sanitizeUserId(userId),
    chatId,
  );
}

export interface WorkflowSession {
  sessionId: string;
  sessionRunPath: string;
  userId: string;
  chatId: string;
}

type OrchestratorGraph = any;

export class SessionEntry {
  session: WorkflowSession;
  private _orchestrator: OrchestratorGraph | null = null;
  private _runDirEnsured = false;

  constructor(session: WorkflowSession) {
    this.session = session;
  }

  async ensureRunDir(): Promise<void> {
    if (!this.session.sessionRunPath || this._runDirEnsured) {
      return;
    }
    await fs.promises.mkdir(this.session.sessionRunPath, { recursive: true });
    this._runDirEnsured = true;
  }

  getOrchestrator(): OrchestratorGraph {
    if (this._orchestrator === null) {
      const manifest = loadManifest();
      this._orchestrator = buildOrchestratorFromManifest(
        manifest,
        this.session.sessionId,
        this.session.sessionRunPath,
        this.session.userId,
      );
    }
    return this._orchestrator;
  }
}

export class SessionStore {
  _store: Map<string, SessionEntry> = new Map();
  _max: number;
  private _insertOrder: string[] = [];

  constructor() {
    this._max = CONFIG.maxSessions;
  }

  lookup(sessionId: string): SessionEntry | undefined {
    const entry = this._store.get(sessionId);
    if (!entry) return undefined;
    this.touch(sessionId);
    return entry;
  }

  private touch(sessionId: string): void {
    const idx = this._insertOrder.indexOf(sessionId);
    if (idx >= 0) {
      this._insertOrder.splice(idx, 1);
      this._insertOrder.push(sessionId);
    }
  }

  private evictOldest(): void {
    const oldestId = this._insertOrder.shift();
    if (oldestId) {
      this._store.delete(oldestId);
      markSessionEvicted(oldestId);
      streamManager.endStream(oldestId);
    }
  }

  getOrCreate(userId: string, chatId: string): SessionEntry {
    const existing = this._store.get(chatId);
    if (existing) {
      this.touch(chatId);
      return existing;
    }

    const session: WorkflowSession = {
      sessionId: chatId,
      sessionRunPath: buildSessionRunPath(userId, chatId),
      userId,
      chatId,
    };

    const entry = new SessionEntry(session);
    this._store.set(chatId, entry);
    this._insertOrder.push(chatId);

    if (this._store.size > this._max) {
      this.evictOldest();
    }

    return entry;
  }
}
