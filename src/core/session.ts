import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "config";
import { buildOrchestratorFromManifest } from "core/agent_factory";
import { loadManifest } from "core/manifest_loader";
import { releaseSessionCheckpoint } from "infra/workflow_checkpointer";
import { streamManager } from "infra/stream_manager";


export function buildSessionId(userId: string, chatId: string): string {
  const raw = `${userId}:${chatId}`;
  return crypto.createHash("sha256").update(raw, "utf-8").digest("hex").slice(0, 32);
}

export interface WorkflowSession {
  sessionId: string;
  sessionRunPath: string;
}

export function createWorkflowSession(): WorkflowSession {
  return { sessionId: "", sessionRunPath: "" };
}


type OrchestratorGraph = any;

export class SessionEntry {
  session: WorkflowSession;
  private _orchestrator: OrchestratorGraph | null = null;

  constructor(session: WorkflowSession) {
    this.session = session;
    if (session.sessionRunPath) {
      fs.mkdirSync(session.sessionRunPath, { recursive: true });
    }
  }

  getOrchestrator(): OrchestratorGraph {
    if (this._orchestrator === null) {
      const manifest = loadManifest();
      this._orchestrator = buildOrchestratorFromManifest(
        manifest,
        this.session.sessionId,
        this.session.sessionRunPath
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
      releaseSessionCheckpoint(oldestId);
      streamManager.endStream(oldestId);
    }
  }

  getOrCreate(sessionId: string): SessionEntry {
    const existing = this._store.get(sessionId);
    if (existing) {
      this.touch(sessionId);
      return existing;
    }

    const session = createWorkflowSession();
    session.sessionId = sessionId;
    session.sessionRunPath = path.join(CONFIG.baseRunPath, sessionId);

    const entry = new SessionEntry(session);
    this._store.set(sessionId, entry);
    this._insertOrder.push(sessionId);

    if (this._store.size > this._max) {
      this.evictOldest();
    }

    return entry;
  }
}


