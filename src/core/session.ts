import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "config";
import { buildOrchestratorFromManifest } from "core/agent_factory";
import { loadManifest } from "core/manifest_loader";
import { markSessionEvicted } from "infra/workflow_checkpointer";
import { streamManager } from "infra/stream_manager";


export function buildSessionId(userId: string, chatId: string): string {
  const raw = `${userId}:${chatId}`;
  return crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 32);
}

export interface WorkflowSession {
  sessionId: string;
  sessionRunPath: string;
  userId: string;
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
        this.session.userId
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

  getOrCreate(sessionId: string, userId: string): SessionEntry {
    const existing = this._store.get(sessionId);
    if (existing) {
      this.touch(sessionId);
      return existing;
    }

    const session: WorkflowSession = {
      sessionId,
      sessionRunPath: path.join(CONFIG.baseRunPath, sessionId),
      userId,
    };

    const entry = new SessionEntry(session);
    this._store.set(sessionId, entry);
    this._insertOrder.push(sessionId);

    if (this._store.size > this._max) {
      this.evictOldest();
    }

    return entry;
  }
}
